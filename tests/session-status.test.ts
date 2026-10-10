import assert from "node:assert/strict"
import test from "node:test"
import { createRoot, createSignal } from "solid-js"
import { createSessionIndicator, createSessionStatuses } from "../src/core/session-status.js"
import type { PeakStatus } from "../src/types.js"

const deepseek = { providerID: "deepseek", id: "deepseek-flash" }
const zai = { providerID: "zai", id: "glm-5.3" }

function status(sessionID: string, model = deepseek, extra: Partial<PeakStatus> = {}): PeakStatus {
  return {
    sessionID,
    providerID: model.providerID,
    modelID: model.id,
    providerLabel: model.providerID,
    providerShort: model.providerID,
    period: "off-peak",
    scheduledPeriod: "off-peak",
    source: "official-schedule",
    phase: "request",
    mismatch: false,
    observedAt: 0,
    evidence: "Test schedule",
    ...extra,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

test("mounted sidebar and footer follow A -> B -> A without sharing status", async (t) => {
  const a = status("ses_a")
  const b = status("ses_b", zai, { period: "peak" })
  const reads: string[] = []
  const app = createRoot((dispose) => {
    t.after(dispose)
    const [active, setActive] = createSignal("ses_a")
    const props = { get sessionID() { return active() } }
    const statuses = createSessionStatuses(async (sessionID) => {
      reads.push(sessionID)
      return sessionID === "ses_a" ? a : b
    })
    statuses.publish(a)
    statuses.publish(b)
    const input = {
      sessionID: () => props.sessionID,
      model: () => props.sessionID === "ses_a" ? deepseek : zai,
      status: statuses.status,
      refresh: statuses.refresh,
    }
    return {
      setActive,
      statuses,
      sidebar: createSessionIndicator(input),
      footer: createSessionIndicator(input),
    }
  })

  assert.equal(app.sidebar(), a)
  assert.equal(app.footer(), a)
  app.setActive("ses_b")
  assert.equal(app.sidebar(), b)
  assert.equal(app.footer(), b)

  // A request in the background must not replace the active tab's indicators.
  app.statuses.publish({ ...a, period: "peak" })
  assert.equal(app.sidebar(), b)
  assert.equal(app.footer(), b)
  app.setActive("ses_a")
  assert.equal(app.sidebar()?.sessionID, "ses_a")
  assert.equal(app.footer()?.providerID, "deepseek")
  await Promise.resolve()
  assert.equal(app.sidebar(), a)
  assert.deepEqual(reads, ["ses_a", "ses_a", "ses_b", "ses_b", "ses_a", "ses_a"])
})

test("a footer-only binding fetches each session without sidebar or request events", async (t) => {
  const reads: string[] = []
  const app = createRoot((dispose) => {
    t.after(dispose)
    const [active, setActive] = createSignal("ses_a")
    const statuses = createSessionStatuses(async (sessionID) => {
      reads.push(sessionID)
      return status(sessionID, sessionID === "ses_a" ? deepseek : zai)
    })
    const footer = createSessionIndicator({
      sessionID: active,
      model: () => active() === "ses_a" ? deepseek : zai,
      status: statuses.status,
      refresh: statuses.refresh,
    })
    return { setActive, footer }
  })

  await Promise.resolve()
  assert.equal(app.footer()?.providerID, "deepseek")
  app.setActive("ses_b")
  assert.equal(app.footer(), undefined)
  await Promise.resolve()
  assert.equal(app.footer()?.providerID, "zai")
  assert.deepEqual(reads, ["ses_a", "ses_b"])
})

test("model changes hide the previous indicator immediately and refresh the session", async (t) => {
  const original = status("ses_a")
  let preview: PeakStatus | undefined = original
  let reads = 0
  const app = createRoot((dispose) => {
    t.after(dispose)
    const [model, setModel] = createSignal(deepseek)
    const statuses = createSessionStatuses(async () => {
      reads++
      return preview
    })
    statuses.publish(original)
    const indicator = createSessionIndicator({
      sessionID: () => "ses_a",
      model,
      status: statuses.status,
      refresh: statuses.refresh,
    })
    return { setModel, statuses, indicator }
  })

  await Promise.resolve()
  preview = undefined
  app.setModel({ providerID: "openai", id: "gpt-test" })
  assert.equal(app.indicator(), undefined)
  await Promise.resolve()
  assert.equal(app.statuses.status("ses_a"), undefined)

  preview = status("ses_a", { ...deepseek, id: "deepseek-v4-pro" })
  app.setModel({ ...deepseek, id: "deepseek-v4-pro" })
  await Promise.resolve()
  assert.equal(app.indicator(), preview)

  // Model IDs are not sufficient identity: changing only the provider matters.
  preview = undefined
  app.setModel({ providerID: "openrouter", id: "deepseek-v4-pro" })
  assert.equal(app.indicator(), undefined)
  await Promise.resolve()
  assert.equal(app.statuses.status("ses_a"), undefined)
  assert.equal(reads, 4)
})

test("empty session slots do not fetch or show the previous session", async (t) => {
  let reads = 0
  const app = createRoot((dispose) => {
    t.after(dispose)
    const [active, setActive] = createSignal("")
    const statuses = createSessionStatuses(async (sessionID) => {
      reads++
      return status(sessionID)
    })
    const indicator = createSessionIndicator({
      sessionID: active,
      model: () => deepseek,
      status: statuses.status,
      refresh: statuses.refresh,
    })
    return { setActive, indicator }
  })

  assert.equal(app.indicator(), undefined)
  assert.equal(reads, 0)
  app.setActive("ses_a")
  await Promise.resolve()
  assert.equal(app.indicator()?.sessionID, "ses_a")
  app.setActive("")
  assert.equal(app.indicator(), undefined)
  assert.equal(reads, 1)
})

test("an authoritative missing status clears only the requested session", async () => {
  const statuses = createSessionStatuses(async () => undefined)
  statuses.publish(status("ses_a"))
  const b = status("ses_b", zai)
  statuses.publish(b)

  await statuses.refresh("ses_a")
  assert.equal(statuses.status("ses_a"), undefined)
  assert.equal(statuses.status("ses_b"), b)
  assert.deepEqual(statuses.sessions(), ["ses_b"])
})

test("an older preview cannot restore a status after a newer refresh cleared it", async () => {
  const old = deferred<PeakStatus | undefined>()
  let reads = 0
  const statuses = createSessionStatuses(() => ++reads === 1 ? old.promise : Promise.resolve(undefined))
  const previous = status("ses_a")
  statuses.publish(previous)

  const pending = statuses.refresh("ses_a")
  await statuses.refresh("ses_a")
  old.resolve(previous)
  await pending
  assert.equal(statuses.status("ses_a"), undefined)
})

test("late previews from different sessions remain independently keyed", async () => {
  const a = deferred<PeakStatus | undefined>()
  const statuses = createSessionStatuses(async (sessionID) => {
    return sessionID === "ses_a" ? a.promise : status("ses_b", zai)
  })
  const pending = statuses.refresh("ses_a")
  await statuses.refresh("ses_b")
  a.resolve(status("ses_a"))
  await pending

  assert.equal(statuses.status("ses_a")?.providerID, "deepseek")
  assert.equal(statuses.status("ses_b")?.providerID, "zai")
})

test("a newer model preview wins when same-session refreshes complete out of order", async () => {
  const old = deferred<PeakStatus | undefined>()
  const current = status("ses_a", zai)
  let reads = 0
  const statuses = createSessionStatuses(() => ++reads === 1 ? old.promise : Promise.resolve(current))
  const pending = statuses.refresh("ses_a")
  await statuses.refresh("ses_a")
  old.resolve(status("ses_a"))
  await pending
  assert.equal(statuses.status("ses_a"), current)
})

test("a provider event takes precedence over an already pending preview", async () => {
  const old = deferred<PeakStatus | undefined>()
  const statuses = createSessionStatuses(() => old.promise)
  const pending = statuses.refresh("ses_a")
  const observed = status("ses_a", deepseek, { source: "api-header", phase: "response", period: "peak" })
  statuses.publish(observed)
  old.resolve(status("ses_a"))
  await pending
  assert.equal(statuses.status("ses_a"), observed)
})

test("RPC results cannot write another session's status", async () => {
  const statuses = createSessionStatuses(async () => status("ses_b", zai))
  await statuses.refresh("ses_a")
  assert.equal(statuses.status("ses_a"), undefined)
  assert.equal(statuses.status("ses_b"), undefined)
})

test("transport failure does not erase the last known status", async () => {
  const statuses = createSessionStatuses(async () => { throw new Error("Disconnected") })
  const previous = status("ses_a")
  statuses.publish(previous)
  await statuses.refresh("ses_a")
  assert.equal(statuses.status("ses_a"), previous)
})
