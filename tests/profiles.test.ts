import assert from "node:assert/strict"
import test from "node:test"
import { PROFILES, resolveProfile, scheduleSnapshot } from "../src/profiles.js"

const deepseek = PROFILES.find((profile) => profile.id === "deepseek")!
const zai = PROFILES.find((profile) => profile.id === "zai-coding")!
const tokenPlan = PROFILES.find((profile) => profile.id === "alibaba-token-plan")!

test("resolves the DeepSeek profile from provider id or official URL", () => {
  // The provider id wins behind local proxies, whose URL matches nothing.
  assert.equal(
    resolveProfile({
      providerID: "deepseek",
      modelID: "deepseek-flash",
      baseURL: "http://127.0.0.1:8787/v1",
    })?.id,
    "deepseek",
  )
  assert.equal(resolveProfile({ providerID: "custom", baseURL: "https://api.deepseek.com/v1" })?.id, "deepseek")
  assert.equal(resolveProfile({ providerID: "custom", baseURL: "https://openrouter.ai/api/v1" }), undefined)
})

test("resolves the Z.ai Coding Plan and vetoes the standard pay-as-you-go API", () => {
  assert.equal(resolveProfile({ providerID: "zai", modelID: "glm-5.3" })?.id, "zai-coding")
  assert.equal(
    resolveProfile({
      providerID: "zai",
      modelID: "glm-5.3",
      baseURL: "https://api.z.ai/api/coding/paas/v4",
    })?.id,
    "zai-coding",
  )
  // The standard API has flat pricing, so it must not inherit Coding Plan hours.
  assert.equal(
    resolveProfile({
      providerID: "zai",
      modelID: "glm-5.3",
      baseURL: "https://api.z.ai/api/paas/v4",
    }),
    undefined,
  )
  assert.equal(resolveProfile({ providerID: "custom", baseURL: "https://api.z.ai/api/anthropic" })?.id, "zai-coding")
})

test("resolves Alibaba Model Studio only for the covered DeepSeek models", () => {
  assert.equal(
    resolveProfile({ providerID: "dashscope", modelID: "deepseek-v4.1-flash" })?.id,
    "alibaba-model-studio",
  )
  assert.equal(
    resolveProfile({
      providerID: "dashscope",
      modelID: "deepseek-v4.1-flash",
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    })?.id,
    "alibaba-model-studio",
  )
  assert.equal(resolveProfile({ providerID: "dashscope", modelID: "qwen-max" }), undefined)
  assert.equal(
    resolveProfile({
      providerID: "dashscope",
      modelID: "deepseek-v4.1-flash",
      baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    }),
    undefined,
  )
  assert.equal(
    resolveProfile({
      providerID: "alibaba-token-plan",
      modelID: "deepseek-v4.1-flash",
      baseURL: "http://127.0.0.1:8790/v1",
    })?.id,
    "alibaba-token-plan",
  )
})

test("resolves the Alibaba Token Plan from provider id or official URL", () => {
  assert.equal(
    resolveProfile({
      providerID: "custom",
      modelID: "deepseek-v4.1-flash",
      baseURL: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    })?.id,
    "alibaba-token-plan",
  )
  assert.equal(
    resolveProfile({ providerID: "alibaba-token-plan", modelID: "qwen3.8-flash" })?.id,
    "alibaba-token-plan",
  )
  assert.equal(
    resolveProfile({ providerID: "alibaba-token-plan", modelID: "qwen3.8-max" })?.id,
    "alibaba-token-plan",
  )
  assert.equal(resolveProfile({ providerID: "alibaba-token-plan", modelID: "qwen-max" }), undefined)
})

test("snapshots the Alibaba Token Plan peak and night-discount windows", () => {
  assert.equal(scheduleSnapshot(tokenPlan, new Date("2026-09-28T02:00:00Z")).period, "peak")
  assert.equal(scheduleSnapshot(tokenPlan, new Date("2026-09-28T15:00:00Z")).period, "off-peak")
})

test("snapshots the Z.ai schedule facts for the TUI", () => {
  const snapshot = scheduleSnapshot(zai, new Date("2026-09-28T06:30:00Z"))
  assert.equal(snapshot.period, "peak")
  assert.deepEqual(snapshot.schedule.windows, [{ days: [1, 2, 3, 4, 5], start: 840, end: 1080 }])
  assert.equal(snapshot.schedule.timeZone, "Asia/Singapore")
  assert.equal(snapshot.schedule.timeZoneLabel, "UTC+8")
  assert.equal(snapshot.schedule.nextChangeAt, Date.parse("2026-09-28T10:00:00Z"))
  assert.equal(snapshot.schedule.nextChangeKind, "peakEnd")
  assert.equal(snapshot.holiday, undefined)
})

test("snapshots the DeepSeek holiday that makes a weekday off-peak", () => {
  const snapshot = scheduleSnapshot(deepseek, new Date("2026-09-25T06:00:00Z"))
  assert.equal(snapshot.period, "off-peak")
  assert.equal(snapshot.holiday, "Mid-Autumn Festival")
  assert.equal(snapshot.schedule.excludeHolidays, true)
})