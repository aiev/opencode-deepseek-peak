import assert from "node:assert/strict"
import test from "node:test"
import { evidenceLabel, statusLabel, transitionLabel } from "../src/core/display.js"
import { createT } from "../src/i18n.js"
import type { PeakStatus } from "../src/types.js"

const t = createT(() => "en")
const pt = createT(() => "pt")

// Thursday 2026-09-24, not a Chinese public holiday: 05:00 UTC is the gap
// before the second peak window, 06:00 UTC is inside it.
const beforeSecondWindow = new Date("2026-09-24T05:00:00Z")
const insideSecondWindow = new Date("2026-09-24T06:00:00Z")

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

test("schedule evidence names holidays, previews and the next change", () => {
  assert.equal(
    evidenceLabel({ ...base, holiday: "Mid-Autumn Festival" }, t, { now: beforeSecondWindow }),
    "Holiday: Mid-Autumn Festival",
  )
  assert.equal(
    evidenceLabel(
      { ...base, holiday: "National Day", evidence: "Chinese public holiday: National Day" },
      t,
      { now: beforeSecondWindow },
    ),
    "Holiday: National Day",
  )
  assert.equal(
    evidenceLabel(base, t, { now: beforeSecondWindow, lang: "en", timeZone: "UTC" }),
    "Official schedule · ▲ 06:00 UTC",
  )
  assert.equal(
    evidenceLabel(base, t, { now: insideSecondWindow, lang: "en", timeZone: "UTC" }),
    "Official schedule · ▼ 10:00 UTC",
  )
  assert.equal(
    evidenceLabel({ ...base, evidence: "Current schedule (no request observed yet)" }, t, {
      now: insideSecondWindow,
      lang: "en",
      timeZone: "UTC",
    }),
    "Official schedule (no request yet) · ▼ 10:00 UTC",
  )
  // The status dialog keeps the explicit wording.
  assert.equal(transitionLabel(t, { now: insideSecondWindow, lang: "en", timeZone: "UTC" }), "peak ends 10:00 UTC")
  // A transition on another UTC day names that day so it is not ambiguous.
  assert.equal(
    evidenceLabel(base, t, { now: new Date("2026-09-23T10:30:00Z"), lang: "en", timeZone: "UTC" }),
    "Official schedule · ▲ Thu 01:00 UTC",
  )
  assert.equal(
    evidenceLabel(base, pt, { now: new Date("2026-09-23T10:30:00Z"), lang: "pt", timeZone: "UTC" }),
    "Horário oficial · ▲ qui. 01:00 UTC",
  )
  // Local mode uses the machine zone and omits the UTC suffix.
  assert.equal(
    evidenceLabel(base, t, { now: new Date("2026-09-24T10:30:00Z"), lang: "en", timeZone: "America/Sao_Paulo" }),
    "Official schedule · ▲ Sun 22:00",
  )
  assert.equal(
    evidenceLabel(base, t, { now: new Date("2026-09-24T05:00:00Z"), lang: "en", timeZone: "America/Sao_Paulo" }),
    "Official schedule · ▲ 03:00",
  )
})

test("status label follows the observed period and mismatch", () => {
  assert.equal(statusLabel(base, t), "DeepSeek OFF-PEAK")
  assert.equal(statusLabel({ ...base, period: "peak", mismatch: true }, t), "DeepSeek PEAK · API ≠ Official schedule")
})
