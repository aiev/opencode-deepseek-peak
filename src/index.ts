import { Plugin } from "@opencode/plugin"
import { DEFAULT_SIGNAL_HEADERS, readApiPricePeriod } from "./api-signal.js"
import { DeepSeekPeakRpc } from "./rpc.js"
import { scheduleInfo } from "./schedule.js"
import type { PeakStatus } from "./types.js"

function stringList(value: unknown, fallback: readonly string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [...fallback]
}

export default Plugin.define({
  id: "opencode-deepseek-peak",
  async setup(context) {
    const providerIDs = new Set(stringList(context.options.providerIDs, ["deepseek"]))
    const signalHeaders = stringList(context.options.apiSignalHeaders, DEFAULT_SIGNAL_HEADERS)
    const configuredTtl = Number(context.options.apiSignalTtlMs)
    const apiSignalTtlMs = Number.isFinite(configuredTtl) && configuredTtl >= 0
      ? configuredTtl
      : 5 * 60 * 1000
    const statuses = new Map<string, PeakStatus>()
    const apiSignals = new Map<string, { period: PeakStatus["period"]; evidence: string; observedAt: number }>()

    const rpc = await context.rpc.register(DeepSeekPeakRpc, {
      status: async (input) => {
        const { sessionID } = input as { sessionID: string }
        const status = statuses.get(sessionID)
        return status ? { found: true, status } : { found: false }
      },
      // Lets the TUI show the current period as soon as a session opens with a
      // DeepSeek model selected, without waiting for the first request.
      preview: async (input) => {
        const { sessionID } = input as { sessionID: string }
        const observed = statuses.get(sessionID)
        if (observed) return { found: true, status: observed }
        try {
          const session = await context.session.get({ sessionID })
          const model = session.model
          if (!model || !isDeepSeek(model.providerID)) return { found: false }
          const schedule = scheduleInfo(new Date())
          const evidence = schedule.holiday
            ? `Chinese public holiday: ${schedule.holiday} (no request observed yet)`
            : "Current schedule (no request observed yet)"
          return {
            found: true,
            status: {
              sessionID,
              providerID: model.providerID,
              modelID: model.id,
              period: schedule.period,
              scheduledPeriod: schedule.period,
              source: "official-schedule",
              phase: "request",
              mismatch: false,
              observedAt: Date.now(),
              evidence,
              holiday: schedule.holiday,
            },
          }
        } catch {
          return { found: false }
        }
      },
    })

    const publish = async (status: PeakStatus) => {
      statuses.set(status.sessionID, status)
      await rpc.events.emit("updated", status as unknown as Readonly<Record<string, unknown>>)
    }

    const isDeepSeek = (providerID: string) => providerIDs.has(providerID)
    const modelKey = (providerID: string, modelID: string) => `${providerID}/${modelID}`

    const stopRequest = await context.session.hook("model.request", async (event) => {
      if (event.kind !== "primary" || !isDeepSeek(event.model.providerID)) return
      const now = Date.now()
      const schedule = scheduleInfo(new Date(now))
      const cached = apiSignals.get(modelKey(event.model.providerID, event.model.id))
      const api = cached && now - cached.observedAt <= apiSignalTtlMs ? cached : undefined
      await publish({
        sessionID: event.sessionID,
        providerID: event.model.providerID,
        modelID: event.model.id,
        period: api?.period ?? schedule.period,
        scheduledPeriod: schedule.period,
        source: api ? "api-header" : "official-schedule",
        phase: "request",
        mismatch: api ? api.period !== schedule.period : false,
        observedAt: now,
        evidence: api
          ? `${api.evidence} (cached)`
          : schedule.holiday
            ? `Chinese public holiday: ${schedule.holiday}`
            : "DeepSeek official UTC pricing schedule",
        holiday: schedule.holiday,
      })
    })

    const stopResponse = await context.session.hook("http.response", async (event) => {
      if (event.kind !== "primary" || !isDeepSeek(event.model.providerID)) return
      const api = readApiPricePeriod(event.response.headers, signalHeaders)
      if (!api) return
      const now = Date.now()
      const schedule = scheduleInfo(new Date(now))
      apiSignals.set(modelKey(event.model.providerID, event.model.id), {
        ...api,
        observedAt: now,
      })
      await publish({
        sessionID: event.sessionID,
        providerID: event.model.providerID,
        modelID: event.model.id,
        period: api.period,
        scheduledPeriod: schedule.period,
        source: "api-header",
        phase: "response",
        mismatch: api.period !== schedule.period,
        observedAt: now,
        evidence: api.evidence,
        holiday: schedule.holiday,
      })
    })

    return async () => {
      await stopRequest.dispose()
      await stopResponse.dispose()
      await rpc.dispose()
    }
  },
})
