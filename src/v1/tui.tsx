/** @jsxImportSource @opentui/solid */

import type { TuiDialogStack, TuiPlugin, TuiPluginApi, TuiSlotContext, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, For, Show } from "solid-js"
import { evidenceLabel, statusLabel, transitionLabel } from "../core/display.js"
import { createT, detectLang, LANG_META, type LangCode } from "../i18n.js"
import { scheduleInfo } from "../schedule.js"
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

function createStatus(sessionID: string): PeakStatus {
  const schedule = scheduleInfo(new Date())
  return {
    sessionID,
    providerID: "deepseek",
    modelID: "deepseek",
    period: schedule.period,
    scheduledPeriod: schedule.period,
    source: "official-schedule",
    phase: "request",
    mismatch: false,
    observedAt: Date.now(),
    evidence: schedule.holiday ? `Chinese public holiday: ${schedule.holiday}` : "DeepSeek official UTC pricing schedule",
    ...(schedule.holiday !== undefined ? { holiday: schedule.holiday } : {}),
  }
}

function StatusPanel(props: {
  colors: () => TuiThemeCurrent
  status: () => PeakStatus
  lang: () => LangCode
  evidence: () => boolean
  timeZone: () => string | undefined
}) {
  const t = createT(props.lang)
  const segments = createMemo(() => {
    const current = props.status()
    const theme = props.colors()
    const peak = current.period === "peak"
    const out = [
      { text: "DeepSeek ", color: theme.textMuted },
      { text: `● ${t(peak ? "period.peak" : "period.offPeak")}`, color: peak ? theme.text : theme.textMuted },
    ]
    if (current.mismatch) out.push({ text: ` · ${t("label.mismatch")} ⚠`, color: theme.warning })
    return out
  })
  return (
    <box flexDirection="column" alignItems="flex-start" alignSelf="flex-start">
      <text>
        <For each={segments()}>{(segment) => <span style={{ fg: segment.color }}>{segment.text}</span>}</For>
      </text>
      <Show when={props.evidence()}>
        <text wrapMode="none" fg={props.colors().textMuted}>
          {evidenceLabel(props.status(), t, { lang: props.lang(), timeZone: props.timeZone() })}
        </text>
      </Show>
    </box>
  )
}

function StatusFooter(props: { colors: () => TuiThemeCurrent; status: () => PeakStatus; lang: () => LangCode }) {
  const t = createT(props.lang)
  const segments = createMemo(() => {
    const current = props.status()
    const theme = props.colors()
    const peak = current.period === "peak"
    return [
      { text: `DS ${t(peak ? "period.peak" : "period.offPeak")}`, color: peak ? theme.text : theme.textMuted },
      { text: " ·", color: theme.textMuted },
    ]
  })
  return (
    <text>
      <For each={segments()}>{(segment) => <span style={{ fg: segment.color }}>{segment.text}</span>}</For>
    </text>
  )
}

/**
 * V1 TUI plugin: OpenCode V1 has no server-side hooks here, so the official
 * schedule alone drives the indicator (no API header source of truth).
 */
export const tui: TuiPlugin = async (api: TuiPluginApi, options) => {
  const providerIDs = new Set(stringList((options as Record<string, unknown> | undefined)?.providerIDs, ["deepseek"]))

  const [lang, setLang] = createSignal<LangCode>(detectLang())
  const [showSidebar, setShowSidebar] = createSignal(true)
  const [showEvidence, setShowEvidence] = createSignal(true)
  const [showFooter, setShowFooter] = createSignal(true)
  const [showToast, setShowToast] = createSignal(true)
  const [utcZone, setUtcZone] = createSignal(false)
  const [status, setStatus] = createSignal<PeakStatus>(createStatus(""))
  const [revision, setRevision] = createSignal(0)
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

  let lastPeriod = status().period
  const refresh = () => {
    const next = createStatus(status().sessionID)
    setStatus(next)
    setRevision((value) => value + 1)
    if (next.period !== lastPeriod) {
      lastPeriod = next.period
      if (showToast()) {
        api.ui.toast({
          title: t("toast.title"),
          message: statusLabel(next, t),
          variant: next.period === "peak" ? "warning" : "success",
          duration: 4500,
        })
      }
    }
  }
  const timer = setInterval(refresh, REFRESH_MS)
  api.lifecycle.onDispose(() => clearInterval(timer))
  const offSession = api.event.on("session.updated", refresh)
  api.lifecycle.onDispose(offSession)

  const sessionProvider = (sessionID: string) => {
    if (!sessionID) return undefined
    try {
      return api.state.session.get(sessionID)?.model?.providerID ?? undefined
    } catch {
      return undefined
    }
  }
  const relevant = (sessionID: string) => {
    revision()
    const providerID = sessionProvider(sessionID)
    return providerID === undefined || providerIDs.has(providerID)
  }

  api.slots.register({
    order: 60,
    slots: {
      sidebar_content(ctx: TuiSlotContext, input: { session_id: string }) {
        const sessionID = input.session_id
        return (
          <Show when={showSidebar() && relevant(sessionID)}>
            <StatusPanel
              colors={() => ctx.theme.current}
              status={() => status()}
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
        return (
          <Show when={showFooter() && relevant(sessionID)}>
            <StatusFooter colors={() => ctx.theme.current} status={() => status()} lang={lang} />
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
        const current = status()
        const message = [
          statusLabel(current, t),
          `${t("status.source")}: ${current.source}`,
          `${t("status.evidence")}: ${current.evidence}`,
          t("status.windows"),
          `${t("status.nextChange")}: ${transitionLabel(t, { lang: lang(), timeZone: timeZone() })}`,
        ].join("\n")
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
