/** @jsxImportSource @opentui/solid */

import type { Plugin } from "@opencode/plugin/tui"
import { createEffect, createMemo, For, Show } from "solid-js"
import { evidenceLabel, themeColors } from "../core/display.js"
import { createT, type LangCode } from "../i18n.js"
import type { PeakStatus } from "../types.js"

export interface IndicatorProps {
  context: Plugin.Context
  status: () => PeakStatus | undefined
  enabled: () => boolean
  lang: () => LangCode
  sessionID: string
  refresh: (sessionID: string) => void
}

export interface PanelProps extends IndicatorProps {
  evidence: () => boolean
  timeZone: () => string | undefined
}

export function PeakPanel(props: PanelProps) {
  const t = createT(() => props.lang())

  // The server keeps the last observed status per session, so opening a
  // session must pull that status instead of waiting for the next event.
  createEffect(() => {
    const sessionID = props.sessionID
    if (sessionID) props.refresh(sessionID)
  })

  // No reliable rule means no indicator: never pretend a period exists.
  const visible = () => {
    const status = props.status()
    return props.enabled() && status !== undefined && status.period !== "unknown"
  }

  // Single compact status line, flush left, plus an optional muted evidence line.
  const segments = createMemo(() => {
    const status = props.status()
    if (!status || status.period === "unknown") return []
    const { normal, muted, warning } = themeColors(props.context.theme)
    const peak = status.period === "peak"
    const out = [
      { text: `${status.providerLabel} `, color: muted },
      { text: `● ${t(peak ? "period.peak" : "period.offPeak")}`, color: peak ? normal : muted },
    ]
    if (status.source === "api-header") out.push({ text: " · API", color: muted })
    if (status.mismatch) out.push({ text: ` · ${t("label.mismatch")} ⚠`, color: warning })
    return out
  })

  return (
    <Show when={visible()}>
      <box flexDirection="column" alignItems="flex-start" alignSelf="flex-start">
        <text>
          <For each={segments()}>{(segment) => <span style={{ fg: segment.color }}>{segment.text}</span>}</For>
        </text>
        <Show when={props.evidence() ? props.status() : undefined}>
          {(status) => (
            <text wrapMode="none" fg={themeColors(props.context.theme).muted}>
              {evidenceLabel(status(), t, { lang: props.lang(), timeZone: props.timeZone() })}
            </text>
          )}
        </Show>
      </box>
    </Show>
  )
}