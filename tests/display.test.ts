import assert from "node:assert/strict"
import test from "node:test"
import { evidenceLabel, statusLabel } from "../src/core/display.js"
import { createT } from "../src/i18n.js"
import type { PeakStatus } from "../src/types.js"

const t = createT(() => "en")

const base: PeakStatus = {
  sessionID: "ses_test",
  providerID: "deepseek",
  modelID: "deepseek-flash",
  period: "off-peak",
  scheduledPeriod: "off-peak",
  source: "official-schedule",
  phase: "request",
  mismatch: false,
  observedAt: 0,
  evidence: "DeepSeek official UTC pricing schedule",
}

test("an API header beats a holiday in the evidence line", () => {
  assert.equal(
    evidenceLabel(
      { ...base, source: "api-header", evidence: "x-deepseek-pricing-tier: off-peak", holiday: "Mid-Autumn Festival" },
      t,
    ),
    "via x-deepseek-pricing-tier",
  )
  assert.equal(
    evidenceLabel({ ...base, source: "api-header", evidence: "x-deepseek-pricing-tier: peak (cached)" }, t),
    "via x-deepseek-pricing-tier (cached)",
  )
})

test("schedule evidence names holidays and previews", () => {
  assert.equal(evidenceLabel({ ...base, holiday: "Mid-Autumn Festival" }, t), "Holiday: Mid-Autumn Festival")
  assert.equal(
    evidenceLabel({ ...base, holiday: "National Day", evidence: "Chinese public holiday: National Day" }, t),
    "Holiday: National Day",
  )
  assert.equal(evidenceLabel(base, t), "official schedule")
  assert.equal(evidenceLabel({ ...base, evidence: "Current schedule (no request observed yet)" }, t), "official schedule (no request yet)")
})

test("status label follows the observed period and mismatch", () => {
  assert.equal(statusLabel(base, t), "DeepSeek OFF-PEAK")
  assert.equal(statusLabel({ ...base, period: "peak", mismatch: true }, t), "DeepSeek PEAK · API ≠ official schedule")
})
