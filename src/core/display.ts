import type { Plugin } from "@opencode/plugin/tui"
import type { LangCode, T, TranslationKey } from "../i18n.js"
import { nextTransition } from "../schedule.js"
import type { PeakStatus, TuiSettings } from "../types.js"

export const INITIAL_SETTINGS: TuiSettings = {
  toast: true,
  indicator: true,
  sidebarIndicator: true,
  sidebarEvidence: true,
  toastEveryRequest: false,
  lang: "en",
  timezone: "local",
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

export interface LabelOptions {
  /** Reference instant for the next transition; defaults to now. */
  now?: Date
  lang?: LangCode
  /** IANA time zone; undefined uses the system zone, "UTC" shows the official times. */
  timeZone?: string
}

function zoneDate(date: Date, timeZone: string | undefined): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""
  return `${value("year")}-${value("month")}-${value("day")}`
}

function formatClock(date: Date, timeZone: string | undefined): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""
  return `${value("hour")}:${value("minute")}`
}

/** "10:00 UTC" in UTC mode, "07:00" in the local zone; adds a short weekday on another day. */
function formatTransitionAt(at: Date, now: Date, lang: LangCode, timeZone: string | undefined): string {
  const clock = timeZone === "UTC" ? `${formatClock(at, timeZone)} UTC` : formatClock(at, timeZone)
  if (zoneDate(at, timeZone) === zoneDate(now, timeZone)) return clock
  const weekday = new Intl.DateTimeFormat(lang, { weekday: "short", timeZone }).format(at)
  return `${weekday} ${clock}`
}

/** Localized "peak ends 10:00 UTC" / "peak starts Mon 01:00" for the next change. */
export function transitionLabel(t: T, options: LabelOptions = {}): string {
  const now = options.now ?? new Date()
  const next = nextTransition(now)
  return t(next.kind === "peakEnd" ? "evidence.peakEnds" : "evidence.peakStarts", {
    when: formatTransitionAt(next.at, now, options.lang ?? "en", options.timeZone),
  })
}

/** Short, sidebar-friendly, localized version of the status evidence. */
export function evidenceLabel(status: PeakStatus, t: T, options: LabelOptions = {}): string {
  let label: string
  let transition = ""
  // An API response header is the source of truth when present.
  if (status.source === "api-header") {
    label = t("evidence.apiHeader", { header: status.evidence.split(":")[0] })
  } else if (status.holiday) {
    const key = HOLIDAY_KEYS[status.holiday]
    label = t("evidence.holiday", { name: key ? t(key) : status.holiday })
  } else {
    label = t("evidence.schedule")
    transition = ` · ${transitionLabel(t, options)}`
  }
  if (status.evidence.endsWith("(cached)")) label += ` ${t("evidence.cached")}`
  if (status.evidence.includes("no request observed yet")) label += ` ${t("evidence.preview")}`
  return label + transition
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
