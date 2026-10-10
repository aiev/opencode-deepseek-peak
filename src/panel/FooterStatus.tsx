/** @jsxImportSource @opentui/solid */

import { createMemo, For, Show } from "solid-js"
import { themeColors } from "../core/display.js"
import { createT } from "../i18n.js"
import type { IndicatorProps } from "./PeakPanel.js"

/** Prompt-footer status: peak stands out in the default text color, off-peak stays muted. */
export function FooterStatus(props: IndicatorProps) {
  const t = createT(() => props.lang())

  // No reliable rule means no indicator: never pretend a period exists.
  const visible = () => {
    const status = props.status()
    return props.enabled() && status !== undefined && status.period !== "unknown"
  }

  const segments = createMemo(() => {
    const status = props.status()
    if (!status || status.period === "unknown") return []
    const { normal, muted, warning } = themeColors(props.context.theme)
    const peak = status.period === "peak"
    const label = peak ? t("period.peak") : t("period.offPeak")
    const out = [{ text: `${status.providerShort} ${label}`, color: peak ? normal : muted }]
    if (status.source === "api-header") out.push({ text: " API", color: muted })
    if (status.mismatch) out.push({ text: " ⚠", color: warning })
    out.push({ text: " ·", color: muted })
    return out
  })

  return (
    <Show when={visible()}>
      <text>
        <For each={segments()}>{(segment) => <span style={{ fg: segment.color }}>{segment.text}</span>}</For>
      </text>
    </Show>
  )
}