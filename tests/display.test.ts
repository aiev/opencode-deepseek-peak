import assert from "node:assert/strict"
import test from "node:test"
import { evidenceLabel, statusDetails, statusLabel, transitionLabel, windowsLabel } from "../src/core/display.js"
import { createT } from "../src/i18n.js"
import { PROFILES, scheduleSnapshot } from "../src/profiles.js"
import type { PeakStatus } from "../src/types.js"

const t = createT(() => "en")
const pt = createT(() => "pt")
const deepseek = PROFILES.find((profile) => profile.id === "deepseek")!
const zai = PROFILES.find((profile) => profile.id === "zai-coding")!

// Thursday 2026-09-24, no holiday: 05:00 UTC is the gap before the second
// window, 06:00 UTC is inside it, 10:30 UTC is after the last window.
const beforeSecondWindow = new Date("2026-09-24T05:00:00Z")
const insideSecondWindow = new Date("2026-09-24T06:00:00Z")
const afterSecondWindow = new Date("2026-09-24T10:30:00Z")

function statusAt(date: Date, extra: Partial<PeakStatus> = {}): PeakStatus {
  const snapshot = scheduleSnapshot({ ...deepseek, holidayCheck: undefined }, date)
  return {
    sessionID: "ses_test",
    providerID: "deepseek",
    modelID: "deepseek-flash",
    providerLabel: "DeepSeek",
    providerShort: "DS",
    period: snapshot.period,
    scheduledPeriod: snapshot.period,
    source: "official-schedule",
    phase: "request",
    mismatch: false,
    observedAt: date.getTime(),
    evidence: deepseek.evidence,
    schedule: snapshot.schedule,
    ...extra,
  }
}

test("status label follows the observed period and mismatch", () => {
  assert.equal(statusLabel(statusAt(beforeSecondWindow), t), "DeepSeek OFF-PEAK")
  assert.equal(
    statusLabel(statusAt(insideSecondWindow, { period: "peak", mismatch: true }), t),
    "DeepSeek PEAK · API ≠ Official schedule",
  )
})

test("an API header beats a holiday in the evidence line", () => {
  const base = statusAt(beforeSecondWindow)
  assert.equal(
    evidenceLabel(
      { ...base, source: "api-header", evidence: "x-deepseek-pricing-tier: off-peak", holiday: "Mid-Autumn Festival" },
      t,
    ),
    "via x-deepseek-pricing-tier",
  )
  assert.equal(
    evidenceLabel(
      { ...base, source: "api-header", evidence: "x-deepseek-pricing-tier: off-peak", cached: true },
      t,
    ),
    "via x-deepseek-pricing-tier (cached)",
  )
})

test("schedule evidence names the holiday when one applies", () => {
  const date = new Date("2026-09-25T06:00:00Z")
  const snapshot = scheduleSnapshot(deepseek, date)
  assert.equal(snapshot.holiday, "Mid-Autumn Festival")
  const status: PeakStatus = {
    ...statusAt(date),
    ...(snapshot.holiday ? { holiday: snapshot.holiday } : {}),
    evidence: `Chinese public holiday: ${snapshot.holiday}`,
  }
  assert.equal(evidenceLabel(status, t), "Holiday: Mid-Autumn Festival")
})

test("schedule evidence shows compact transitions and previews", () => {
  assert.equal(
    evidenceLabel(statusAt(beforeSecondWindow), t, { now: beforeSecondWindow, timeZone: "UTC" }),
    "Official schedule · ▲ 06:00 UTC",
  )
  assert.equal(
    evidenceLabel(statusAt(insideSecondWindow), t, { now: insideSecondWindow, timeZone: "UTC" }),
    "Official schedule · ▼ 10:00 UTC",
  )
  assert.equal(
    evidenceLabel(statusAt(insideSecondWindow, { preview: true }), t, { now: insideSecondWindow, timeZone: "UTC" }),
    "Official schedule* · ▼ 10:00 UTC",
  )
  // A transition on another UTC day names that day so it is not ambiguous.
  assert.equal(
    evidenceLabel(statusAt(afterSecondWindow), t, { now: afterSecondWindow, timeZone: "UTC" }),
    "Official schedule · ▲ Fri 01:00 UTC",
  )
  assert.equal(
    evidenceLabel(statusAt(afterSecondWindow), pt, { now: afterSecondWindow, timeZone: "UTC", lang: "pt" }),
    "Horário oficial · ▲ sex. 01:00 UTC",
  )
})

test("local time zones drop the UTC suffix and name far-away days", () => {
  assert.equal(
    evidenceLabel(statusAt(afterSecondWindow), t, { now: afterSecondWindow, timeZone: "America/Sao_Paulo" }),
    "Official schedule · ▲ 22:00",
  )
  assert.equal(
    evidenceLabel(statusAt(beforeSecondWindow), t, { now: beforeSecondWindow, timeZone: "America/Sao_Paulo" }),
    "Official schedule · ▲ 03:00",
  )
  assert.equal(
    evidenceLabel(statusAt(new Date("2026-09-25T10:30:00Z")), t, {
      now: new Date("2026-09-25T10:30:00Z"),
      timeZone: "America/Sao_Paulo",
    }),
    "Official schedule · ▲ Sun 22:00",
  )
})

test("transitionLabel keeps the explicit dialog wording", () => {
  assert.equal(
    transitionLabel(t, statusAt(insideSecondWindow).schedule, { now: insideSecondWindow, timeZone: "UTC" }),
    "peak ends 10:00 UTC",
  )
})

test("windowsLabel renders the schedule facts", () => {
  const deepseekSnapshot = scheduleSnapshot(deepseek, beforeSecondWindow)
  assert.equal(
    windowsLabel(deepseekSnapshot.schedule, t, "en"),
    "Mon–Fri 01:00–04:00, 06:00–10:00 (UTC; excluding Chinese public holidays)",
  )
  const zaiSnapshot = scheduleSnapshot(zai, new Date("2026-09-28T06:30:00Z"))
  assert.equal(windowsLabel(zaiSnapshot.schedule, t, "en"), "Mon–Fri 14:00–18:00 (UTC+8)")
})

test("statusDetails explains providers with no known schedule", () => {
  const unknown: PeakStatus = {
    sessionID: "ses_test",
    providerID: "openrouter",
    modelID: "deepseek-v4",
    providerLabel: "OpenRouter",
    providerShort: "OpenRouter",
    period: "unknown",
    scheduledPeriod: "unknown",
    source: "none",
    phase: "request",
    mismatch: false,
    observedAt: 0,
    evidence: "No official peak/off-peak pricing is known for OpenRouter",
  }
  assert.deepEqual(statusDetails(unknown, t), [
    "No official peak/off-peak pricing is known for OpenRouter; a pricing header returned by the API is still used when present.",
  ])
})

test("statusDetails lists the schedule facts for a matched profile", () => {
  // The real profile marks excludeHolidays, which the dialog copy renders.
  const schedule = scheduleSnapshot(deepseek, insideSecondWindow).schedule
  const details = statusDetails(statusAt(insideSecondWindow, { schedule }), t, {
    now: insideSecondWindow,
    timeZone: "UTC",
  })
  assert.ok(details.includes("DeepSeek PEAK"))
  assert.ok(details.includes("Source: official schedule"))
  assert.ok(details.includes("Evidence: DeepSeek official UTC pricing schedule"))
  assert.ok(
    details.includes("Peak windows: Mon–Fri 01:00–04:00, 06:00–10:00 (UTC; excluding Chinese public holidays)"),
  )
  assert.ok(details.includes("Next change: peak ends 10:00 UTC"))
})