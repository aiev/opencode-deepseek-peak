import assert from "node:assert/strict"
import test from "node:test"
import { readApiPricePeriod } from "../src/api-signal.js"
import { PROFILES, type PricingProfile } from "../src/profiles.js"
import { chinesePublicHoliday, nextChange, periodAt } from "../src/schedule.js"

const deepseek = PROFILES.find((profile) => profile.id === "deepseek")!
const zai = PROFILES.find((profile) => profile.id === "zai-coding")!
const alibaba = PROFILES.find((profile) => profile.id === "alibaba-model-studio")!

// Deterministic cases drop the holiday rule so they only exercise the windows.
const deepseekNoHolidays: PricingProfile = { ...deepseek, holidayCheck: undefined }

test("DeepSeek keeps its two weekday UTC peak windows", () => {
  assert.equal(periodAt(deepseekNoHolidays, new Date("2026-09-25T01:00:00Z")).period, "peak")
  assert.equal(periodAt(deepseekNoHolidays, new Date("2026-09-25T03:59:00Z")).period, "peak")
  assert.equal(periodAt(deepseekNoHolidays, new Date("2026-09-25T04:00:00Z")).period, "off-peak")
  assert.equal(periodAt(deepseekNoHolidays, new Date("2026-09-25T06:00:00Z")).period, "peak")
  assert.equal(periodAt(deepseekNoHolidays, new Date("2026-09-25T10:00:00Z")).period, "off-peak")
})

test("weekends and Chinese public holidays are off-peak", () => {
  assert.equal(periodAt(deepseekNoHolidays, new Date("2026-09-26T02:00:00Z")).period, "off-peak")
  // V1-style holiday override: the returned name drives the whole day off-peak.
  const holiday: PricingProfile = { ...deepseek, holidayCheck: () => "Mid-Autumn Festival" }
  assert.deepEqual(periodAt(holiday, new Date("2026-09-25T02:00:00Z")), {
    period: "off-peak",
    holiday: "Mid-Autumn Festival",
  })
  // 2026 Mid-Autumn Festival: lunar 8/15 falls on 2026-09-25.
  assert.equal(chinesePublicHoliday(new Date("2026-09-25T06:00:00Z")), "Mid-Autumn Festival")
})

test("Z.ai Coding Plan peaks on Singapore afternoons", () => {
  assert.equal(periodAt(zai, new Date("2026-09-28T05:59:00Z")).period, "off-peak")
  assert.equal(periodAt(zai, new Date("2026-09-28T06:00:00Z")).period, "peak")
  assert.equal(periodAt(zai, new Date("2026-09-28T09:59:00Z")).period, "peak")
  assert.equal(periodAt(zai, new Date("2026-09-28T10:00:00Z")).period, "off-peak")
  assert.equal(periodAt(zai, new Date("2026-09-26T07:00:00Z")).period, "off-peak")
})

test("Alibaba Model Studio bills busy hours every day in Beijing", () => {
  assert.equal(periodAt(alibaba, new Date("2026-09-28T02:00:00Z")).period, "peak")
  assert.equal(periodAt(alibaba, new Date("2026-09-28T15:00:00Z")).period, "off-peak")
  assert.equal(periodAt(alibaba, new Date("2026-09-26T02:00:00Z")).period, "peak")
})

test("finds the next official schedule transition", () => {
  assert.deepEqual(nextChange(deepseekNoHolidays, new Date("2026-09-24T01:30:00Z")), {
    kind: "peakEnd",
    at: new Date("2026-09-24T04:00:00Z"),
  })
  assert.deepEqual(nextChange(deepseekNoHolidays, new Date("2026-09-24T09:59:00Z")), {
    kind: "peakEnd",
    at: new Date("2026-09-24T10:00:00Z"),
  })
  assert.deepEqual(nextChange(deepseekNoHolidays, new Date("2026-09-24T00:30:00Z")), {
    kind: "peakStart",
    at: new Date("2026-09-24T01:00:00Z"),
  })
  assert.deepEqual(nextChange(deepseekNoHolidays, new Date("2026-09-24T04:30:00Z")), {
    kind: "peakStart",
    at: new Date("2026-09-24T06:00:00Z"),
  })
  // After the last Friday window the next peak is Monday.
  assert.deepEqual(nextChange(deepseekNoHolidays, new Date("2026-09-25T10:30:00Z")), {
    kind: "peakStart",
    at: new Date("2026-09-28T01:00:00Z"),
  })
  assert.deepEqual(nextChange(deepseekNoHolidays, new Date("2026-09-26T12:00:00Z")), {
    kind: "peakStart",
    at: new Date("2026-09-28T01:00:00Z"),
  })
  // A public holiday pushes the next peak past it.
  const midAutumn = (value: Date) =>
    value.toISOString().startsWith("2026-09-25") ? "Mid-Autumn Festival" : undefined
  assert.deepEqual(nextChange({ ...deepseek, holidayCheck: midAutumn }, new Date("2026-09-25T02:00:00Z")), {
    kind: "peakStart",
    at: new Date("2026-09-28T01:00:00Z"),
  })
})

test("next transitions for the other profiles", () => {
  assert.deepEqual(nextChange(zai, new Date("2026-10-02T10:30:00Z")), {
    kind: "peakStart",
    at: new Date("2026-10-05T06:00:00Z"),
  })
  assert.deepEqual(nextChange(alibaba, new Date("2026-09-28T15:00:00Z")), {
    kind: "peakStart",
    at: new Date("2026-09-29T00:00:00Z"),
  })
})

test("recognizes API and proxy pricing headers", () => {
  assert.deepEqual(
    readApiPricePeriod(new Headers({ "x-deepseek-pricing-tier": "off-peak" })),
    { period: "off-peak", evidence: "x-deepseek-pricing-tier: off-peak" },
  )
  assert.equal(readApiPricePeriod(new Headers({ "x-unrelated": "peak" })), undefined)
})