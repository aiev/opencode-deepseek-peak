import type { LangCode } from "./i18n.js"

export type PricePeriod = "peak" | "off-peak"
/** Resolved pricing period; "unknown" when no reliable source applies. */
export type StatusPeriod = PricePeriod | "unknown"
export type StatusSource = "official-schedule" | "api-header" | "none"
export type StatusPhase = "request" | "response"
export type TransitionKind = "peakStart" | "peakEnd"
export type TimezoneMode = "local" | "utc"

/** A recurring peak window in a profile's time zone; minutes are after midnight. */
export interface StatusWindow {
  /** Weekdays the window applies to (0 = Sunday, following Date#getUTCDay). */
  days: readonly number[]
  /** Minutes after local midnight when the window starts. */
  start: number
  /** Minutes after local midnight when the window ends. */
  end: number
}

/** Schedule facts shipped to the TUI so it can render without provider rules. */
export interface StatusSchedule {
  windows: readonly StatusWindow[]
  /** IANA time zone the windows are defined in. */
  timeZone: string
  /** Compact label for display, e.g. "UTC" or "UTC+8". */
  timeZoneLabel: string
  /** Public holidays make the whole day off-peak for this profile. */
  excludeHolidays?: boolean
  /** Epoch milliseconds of the next official schedule change. */
  nextChangeAt?: number
  nextChangeKind?: TransitionKind
}

export interface PeakStatus {
  sessionID: string
  providerID: string
  modelID: string
  /** Pricing product or provider name, e.g. "DeepSeek" or "Z.ai Coding Plan". */
  providerLabel: string
  /** Compact label for the prompt footer. */
  providerShort: string
  period: StatusPeriod
  scheduledPeriod: StatusPeriod
  source: StatusSource
  phase: StatusPhase
  mismatch: boolean
  observedAt: number
  /** Raw evidence: header text for API signals, description otherwise. */
  evidence: string
  /** The period came from a still-valid cached API signal. */
  cached?: boolean
  /** The period was synthesized from the schedule before any request. */
  preview?: boolean
  /** Chinese public holiday making the whole day off-peak, when applicable. */
  holiday?: string
  /** Present when a pricing profile matched the provider/model. */
  schedule?: StatusSchedule
}

export interface TuiSettings {
  toast: boolean
  indicator: boolean
  sidebarIndicator: boolean
  sidebarEvidence: boolean
  toastEveryRequest: boolean
  lang: LangCode
  timezone: TimezoneMode
}