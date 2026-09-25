import type { PricePeriod } from "./types.js"

export const DEFAULT_SIGNAL_HEADERS = [
  "x-deepseek-pricing-tier",
  "x-deepseek-price-period",
  "x-deepseek-peak",
  "x-pricing-tier",
]

const PEAK_VALUES = new Set(["peak", "peak-hours", "peak_hours", "true", "1", "on"])
const OFF_PEAK_VALUES = new Set([
  "off-peak",
  "off_peak",
  "offpeak",
  "false",
  "0",
  "off",
])

export function readApiPricePeriod(
  headers: Headers,
  names: readonly string[] = DEFAULT_SIGNAL_HEADERS,
): { period: PricePeriod; evidence: string } | undefined {
  for (const name of names) {
    const raw = headers.get(name)
    if (!raw) continue
    const value = raw.trim().toLowerCase()
    if (PEAK_VALUES.has(value)) return { period: "peak", evidence: `${name}: ${raw}` }
    if (OFF_PEAK_VALUES.has(value)) return { period: "off-peak", evidence: `${name}: ${raw}` }
  }
  return undefined
}
