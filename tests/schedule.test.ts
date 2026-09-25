import assert from "node:assert/strict"
import test from "node:test"
import { readApiPricePeriod } from "../src/api-signal.js"
import { chinesePublicHoliday, officialPricePeriod, scheduleInfo } from "../src/schedule.js"

const notHoliday = () => false

test("uses the two official weekday peak windows", () => {
  assert.equal(officialPricePeriod(new Date("2026-09-25T01:00:00Z"), notHoliday), "peak")
  assert.equal(officialPricePeriod(new Date("2026-09-25T03:59:00Z"), notHoliday), "peak")
  assert.equal(officialPricePeriod(new Date("2026-09-25T04:00:00Z"), notHoliday), "off-peak")
  assert.equal(officialPricePeriod(new Date("2026-09-25T06:00:00Z"), notHoliday), "peak")
  assert.equal(officialPricePeriod(new Date("2026-09-25T10:00:00Z"), notHoliday), "off-peak")
})

test("weekends and public holidays are off-peak", () => {
  assert.equal(officialPricePeriod(new Date("2026-09-26T02:00:00Z"), notHoliday), "off-peak")
  assert.equal(officialPricePeriod(new Date("2026-09-25T02:00:00Z"), () => true), "off-peak")
})

test("names the Chinese public holiday that makes a weekday off-peak", () => {
  const midday = new Date("2026-09-25T06:00:00Z")
  assert.deepEqual(scheduleInfo(midday, () => "Mid-Autumn Festival"), {
    period: "off-peak",
    holiday: "Mid-Autumn Festival",
  })
  assert.deepEqual(scheduleInfo(midday, () => undefined), { period: "peak" })
  // 2026 Mid-Autumn Festival: lunar 8/15 falls on 2026-09-25.
  assert.equal(chinesePublicHoliday(midday), "Mid-Autumn Festival")
})

test("recognizes API and proxy pricing headers", () => {
  assert.deepEqual(
    readApiPricePeriod(new Headers({ "x-deepseek-pricing-tier": "off-peak" })),
    { period: "off-peak", evidence: "x-deepseek-pricing-tier: off-peak" },
  )
  assert.equal(readApiPricePeriod(new Headers({ "x-unrelated": "peak" })), undefined)
})
