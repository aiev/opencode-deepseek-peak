import assert from "node:assert/strict"
import test from "node:test"
import plugin from "../src/index.js"
import type { PeakStatus } from "../src/types.js"

type Result = { found: boolean; status?: PeakStatus }
type Method = (input: { sessionID: string }) => Promise<Result>
type HookEvent = {
  sessionID: string
  kind: "primary"
  model: { providerID: string; id: string }
  baseURL?: string
  request?: { url: string }
  response?: { headers: Headers }
}

interface ServerInput {
  options?: Record<string, unknown>
  model?: { providerID: string; id: string }
  models?: Record<string, { providerID: string; id: string }>
  provider?: { name?: string; baseURL?: string }
}

async function server(input: ServerInput = {}) {
  const model = input.model ?? { providerID: "deepseek", id: "deepseek-flash" }
  const provider = input.provider ?? { name: "DeepSeek", baseURL: "http://127.0.0.1:8787/v1" }
  const hooks = new Map<string, (event: HookEvent) => Promise<void>>()
  const events: PeakStatus[] = []
  let methods!: Record<string, Method>
  const dispose = async () => {}
  const cleanup = await plugin.setup({
    options: input.options ?? {},
    session: {
      get: async ({ sessionID }: { sessionID: string }) => ({
        model: input.models ? input.models[sessionID] : model,
      }),
      hook: async (name: string, callback: (event: HookEvent) => Promise<void>) => {
        hooks.set(name, callback)
        return { dispose }
      },
    },
    provider: {
      get: async () => ({
        data: {
          id: model.providerID,
          name: provider.name,
          settings: { baseURL: provider.baseURL },
        },
      }),
    },
    rpc: {
      register: async (_definition: unknown, handlers: Record<string, Method>) => {
        methods = handlers
        return {
          dispose,
          events: {
            emit: async (_name: string, status: PeakStatus) => {
              // Check the in-memory RPC payload, before JSON serialization can
              // silently remove undefined fields and conceal this regression.
              if (Object.hasOwn(status, "holiday")) assert.equal(typeof status.holiday, "string")
              events.push(status)
            },
          },
        }
      },
    },
  } as unknown as Parameters<typeof plugin.setup>[0])
  const event: HookEvent = { sessionID: "ses_test", kind: "primary", model }
  return { methods, hooks, events, event, cleanup, model }
}

test("holiday expiry at China midnight does not fail requests or RPC previews", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-25T15:59:59Z") })
  const app = await server()
  t.after(async () => { await app.cleanup?.() })

  const holidayPreview = await app.methods.preview({ sessionID: "ses_preview" })
  assert.equal(holidayPreview.found, true)
  assert.equal(holidayPreview.status?.holiday, "Mid-Autumn Festival")

  await app.hooks.get("model.request")!(app.event)
  assert.equal(app.events.at(-1)?.holiday, "Mid-Autumn Festival")

  t.mock.timers.tick(1000)
  const preview = await app.methods.preview({ sessionID: "ses_preview" })
  assert.equal(preview.found, true)
  assert.ok(preview.status)
  assert.equal(Object.hasOwn(preview.status, "holiday"), false)

  await app.hooks.get("model.request")!(app.event)
  const last = app.events.at(-1)
  assert.ok(last)
  assert.equal(Object.hasOwn(last, "holiday"), false)
  assert.equal(last.source, "official-schedule")
})

test("idle previews follow the schedule across a boundary", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-24T03:59:00Z") })
  const app = await server()
  t.after(async () => { await app.cleanup?.() })

  await app.hooks.get("model.request")!(app.event)
  const observed = await app.methods.status({ sessionID: app.event.sessionID })
  assert.equal(observed.status?.period, "peak")

  // Two minutes later the first window has ended; the preview must not keep
  // serving the stale observed status.
  t.mock.timers.tick(2 * 60_000)
  const preview = await app.methods.preview({ sessionID: app.event.sessionID })
  assert.equal(preview.found, true)
  assert.equal(preview.status?.period, "off-peak")
  assert.equal(preview.status?.source, "official-schedule")
})

test("API response and cached request retain API precedence", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-28T06:00:00Z") })
  const app = await server()
  t.after(async () => { await app.cleanup?.() })

  await app.hooks.get("http.response")!({
    ...app.event,
    request: { url: "" },
    response: { headers: new Headers({ "x-deepseek-pricing-tier": "off-peak" }) },
  })
  await app.hooks.get("model.request")!(app.event)
  assert.equal(app.events.length, 2)
  const [response, request] = app.events
  for (const status of app.events) {
    assert.equal(Object.hasOwn(status, "holiday"), false)
    assert.equal(status.period, "off-peak")
    assert.equal(status.scheduledPeriod, "peak")
    assert.equal(status.source, "api-header")
    assert.equal(status.mismatch, true)
  }
  assert.equal(response.cached, undefined)
  assert.equal(request.cached, true)
  // The cached flag belongs on the status; it is no longer baked into the evidence.
  assert.equal(request.evidence, "x-deepseek-pricing-tier: off-peak")
})

test("DeepSeek keeps its schedule behind a local proxy", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-24T03:59:00Z") })
  const app = await server({ provider: { name: "DeepSeek", baseURL: "http://127.0.0.1:8787/v1" } })
  t.after(async () => { await app.cleanup?.() })

  const preview = await app.methods.preview({ sessionID: "ses_test" })
  assert.equal(preview.found, true)
  assert.equal(preview.status?.period, "peak")
  assert.equal(preview.status?.providerLabel, "DeepSeek")
  assert.equal(preview.status?.source, "official-schedule")
})

test("Z.ai Coding Plan resolves and snapshots its next change", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-28T06:30:00Z") })
  const app = await server({
    model: { providerID: "zai", id: "glm-5.3" },
    provider: { name: "Z.ai", baseURL: "https://api.z.ai/api/coding/paas/v4" },
  })
  t.after(async () => { await app.cleanup?.() })

  const preview = await app.methods.preview({ sessionID: "ses_test" })
  assert.equal(preview.found, true)
  assert.equal(preview.status?.period, "peak")
  assert.equal(preview.status?.providerLabel, "Z.ai Coding Plan")
  assert.equal(preview.status?.schedule?.nextChangeAt, Date.parse("2026-09-28T10:00:00Z"))
  assert.equal(preview.status?.schedule?.nextChangeKind, "peakEnd")
})

test("unknown providers stay unknown without a schedule", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-24T06:00:00Z") })
  const app = await server({
    model: { providerID: "openrouter", id: "deepseek-v4" },
    provider: { name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1" },
  })
  t.after(async () => { await app.cleanup?.() })

  const preview = await app.methods.preview({ sessionID: "ses_test" })
  assert.equal(preview.found, true)
  assert.equal(preview.status?.period, "unknown")
  assert.equal(preview.status?.source, "none")
  assert.equal(preview.status?.providerLabel, "OpenRouter")
  assert.ok(preview.status)
  assert.equal(Object.hasOwn(preview.status, "schedule"), false)

  await app.hooks.get("model.request")!(app.event)
  const event = app.events.at(-1)
  assert.ok(event)
  assert.equal(event.period, "unknown")
  assert.equal(event.source, "none")
})

test("pricing headers work without a known profile", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-24T06:00:00Z") })
  const app = await server({
    model: { providerID: "openrouter", id: "deepseek-v4" },
    provider: { name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1" },
  })
  t.after(async () => { await app.cleanup?.() })

  await app.hooks.get("http.response")!({
    ...app.event,
    request: { url: "https://openrouter.ai/api/v1" },
    response: { headers: new Headers({ "x-pricing-tier": "peak" }) },
  })
  const response = app.events.at(-1)
  assert.ok(response)
  assert.equal(response.period, "peak")
  assert.equal(response.source, "api-header")
  assert.equal(response.scheduledPeriod, "unknown")
  assert.equal(response.mismatch, false)

  await app.hooks.get("model.request")!(app.event)
  const request = app.events.at(-1)
  assert.ok(request)
  assert.equal(request.period, "peak")
  assert.equal(request.cached, true)
})

test("Z.ai standard API is vetoed", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-28T06:30:00Z") })
  const app = await server({
    model: { providerID: "zai", id: "glm-5.3" },
    provider: { name: "Z.ai", baseURL: "https://api.z.ai/api/paas/v4" },
  })
  t.after(async () => { await app.cleanup?.() })

  const preview = await app.methods.preview({ sessionID: "ses_test" })
  assert.equal(preview.found, true)
  assert.equal(preview.status?.period, "unknown")
})

test("provider allowlist gates previews", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-24T06:00:00Z") })
  const blocked = await server({
    options: { providerIDs: ["deepseek"] },
    model: { providerID: "zai", id: "glm-5.3" },
    provider: { name: "Z.ai", baseURL: "https://api.z.ai/api/coding/paas/v4" },
  })
  t.after(async () => { await blocked.cleanup?.() })
  const hidden = await blocked.methods.preview({ sessionID: "ses_test" })
  assert.equal(hidden.found, false)

  const allowed = await server({ options: { providerIDs: ["deepseek"] } })
  t.after(async () => { await allowed.cleanup?.() })
  const shown = await allowed.methods.preview({ sessionID: "ses_test" })
  assert.equal(shown.found, true)
})

test("interleaved sessions keep their own provider and model in status and preview", async (t) => {
  const models = {
    ses_a: { providerID: "deepseek", id: "deepseek-flash" },
    ses_b: { providerID: "zai", id: "glm-5.3" },
  }
  const app = await server({ models })
  t.after(async () => { await app.cleanup?.() })

  await Promise.all(Object.entries(models).map(([sessionID, model]) =>
    app.hooks.get("model.request")!({ sessionID, kind: "primary", model }),
  ))
  for (const [sessionID, model] of Object.entries(models)) {
    for (const method of [app.methods.status, app.methods.preview]) {
      const result = await method({ sessionID })
      assert.equal(result.status?.sessionID, sessionID)
      assert.equal(result.status?.providerID, model.providerID)
      assert.equal(result.status?.modelID, model.id)
    }
  }

  models.ses_a = { providerID: "openai", id: "gpt-test" }
  const changed = await app.methods.preview({ sessionID: "ses_a" })
  assert.equal(changed.status?.providerID, "openai")
  assert.equal(changed.status?.period, "unknown")
  const unchanged = await app.methods.preview({ sessionID: "ses_b" })
  assert.equal(unchanged.status?.providerID, "zai")
  assert.equal(unchanged.status?.modelID, "glm-5.3")
})
