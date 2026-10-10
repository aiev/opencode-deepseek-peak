import type { Plugin } from "@opencode/plugin/tui"
import type { LangCode, T, TranslationKey } from "../i18n.js"
import type { PeakStatus, StatusSchedule } from "../types.js"

export const INITIAL_SETTINGS = {
  toast: true,
  indicator: true,
  sidebarIndicator: true,
  sidebarEvidence: true,
  toastEveryRequest: false,
  lang: "en" as LangCode,
  timezone: "local" as const,
}

export function statusLabel(status: PeakStatus, t: T) {
  const period = t(
    status.period === "peak"
      ? "period.peak"
      : status.period === "off-peak"
        ? "period.offPeak"
        : "period.unknown",
  )
  const correction = status.mismatch ? ` · API ≠ ${t("evidence.schedule")}` : ""
  return `${status.providerLabel} ${period}${correction}`
}

export function sourceLabel(source: PeakStatus["source"], t: T): string {
  if (source === "api-header") return t("source.apiHeader")
  if (source === "official-schedule") return t("source.officialSchedule")
  return t("source.none")
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
export function transitionLabel(
  t: T,
  schedule: StatusSchedule | undefined,
  options: LabelOptions = {},
): string | undefined {
  const kind = schedule?.nextChangeKind
  const at = schedule?.nextChangeAt
  if (!kind || at === undefined) return undefined
  return t(kind === "peakEnd" ? "evidence.peakEnds" : "evidence.peakStarts", {
    when: formatTransitionAt(new Date(at), options.now ?? new Date(), options.lang ?? "en", options.timeZone),
  })
}

/** Compact sidebar form: ▲ peak starts / ▼ peak ends. Arrows need no translation. */
export function transitionCompact(schedule: StatusSchedule | undefined, options: LabelOptions = {}): string | undefined {
  const kind = schedule?.nextChangeKind
  const at = schedule?.nextChangeAt
  if (!kind || at === undefined) return undefined
  const arrow = kind === "peakEnd" ? "▼" : "▲"
  return `${arrow} ${formatTransitionAt(new Date(at), options.now ?? new Date(), options.lang ?? "en", options.timeZone)}`
}

/** Short, sidebar-friendly, localized version of the status evidence. */
export function evidenceLabel(status: PeakStatus, t: T, options: LabelOptions = {}): string {
  if (status.source === "none") return status.evidence
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
    const compact = transitionCompact(status.schedule, options)
    if (compact) transition = ` · ${compact}`
  }
  if (status.cached && status.source === "api-header") label += ` ${t("evidence.cached")}`
  // A trailing marker (*) means computed from the schedule, not yet observed.
  if (status.preview && status.source === "official-schedule") label += t("evidence.preview")
  return label + transition
}

function hhmm(minutes: number): string {
  const value = ((minutes % 1440) + 1440) % 1440
  const hour = Math.floor(value / 60)
  const minute = value % 60
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function sameDays(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((day) => right.includes(day))
}

function daysLabel(days: readonly number[], t: T, lang: LangCode): string {
  const sorted = [...days].sort((left, right) => left - right)
  if (sorted.length === 7) return t("windows.daily")
  if (sorted.length === 5 && sorted.every((day) => day >= 1 && day <= 5)) return t("windows.weekdays")
  const format = new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" })
  return sorted.map((day) => format.format(new Date(Date.UTC(2024, 0, 7 + day)))).join(", ")
}

/** "Mon–Fri 14:00–18:00 (UTC+8)" for the dialog, formatted from schedule facts. */
export function windowsLabel(schedule: StatusSchedule, t: T, lang: LangCode): string {
  const groups: { days: readonly number[]; times: string[] }[] = []
  for (const window of schedule.windows) {
    const time = `${hhmm(window.start)}–${hhmm(window.end)}`
    const existing = groups.find((group) => sameDays(group.days, window.days))
    if (existing) existing.times.push(time)
    else groups.push({ days: window.days, times: [time] })
  }
  const body = groups.map((group) => `${daysLabel(group.days, t, lang)} ${group.times.join(", ")}`).join("; ")
  const note = schedule.excludeHolidays ? `; ${t("windows.exceptHolidays")}` : ""
  return `${body} (${schedule.timeZoneLabel}${note})`
}

/** Status-dialog body: localized lines derived from the status payload. */
export function statusDetails(status: PeakStatus, t: T, options: LabelOptions = {}): string[] {
  if (status.source === "none") {
    return [t("status.unknownProvider", { provider: status.providerLabel })]
  }
  const lines = [
    statusLabel(status, t),
    `${t("status.source")}: ${sourceLabel(status.source, t)}`,
    `${t("status.evidence")}: ${status.evidence}${status.cached ? ` ${t("evidence.cached")}` : ""}`,
  ]
  if (status.schedule) {
    lines.push(t("status.windows", { windows: windowsLabel(status.schedule, t, options.lang ?? "en") }))
    const next = transitionLabel(t, status.schedule, options)
    if (next) lines.push(`${t("status.nextChange")}: ${next}`)
  }
  return lines
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