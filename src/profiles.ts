import { chinesePublicHoliday, nextChange, periodAt, type ScheduleSpec } from "./schedule.js"
import type { PricePeriod, StatusSchedule } from "./types.js"

/**
 * A pricing profile describes one official peak/off-peak scheme. Profiles
 * resolve automatically from the provider ID, the request base URL and the
 * model ID: the provider ID is the strongest signal (it survives local
 * proxies), the URL catches custom-named providers pointed at official
 * endpoints, and the model filter keeps unrelated products out.
 */
export interface PricingProfile extends ScheduleSpec {
  id: string
  /** Pricing product or provider name shown in the UI. */
  label: string
  /** Compact label for the prompt footer. */
  shortLabel: string
  /** Canonical English evidence when the official schedule drives the period. */
  evidence: string
  /** Compact time zone label used in window text, e.g. "UTC" or "UTC+8". */
  timeZoneLabel: string
  /** Model IDs covered by the profile; undefined covers every model. */
  models?: readonly string[]
  /** Provider IDs that use this pricing scheme (matched case-insensitively). */
  providerIDs?: readonly string[]
  /** Recognizes request URLs that use this pricing scheme. */
  matchesURL?: (url: URL) => boolean
  /** Rejects a provider-ID match when the URL clearly belongs to another product. */
  vetoURL?: (url: URL) => boolean
}

const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5]
const EVERY_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6]

/** DeepSeek's official schedule: 01:00–04:00 and 06:00–10:00 UTC, Mon–Fri. */
const DEEPSEEK: PricingProfile = {
  id: "deepseek",
  label: "DeepSeek",
  shortLabel: "DS",
  evidence: "DeepSeek official UTC pricing schedule",
  timeZone: "UTC",
  timeZoneLabel: "UTC",
  windows: [
    { days: WEEKDAYS, start: 60, end: 240 },
    { days: WEEKDAYS, start: 360, end: 600 },
  ],
  holidayCheck: chinesePublicHoliday,
  providerIDs: ["deepseek"],
  matchesURL: (url) => url.hostname === "api.deepseek.com",
}

/** Z.ai Coding Plan: 14:00–18:00 Singapore time, Monday to Friday. */
const ZAI_CODING: PricingProfile = {
  id: "zai-coding",
  label: "Z.ai Coding Plan",
  shortLabel: "Z.ai",
  evidence: "Z.ai Coding Plan peak hours (Singapore time)",
  timeZone: "Asia/Singapore",
  timeZoneLabel: "UTC+8",
  windows: [{ days: WEEKDAYS, start: 14 * 60, end: 18 * 60 }],
  providerIDs: ["zai", "z-ai", "zhipu", "zhipuai", "glm"],
  matchesURL: (url) =>
    url.hostname === "api.z.ai" &&
    (url.pathname.startsWith("/api/coding") ||
      url.pathname.startsWith("/api/anthropic") ||
      url.pathname.startsWith("/api/v1")),
  // The standard pay-as-you-go API has flat pricing, so a provider pointing
  // there must not inherit the Coding Plan schedule.
  vetoURL: (url) => url.hostname === "api.z.ai" && url.pathname.startsWith("/api/paas"),
}

/**
 * Alibaba Model Studio bills selected DeepSeek models at busy hours
 * (Beijing time 08:00–22:00, every day) with off-peak rates at night.
 */
const ALIBABA_MODEL_STUDIO: PricingProfile = {
  id: "alibaba-model-studio",
  label: "Alibaba Model Studio",
  shortLabel: "Bailian",
  evidence: "Alibaba Model Studio busy hours (Beijing time)",
  timeZone: "Asia/Shanghai",
  timeZoneLabel: "UTC+8",
  windows: [{ days: EVERY_DAY, start: 8 * 60, end: 22 * 60 }],
  models: ["deepseek-v4.1-flash", "deepseek-v4-pro-0813", "deepseek-v4-flash-0731"],
  providerIDs: ["dashscope", "bailian", "alibaba-model-studio"],
  matchesURL: (url) => url.hostname === "dashscope.aliyuncs.com",
  // The Singapore (international) endpoint was not documented with this
  // schedule, so it stays unknown instead of inheriting the rule.
  vetoURL: (url) => url.hostname.includes("dashscope-intl"),
}

/**
 * Alibaba Token Plan bills these models at full Credits during the day and
 * applies the published night discount from 22:00 to 08:00 Beijing time:
 * 50% off for the three DeepSeek models and 60% off for qwen3.8-max and
 * qwen3.8-flash, so the peak window is the same daytime band.
 */
const ALIBABA_TOKEN_PLAN: PricingProfile = {
  id: "alibaba-token-plan",
  label: "Alibaba Token Plan",
  shortLabel: "Token Plan",
  evidence: "Alibaba Token Plan night discount (Beijing time)",
  timeZone: "Asia/Shanghai",
  timeZoneLabel: "UTC+8",
  windows: [{ days: EVERY_DAY, start: 8 * 60, end: 22 * 60 }],
  models: [
    "deepseek-v4.1-flash",
    "deepseek-v4-pro-0813",
    "deepseek-v4-flash-0731",
    "qwen3.8-max",
    "qwen3.8-flash",
  ],
  providerIDs: ["alibaba-token-plan"],
  matchesURL: (url) => url.hostname.includes("token-plan") && url.hostname.endsWith("aliyuncs.com"),
}

export const PROFILES: readonly PricingProfile[] = [
  DEEPSEEK,
  ZAI_CODING,
  ALIBABA_MODEL_STUDIO,
  ALIBABA_TOKEN_PLAN,
]

/** Fallback used by surfaces with no model information (legacy OpenCode V1). */
export const DEFAULT_PROFILE: PricingProfile = DEEPSEEK

function parseURL(value: string | undefined): URL | undefined {
  if (!value) return undefined
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

export function resolveProfile(input: {
  providerID: string
  modelID?: string
  baseURL?: string
}): PricingProfile | undefined {
  const providerID = input.providerID.toLowerCase()
  const modelID = input.modelID?.toLowerCase()
  const url = parseURL(input.baseURL)
  for (const profile of PROFILES) {
    if (profile.models && (!modelID || !profile.models.includes(modelID))) continue
    if (profile.providerIDs?.includes(providerID)) {
      if (url && profile.vetoURL?.(url)) continue
      return profile
    }
  }
  if (url) {
    for (const profile of PROFILES) {
      if (profile.models && (!modelID || !profile.models.includes(modelID))) continue
      if (profile.matchesURL?.(url)) return profile
    }
  }
  return undefined
}

export interface ScheduleSnapshot {
  period: PricePeriod
  holiday?: string
  schedule: StatusSchedule
}

/** Current period plus the schedule facts the TUI needs to render. */
export function scheduleSnapshot(profile: PricingProfile, date: Date): ScheduleSnapshot {
  const info = periodAt(profile, date)
  const next = nextChange(profile, date)
  return {
    period: info.period,
    ...(info.holiday !== undefined ? { holiday: info.holiday } : {}),
    schedule: {
      windows: profile.windows.map((window) => ({
        days: [...window.days],
        start: window.start,
        end: window.end,
      })),
      timeZone: profile.timeZone,
      timeZoneLabel: profile.timeZoneLabel,
      ...(profile.holidayCheck ? { excludeHolidays: true } : {}),
      ...(next ? { nextChangeAt: next.at.getTime(), nextChangeKind: next.kind } : {}),
    },
  }
}