import type { Plugin } from "@opencode/plugin/tui"
import type { T, TranslationKey } from "../i18n.js"
import type { PeakStatus, TuiSettings } from "../types.js"

export const INITIAL_SETTINGS: TuiSettings = {
  toast: true,
  indicator: true,
  sidebarIndicator: true,
  sidebarEvidence: true,
  toastEveryRequest: false,
  lang: "en",
}

export function statusLabel(status: PeakStatus, t: T) {
  const period = t(status.period === "peak" ? "period.peak" : "period.offPeak")
  const correction = status.mismatch ? ` · API ≠ ${t("evidence.schedule")}` : ""
  return `DeepSeek ${period}${correction}`
}

const HOLIDAY_KEYS: Record<string, TranslationKey> = {
  "Mid-Autumn Festival": "holiday.midAutumn",
  "National Day": "holiday.nationalDay",
  "Spring Festival": "holiday.springFestival",
  "Qingming Festival": "holiday.qingming",
  "Dragon Boat Festival": "holiday.dragonBoat",
  "Labour Day": "holiday.labourDay",
}

/** Short, sidebar-friendly, localized version of the status evidence. */
export function evidenceLabel(status: PeakStatus, t: T): string {
  let label: string
  // An API response header is the source of truth when present.
  if (status.source === "api-header") {
    label = t("evidence.apiHeader", { header: status.evidence.split(":")[0] })
  } else if (status.holiday) {
    const key = HOLIDAY_KEYS[status.holiday]
    label = t("evidence.holiday", { name: key ? t(key) : status.holiday })
  } else {
    label = t("evidence.schedule")
  }
  if (status.evidence.endsWith("(cached)")) label += ` ${t("evidence.cached")}`
  if (status.evidence.includes("no request observed yet")) label += ` ${t("evidence.preview")}`
  return label
}

/**
 * Theme text tokens have two generations (base/muted and default/subdued), and
 * the feedback colors do too. Prefer the newer names and fall back, matching
 * the sibling plugins' mapping.
 */
export function themeColors(theme: Plugin.Context["theme"]) {
  const text = theme.text
  const warning = text.feedback.warning
  return {
    normal: text.base ?? text.default,
    muted: text.muted ?? text.subdued,
    warning: warning.base ?? warning.default,
  }
}
