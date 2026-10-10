/** @jsxImportSource @opentui/solid */

import type { TuiDialogStack, TuiPlugin, TuiPluginApi, TuiSlotContext, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, For, Show } from "solid-js"
import { evidenceLabel, statusDetails, statusLabel } from "../core/display.js"
import { createT, detectLang, LANG_META, type LangCode } from "../i18n.js"
import { DEFAULT_PROFILE, resolveProfile, scheduleSnapshot } from "../profiles.js"
import type { PeakStatus } from "../types.js"

const KV = {
  lang: "deepseek-peak.lang",
  sidebar: "deepseek-peak.sidebar",
  evidence: "deepseek-peak.evidence",
  footer: "deepseek-peak.footer",
  toast: "deepseek-peak.toast",
  timezone: "deepseek-peak.timezone",
} as const

const REFRESH_MS = 30_000

function stringList(value: unknown, fallback: readonly string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [...fallback]
}

interface SessionModel {
  providerID: string
  id: string
}

function createStatus(sessionID: string, model: SessionModel | undefined): PeakStatus {
  const now = new Date()
  // Without model information (V1 surfaces it only per session) fall back to
  // the DeepSeek schedule, which is what the standalone build always showed.
  const profile = model
    ? resolveProfile({ providerID: model.providerID, modelID: model.id })
    : DEFAULT_PROFILE
  const providerID = model?.providerID ?? "deepseek"
  const modelID = model?.id ?? "deepseek"
  if (!profile) {
    return {
      sessionID,
      providerID,
      modelID,
      providerLabel: providerID,
      providerShort: providerID,
      period: "unknown",
      scheduledPeriod: "unknown",
      source: "none",
      phase: "request",
      mismatch: false,
      observedAt: now.getTime(),
      evidence: `No official peak/off-peak pricing is known for ${providerID}`,
    }
  }
  const snapshot = scheduleSnapshot(profile, now)
  return {
    sessionID,
    providerID,
    modelID,
    providerLabel: profile.label,
    providerShort: profile.shortLabel,
    period: snapshot.period,
    scheduledPeriod: snapshot.period,
    source: "official-schedule",
    phase: "request",
    mismatch: false,
    observedAt: now.getTime(),
    evidence: snapshot.holiday ? `Chinese public holiday: ${snapshot.holiday}` : profile.evidence,
    ...(snapshot.holiday !== undefined ? { holiday: snapshot.holiday } : {}),
    schedule: snapshot.schedule,
  }
}

function StatusPanel(props: {
  colors: () => TuiThemeCurrent
  status: () => PeakStatus | undefined
  lang: () => LangCode
  evidence: () => boolean
  timeZone: () => string | undefined
}) {
  const t = createT(props.lang)
  const segments = createMemo(() => {
    const current = props.status()
    if (!current || current.period === "unknown") return []
    const theme = props.colors()
    const peak = current.period === "peak"
    const out = [
      { text: `${current.providerLabel} `, color: theme.textMuted },
      { text: `● ${t(peak ? "period.peak" : "period.offPeak")}`, color: peak ? theme.text : theme.textMuted },
    ]
    if (current.source === "api-header") out.push({ text: " · API", color: theme.textMuted })
    if (current.mismatch) out.push({ text: ` · ${t("label.mismatch")} ⚠`, color: theme.warning })
    return out
  })
  return (
    <Show when={props.status()}>
      {(status) => (
        <box flexDirection="column" alignItems="flex-start" alignSelf="flex-start">
          <text>
            <For each={segments()}>{(segment) => <span style={{ fg: segment.color }}>{segment.text}</span>}</For>
          </text>
          <Show when={props.evidence()}>
            <text wrapMode="none" fg={props.colors().textMuted}>
              {evidenceLabel(status(), t, { lang: props.lang(), timeZone: props.timeZone() })}
            </text>
          </Show>
        </box>
      )}
    </Show>
  )
}

function StatusFooter(props: { colors: () => TuiThemeCurrent; status: () => PeakStatus | undefined; lang: () => LangCode }) {
  const t = createT(props.lang)
  const segments = createMemo(() => {
    const current = props.status()
    if (!current || current.period === "unknown") return []
    const theme = props.colors()
    const peak = current.period === "peak"
    return [
      {
        text: `${current.providerShort} ${t(peak ? "period.peak" : "period.offPeak")}`,
        color: peak ? theme.text : theme.textMuted,
      },
      { text: " ·", color: theme.textMuted },
    ]
  })
  return (
    <Show when={props.status()}>
      <text>
        <For each={segments()}>{(segment) => <span style={{ fg: segment.color }}>{segment.text}</span>}</For>
      </text>
    </Show>
  )
}

/**
 * V1 TUI plugin: OpenCode V1 has no server-side hooks here, so the official
 * schedule alone drives the indicator (no API header source of truth). The
 * pricing profile is still resolved per session from provider and model.
 */
export const tui: TuiPlugin = async (api: TuiPluginApi, options) => {
  const allowed = new Set(
    stringList((options as Record<string, unknown> | undefined)?.providerIDs, []).map((id) => id.toLowerCase()),
  )

  const [lang, setLang] = createSignal<LangCode>(detectLang())
  const [showSidebar, setShowSidebar] = createSignal(true)
  const [showEvidence, setShowEvidence] = createSignal(true)
  const [showFooter, setShowFooter] = createSignal(true)
  const [showToast, setShowToast] = createSignal(true)
  const [utcZone, setUtcZone] = createSignal(false)
  const [statuses, setStatuses] = createSignal<Record<string, PeakStatus>>({})
  const [revision, setRevision] = createSignal(0)
  const lastToast = new Map<string, string>()
  const t = createT(lang)
  const timeZone = () => (utcZone() ? "UTC" : undefined)

  // KV may not be ready during setup; restore persisted preferences when it is.
  const restore = () => {
    const stored = String(api.kv.get(KV.lang, "") ?? "")
    if (LANG_META.some((meta) => meta.code === stored)) setLang(stored as LangCode)
    setShowSidebar(api.kv.get<boolean>(KV.sidebar, true) !== false)
    setShowEvidence(api.kv.get<boolean>(KV.evidence, true) !== false)
    setShowFooter(api.kv.get<boolean>(KV.footer, true) !== false)
    setShowToast(api.kv.get<boolean>(KV.toast, true) !== false)
    setUtcZone(String(api.kv.get(KV.timezone, "local") ?? "local") === "utc")
  }
  if (api.kv.ready) {
    restore()
  } else {
    const timer = setInterval(() => {
      if (!api.kv.ready) return
      clearInterval(timer)
      restore()
      setRevision((value) => value + 1)
    }, 100)
    api.lifecycle.onDispose(() => clearInterval(timer))
  }

  const sessionModel = (sessionID: string): SessionModel | undefined => {
    if (!sessionID) return undefined
    try {
      const model = api.state.session.get(sessionID)?.model
      return model ? { providerID: model.providerID, id: model.id } : undefined
    } catch {
      return undefined
    }
  }

  const refreshOne = (sessionID: string) => {
    const next = createStatus(sessionID, sessionModel(sessionID))
    setStatuses((current) => ({ ...current, [sessionID]: next }))
    setRevision((value) => value + 1)
    if (next.period === "unknown" || !showToast()) return
    const fingerprint = `${next.period}:${next.mismatch}`
    if (lastToast.get(sessionID) === fingerprint) return
    lastToast.set(sessionID, fingerprint)
    api.ui.toast({
      title: t("toast.title"),
      message: statusLabel(next, t),
      variant: next.period === "peak" ? "warning" : "success",
      duration: 4500,
    })
  }

  const refreshAll = () => {
    for (const sessionID of Object.keys(statuses())) refreshOne(sessionID)
  }

  // Sessions are discovered lazily: the first render of a slot registers it.
  const ensure = (sessionID: string) => {
    revision()
    if (!sessionID || statuses()[sessionID]) return
    refreshOne(sessionID)
  }

  const timer = setInterval(refreshAll, REFRESH_MS)
  api.lifecycle.onDispose(() => clearInterval(timer))
  const offSession = api.event.on("session.updated", refreshAll)
  api.lifecycle.onDispose(offSession)

  const statusFor = (sessionID: string) => {
    revision()
    return statuses()[sessionID]
  }
  const relevant = (sessionID: string) => {
    revision()
    const providerID = sessionModel(sessionID)?.providerID
    if (allowed.size === 0) return true
    return providerID !== undefined && allowed.has(providerID.toLowerCase())
  }
  const visible = (sessionID: string) => {
    const status = statusFor(sessionID)
    return status !== undefined && status.period !== "unknown"
  }

  api.slots.register({
    order: 60,
    slots: {
      sidebar_content(ctx: TuiSlotContext, input: { session_id: string }) {
        const sessionID = input.session_id
        ensure(sessionID)
        return (
          <Show when={showSidebar() && relevant(sessionID) && visible(sessionID)}>
            <StatusPanel
              colors={() => ctx.theme.current}
              status={() => statusFor(sessionID)}
              lang={lang}
              evidence={() => showEvidence()}
              timeZone={timeZone}
            />
          </Show>
        )
      },
    },
  })

  api.slots.register({
    order: 60,
    slots: {
      session_prompt_right(ctx: TuiSlotContext, input: { session_id: string }) {
        const sessionID = input.session_id
        ensure(sessionID)
        return (
          <Show when={showFooter() && relevant(sessionID) && visible(sessionID)}>
            <StatusFooter colors={() => ctx.theme.current} status={() => statusFor(sessionID)} lang={lang} />
          </Show>
        )
      },
    },
  })

  const onOff = (value: boolean) => (value ? t("settings.on") : t("settings.off"))
  const openSections = (dialog?: TuiDialogStack) => {
    dialog?.replace(() => (
      <api.ui.DialogSelect
        title={t("settings.title")}
        options={[
          { title: `${t("settings.sidebar")}: ${onOff(showSidebar())}`, value: "sidebar" },
          { title: `${t("settings.evidence")}: ${onOff(showEvidence())}`, value: "evidence" },
          { title: `${t("settings.footer")}: ${onOff(showFooter())}`, value: "footer" },
          { title: `${t("settings.toast")}: ${onOff(showToast())}`, value: "toast" },
          {
            title: `${t("settings.timezone")}: ${utcZone() ? t("timezone.utc") : t("timezone.local")}`,
            value: "timezone",
          },
        ]}
        onSelect={(option) => {
          if (option.value === "sidebar") {
            const value = !showSidebar()
            setShowSidebar(value)
            api.kv.set(KV.sidebar, value)
          } else if (option.value === "evidence") {
            const value = !showEvidence()
            setShowEvidence(value)
            api.kv.set(KV.evidence, value)
          } else if (option.value === "footer") {
            const value = !showFooter()
            setShowFooter(value)
            api.kv.set(KV.footer, value)
          } else if (option.value === "toast") {
            const value = !showToast()
            setShowToast(value)
            api.kv.set(KV.toast, value)
          } else if (option.value === "timezone") {
            const value = !utcZone()
            setUtcZone(value)
            api.kv.set(KV.timezone, value ? "utc" : "local")
          }
          openSections(dialog)
        }}
      />
    ))
  }

  api.command?.register(() => [
    {
      title: t("command.status.title"),
      value: "deepseek-peak.status",
      description: t("command.status.description"),
      slash: { name: "deepseek-peak" },
      onSelect: (dialog) => {
        const current = Object.values(statuses())[0]
        const message = current
          ? statusDetails(current, t, { lang: lang(), timeZone: timeZone() }).join("\n")
          : t("status.noStatus")
        dialog?.replace(() => <api.ui.DialogAlert title={t("status.title")} message={message} />)
      },
    },
    {
      title: t("command.sections.title"),
      value: "deepseek-peak.sections",
      description: t("command.sections.description"),
      slash: { name: "deepseek-peak-sections" },
      onSelect: (dialog) => openSections(dialog),
    },
    {
      title: t("command.lang.title"),
      value: "deepseek-peak.lang",
      description: t("command.lang.description"),
      slash: { name: "deepseek-peak-lang" },
      onSelect: (dialog) => {
        dialog?.replace(() => (
          <api.ui.DialogSelect
            title={t("settings.lang")}
            options={LANG_META.map((meta) => ({ title: meta.label, value: meta.code }))}
            current={lang()}
            onSelect={(option) => {
              const picked = option.value as LangCode
              setLang(picked)
              api.kv.set(KV.lang, picked)
              dialog?.clear()
            }}
          />
        ))
      },
    },
  ])
}