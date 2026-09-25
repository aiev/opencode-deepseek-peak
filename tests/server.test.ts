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
  response?: { headers: Headers }
}

async function server() {
  const hooks = new Map<string, (event: HookEvent) => Promise<void>>()
  const events: PeakStatus[] = []
  let methods!: Record<string, Method>
  const model = { providerID: "deepseek", id: "deepseek-flash" }
  const dispose = async () => {}
  const cleanup = await plugin.setup({
    options: {},
    session: {
      get: async () => ({ model }),
      hook: async (name: string, callback: (event: HookEvent) => Promise<void>) => {
        hooks.set(name, callback)
        return { dispose }
      },
    },
    rpc: {
      register: async (_definition: unknown, handlers: Record<string, Method>) => {
        methods = handlers
        return {
          dispose,
          events: { emit: async (_name: string, status: PeakStatus) => {
            // Check the in-memory RPC payload, before JSON serialization can
            // silently remove undefined fields and conceal this regression.
            if (Object.hasOwn(status, "holiday")) assert.equal(typeof status.holiday, "string")
            events.push(status)
          } },
        }
      },
    },
  } as unknown as Parameters<typeof plugin.setup>[0])
  const event: HookEvent = { sessionID: "ses_test", kind: "primary", model }
  return { methods, hooks, events, event, cleanup }
}

test("holiday expiry at China midnight does not fail requests or RPC previews", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-25T15:59:59Z") })
  const app = await server()
  t.after(async () => { await app.cleanup?.() })

  const holidayPreview = await app.methods.preview({ sessionID: "ses_preview" })
  assert.equal(holidayPreview.status?.holiday, "Mid-Autumn Festival")
  await app.hooks.get("model.request")!(app.event)
  assert.equal(app.events.at(-1)?.holiday, "Mid-Autumn Festival")

  t.mock.timers.tick(1000)
  const preview = await app.methods.preview({ sessionID: "ses_preview" })
  assert.equal(preview.found, true)
  assert.ok(preview.status)
  assert.equal(Object.hasOwn(preview.status, "holiday"), false)

  await app.hooks.get("model.request")!(app.event)
  const status = await app.methods.status({ sessionID: app.event.sessionID })
  assert.ok(status.status)
  assert.equal(Object.hasOwn(status.status, "holiday"), false)
  assert.equal(app.events.at(-1)?.source, "official-schedule")
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

test("API response and cached request omit absent holidays and retain API precedence", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-28T06:00:00Z") })
  const app = await server()
  t.after(async () => { await app.cleanup?.() })

  await app.hooks.get("http.response")!({
    ...app.event,
    response: { headers: new Headers({ "x-deepseek-pricing-tier": "off-peak" }) },
  })
  await app.hooks.get("model.request")!(app.event)
  assert.equal(app.events.length, 2)
  for (const status of app.events) {
    assert.equal(Object.hasOwn(status, "holiday"), false)
    assert.equal(status.period, "off-peak")
    assert.equal(status.scheduledPeriod, "peak")
    assert.equal(status.source, "api-header")
    assert.equal(status.mismatch, true)
  }
  assert.match(app.events[1].evidence, /\(cached\)$/)
})
