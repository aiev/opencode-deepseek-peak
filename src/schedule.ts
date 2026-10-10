import Holidays from "date-holidays"
import type { PricePeriod, TransitionKind } from "./types.js"

const chinaHolidays = new Holidays("CN", { languages: ["en"] })

/** A peak window in a profile's time zone; minutes are after local midnight. */
export interface PeakWindow {
  /** Weekdays the window applies to (0 = Sunday, following Date#getUTCDay). */
  days: readonly number[]
  /** Minutes after local midnight when the window starts. */
  start: number
  /** Minutes after local midnight when the window ends; may exceed 1440 when it crosses midnight. */
  end: number
}

/** Schedule inputs shared by every pricing profile. */
export interface ScheduleSpec {
  windows: readonly PeakWindow[]
  /** IANA time zone the windows are defined in. */
  timeZone: string
  /** Returns a holiday name when local rules make the whole day off-peak. */
  holidayCheck?: (date: Date) => string | undefined
}

export interface PeriodInfo {
  period: PricePeriod
  /** Set when a public holiday makes the whole day off-peak. */
  holiday?: string
}

export interface Transition {
  kind: TransitionKind
  /** Instant of the next change of the official schedule. */
  at: Date
}

const MINUTE_MS = 60_000
const DAY_MINUTES = 24 * 60
const DAY_MS = DAY_MINUTES * MINUTE_MS

function datePartsInChina(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""
  return `${value("year")}-${value("month")}-${value("day")}`
}

/** Name of the Chinese public holiday covering this instant, when any. */
export function chinesePublicHoliday(date: Date): string | undefined {
  // Peak windows are 09:00–18:00 in China, so their UTC and China calendar
  // dates align. Noon avoids boundary ambiguity in holiday libraries.
  const chinaDate = datePartsInChina(date)
  const holiday = chinaHolidays.isHoliday(new Date(`${chinaDate}T12:00:00+08:00`))
  if (!Array.isArray(holiday)) return undefined
  return holiday.find((entry) => entry.type === "public")?.name
}

export function isChinesePublicHoliday(date: Date): boolean {
  return chinesePublicHoliday(date) !== undefined
}

interface ZonedParts {
  year: number
  month: number
  day: number
  weekday: number
  minutes: number
}

/** Calendar parts of an instant in a time zone; minutes are after local midnight. */
function zonedParts(date: Date, timeZone: string): ZonedParts {
  if (timeZone === "UTC") {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      weekday: date.getUTCDay(),
      minutes: date.getUTCHours() * 60 + date.getUTCMinutes(),
    }
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0"
  const year = Number(value("year"))
  const month = Number(value("month"))
  const day = Number(value("day"))
  return {
    year,
    month,
    day,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  }
}

/** Zone offset in milliseconds at an instant, at minute precision. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  if (timeZone === "UTC") return 0
  const instant = Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS
  const local = zonedParts(new Date(instant), timeZone)
  const localAsUtc = Date.UTC(local.year, local.month - 1, local.day) + local.minutes * MINUTE_MS
  return localAsUtc - instant
}

/** Converts a local wall-clock instant (expressed as UTC milliseconds) to a real instant. */
function instantAt(wallMs: number, timeZone: string): Date {
  const guess = new Date(wallMs - zoneOffsetMs(new Date(wallMs), timeZone))
  return new Date(wallMs - zoneOffsetMs(guess, timeZone))
}

/** Pricing period at an instant for the given windows and time zone. */
export function periodAt(spec: ScheduleSpec, date: Date): PeriodInfo {
  const holiday = spec.holidayCheck?.(date)
  if (holiday) return { period: "off-peak", holiday }
  const local = zonedParts(date, spec.timeZone)
  for (const window of spec.windows) {
    if (!window.days.includes(local.weekday)) continue
    if (local.minutes >= window.start && local.minutes < window.end) return { period: "peak" }
  }
  // Windows crossing local midnight continue into the following weekday.
  for (const window of spec.windows) {
    if (window.end <= DAY_MINUTES) continue
    const previous = (local.weekday + 6) % 7
    if (window.days.includes(previous) && local.minutes < window.end - DAY_MINUTES) {
      return { period: "peak" }
    }
  }
  return { period: "off-peak" }
}

/**
 * Next instant the official schedule changes period. Candidate instants are
 * the window boundaries over the next three local weeks, which is enough to
 * skip the longest holiday runs.
 */
export function nextChange(spec: ScheduleSpec, date: Date): Transition | undefined {
  const current = periodAt(spec, date).period
  const local = zonedParts(date, spec.timeZone)
  const dayStart = Date.UTC(local.year, local.month - 1, local.day)
  for (let offset = 0; offset <= 21; offset += 1) {
    const wallDay = dayStart + offset * DAY_MS
    const weekday = new Date(wallDay).getUTCDay()
    const candidates: number[] = []
    for (const window of spec.windows) {
      if (!window.days.includes(weekday)) continue
      candidates.push(wallDay + window.start * MINUTE_MS)
      candidates.push(wallDay + window.end * MINUTE_MS)
    }
    candidates.sort((left, right) => left - right)
    for (const wall of candidates) {
      const instant = instantAt(wall, spec.timeZone)
      if (instant.getTime() <= date.getTime()) continue
      if (periodAt(spec, instant).period !== current) {
        return { kind: current === "peak" ? "peakEnd" : "peakStart", at: instant }
      }
    }
  }
  return undefined
}