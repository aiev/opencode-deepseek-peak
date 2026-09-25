import type { LangCode } from "./i18n.js"

export type PricePeriod = "peak" | "off-peak"
export type StatusSource = "official-schedule" | "api-header"
export type StatusPhase = "request" | "response"
export type TimezoneMode = "local" | "utc"

export interface PeakStatus {
  sessionID: string
  providerID: string
  modelID: string
  period: PricePeriod
  scheduledPeriod: PricePeriod
  source: StatusSource
  phase: StatusPhase
  mismatch: boolean
  observedAt: number
  evidence: string
  /** Chinese public holiday making the whole day off-peak, when applicable. */
  holiday?: string
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
