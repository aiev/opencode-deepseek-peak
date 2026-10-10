import { Plugin } from "@opencode/plugin"
import { DEFAULT_SIGNAL_HEADERS, readApiPricePeriod } from "./api-signal.js"
import { resolveProfile, scheduleSnapshot, type PricingProfile } from "./profiles.js"
import { DeepSeekPeakRpc } from "./rpc.js"
import type { PeakStatus, PricePeriod, StatusPeriod } from "./types.js"

function stringList(value: unknown, fallback: readonly string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [...fallback]
}

interface ProviderFacts {
  baseURL?: string
  name?: string
}

interface Signal {
  period: PricePeriod
  evidence: string
}

export default Plugin.define({
  id: "opencode-deepseek-peak",
  async setup(context) {
    // Optional allowlist. Empty means every provider is observed and the
    // pricing profile is resolved automatically.
    const allowedProviders = new Set(
      stringList(context.options.providerIDs, []).map((id) => id.toLowerCase()),
    )
    const signalHeaders = stringList(context.options.apiSignalHeaders, DEFAULT_SIGNAL_HEADERS)
    const configuredTtl = Number(context.options.apiSignalTtlMs)
    const apiSignalTtlMs = Number.isFinite(configuredTtl) && configuredTtl >= 0
      ? configuredTtl
      : 5 * 60 * 1000
    const statuses = new Map<string, PeakStatus>()
    const apiSignals = new Map<string, Signal & { observedAt: number }>()
    const providerFacts = new Map<string, Promise<ProviderFacts>>()

    const isAllowed = (providerID: string) =>
      allowedProviders.size === 0 || allowedProviders.has(providerID.toLowerCase())
    const modelKey = (providerID: string, modelID: string) => `${providerID}/${modelID}`

    const factsFor = (providerID: string): Promise<ProviderFacts> => {
      let pending = providerFacts.get(providerID)
      if (!pending) {
        pending = (async (): Promise<ProviderFacts> => {
          try {
            if (typeof context.provider?.get !== "function") return {}
            const result = await context.provider.get({ providerID })
            const info = result.data
            const baseURL = typeof info?.settings?.baseURL === "string" ? info.settings.baseURL : undefined
            return {
              ...(baseURL ? { baseURL } : {}),
              ...(typeof info?.name === "string" && info.name ? { name: info.name } : {}),
            }
          } catch {
            return {}
          }
        })()
        providerFacts.set(providerID, pending)
      }
      return pending
    }

    const lookupSignal = (
      providerID: string,
      modelID: string,
      now: number,
    ): { signal?: Signal; cached: boolean } => {
      const stored = apiSignals.get(modelKey(providerID, modelID))
      if (stored && now - stored.observedAt <= apiSignalTtlMs) return { signal: stored, cached: true }
      return { cached: false }
    }

    const composeStatus = (input: {
      sessionID: string
      providerID: string
      modelID: string
      profile?: PricingProfile
      facts: ProviderFacts
      signal?: Signal
      cached?: boolean
      phase: "request" | "response"
      preview?: boolean
    }): PeakStatus => {
      const now = Date.now()
      const snapshot = input.profile ? scheduleSnapshot(input.profile, new Date(now)) : undefined
      const providerLabel = input.profile?.label ?? input.facts.name ?? input.providerID
      const providerShort = input.profile?.shortLabel ?? providerLabel
      const scheduled: StatusPeriod = snapshot?.period ?? "unknown"
      const base: PeakStatus = {
        sessionID: input.sessionID,
        providerID: input.providerID,
        modelID: input.modelID,
        providerLabel,
        providerShort,
        period: "unknown",
        scheduledPeriod: scheduled,
        source: "none",
        phase: input.phase,
        mismatch: false,
        observedAt: now,
        evidence: `No official peak/off-peak pricing is known for ${providerLabel}`,
        ...(snapshot?.holiday !== undefined ? { holiday: snapshot.holiday } : {}),
        ...(snapshot ? { schedule: snapshot.schedule } : {}),
      }
      if (input.signal) {
        return {
          ...base,
          period: input.signal.period,
          source: "api-header",
          mismatch: snapshot ? input.signal.period !== snapshot.period : false,
          evidence: input.signal.evidence,
          ...(input.cached ? { cached: true } : {}),
        }
      }
      if (snapshot && input.profile) {
        return {
          ...base,
          period: snapshot.period,
          scheduledPeriod: snapshot.period,
          source: "official-schedule",
          evidence: snapshot.holiday
            ? `Chinese public holiday: ${snapshot.holiday}`
            : input.profile.evidence,
          ...(input.preview ? { preview: true } : {}),
        }
      }
      return base
    }

    const rpc = await context.rpc.register(DeepSeekPeakRpc, {
      status: async (input) => {
        const { sessionID } = input as { sessionID: string }
        const status = statuses.get(sessionID)
        return status ? { found: true, status } : { found: false }
      },
      // Re-synthesizes the current period on every call so an idle TUI can
      // refresh itself without waiting for a request. A recent API header
      // still wins over the official schedule.
      preview: async (input) => {
        const { sessionID } = input as { sessionID: string }
        try {
          const session = await context.session.get({ sessionID })
          const model = session.model
          if (!model || !isAllowed(model.providerID)) return { found: false }
          const facts = await factsFor(model.providerID)
          const profile = resolveProfile({
            providerID: model.providerID,
            modelID: model.id,
            baseURL: facts.baseURL,
          })
          const now = Date.now()
          const { signal } = lookupSignal(model.providerID, model.id, now)
          const observed = statuses.get(sessionID)
          const status = composeStatus({
            sessionID,
            providerID: model.providerID,
            modelID: model.id,
            ...(profile ? { profile } : {}),
            facts,
            ...(signal ? { signal } : {}),
            phase: observed?.phase ?? "request",
            preview: observed === undefined,
          })
          return { found: true, status }
        } catch {
          return { found: false }
        }
      },
    })

    const publish = async (status: PeakStatus) => {
      statuses.set(status.sessionID, status)
      await rpc.events.emit("updated", status as unknown as Readonly<Record<string, unknown>>)
    }

    const stopRequest = await context.session.hook("model.request", async (event) => {
      if (event.kind !== "primary" || !isAllowed(event.model.providerID)) return
      const providerID = event.model.providerID
      const modelID = event.model.id
      const facts = await factsFor(providerID)
      const profile = resolveProfile({
        providerID,
        modelID,
        baseURL: event.baseURL ?? facts.baseURL,
      })
      const now = Date.now()
      const { signal, cached } = lookupSignal(providerID, modelID, now)
      await publish(composeStatus({
        sessionID: event.sessionID,
        providerID,
        modelID,
        ...(profile ? { profile } : {}),
        facts,
        ...(signal ? { signal } : {}),
        ...(cached && signal ? { cached: true } : {}),
        phase: "request",
      }))
    })

    const stopResponse = await context.session.hook("http.response", async (event) => {
      if (event.kind !== "primary" || !isAllowed(event.model.providerID)) return
      const api = readApiPricePeriod(event.response.headers, signalHeaders)
      if (!api) return
      const providerID = event.model.providerID
      const modelID = event.model.id
      apiSignals.set(modelKey(providerID, modelID), {
        period: api.period,
        evidence: api.evidence,
        observedAt: Date.now(),
      })
      const facts = await factsFor(providerID)
      const profile = resolveProfile({
        providerID,
        modelID,
        baseURL: event.request.url || facts.baseURL,
      })
      await publish(composeStatus({
        sessionID: event.sessionID,
        providerID,
        modelID,
        ...(profile ? { profile } : {}),
        facts,
        signal: api,
        phase: "response",
      }))
    })

    return async () => {
      await stopRequest.dispose()
      await stopResponse.dispose()
      await rpc.dispose()
    }
  },
})