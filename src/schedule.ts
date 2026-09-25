import Holidays from "date-holidays"
import type { PricePeriod } from "./types.js"

const chinaHolidays = new Holidays("CN", { languages: ["en"] })

function datePartsInChina(date: Date) {
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

function peakWindow(date: Date): PricePeriod {
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10) ? "peak" : "off-peak"
}

export interface ScheduleInfo {
  period: PricePeriod
  /** Set when a Chinese public holiday makes the whole day off-peak. */
  holiday?: string
}

/**
 * DeepSeek's official pricing schedule as published in September 2026:
 * 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday, excluding Chinese
 * public holidays. Interval ends are exclusive.
 */
export function scheduleInfo(
  date: Date,
  holidayName: (value: Date) => string | undefined = chinesePublicHoliday,
): ScheduleInfo {
  const day = date.getUTCDay()
  if (day === 0 || day === 6) return { period: "off-peak" }
  const holiday = holidayName(date)
  if (holiday) return { period: "off-peak", holiday }
  return { period: peakWindow(date) }
}

export function officialPricePeriod(
  date: Date,
  holidayCheck: (value: Date) => boolean = isChinesePublicHoliday,
): PricePeriod {
  const day = date.getUTCDay()
  if (day === 0 || day === 6 || holidayCheck(date)) return "off-peak"
  return peakWindow(date)
}
