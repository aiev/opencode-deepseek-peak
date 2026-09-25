/** @jsxImportSource @opentui/solid */

import { createMemo, For, Show } from "solid-js"
import { themeColors } from "../core/display.js"
import { createT } from "../i18n.js"
import type { IndicatorProps } from "./PeakPanel.js"

/** Prompt-footer status: peak stands out in the default text color, off-peak stays muted. */
export function FooterStatus(props: IndicatorProps) {
  const t = createT(() => props.lang())

  const segments = createMemo(() => {
    const status = props.status()
    if (!status) return []
    const { normal, muted, warning } = themeColors(props.context.theme)
    const peak = status.period === "peak"
    const label = peak ? t("period.peak") : t("period.offPeak")
    const out = [{ text: `DS ${label}`, color: peak ? normal : muted }]
    if (status.source === "api-header") out.push({ text: " API", color: muted })
    if (status.mismatch) out.push({ text: " ⚠", color: warning })
    out.push({ text: " ·", color: muted })
    return out
  })

  return (
    <Show when={props.enabled() && props.status()}>
      <text>
        <For each={segments()}>{(segment) => <span style={{ fg: segment.color }}>{segment.text}</span>}</For>
      </text>
    </Show>
  )
}
