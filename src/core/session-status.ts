import { createEffect, createSignal, on } from "solid-js"
import type { PeakStatus } from "../types.js"

interface SessionModel {
  providerID: string
  id: string
}

/** Session-keyed status with protection against late RPC responses. */
export function createSessionStatuses(readStatus: (sessionID: string) => Promise<PeakStatus | undefined>) {
  const [statuses, setStatuses] = createSignal<Record<string, PeakStatus>>({})
  const revisions = new Map<string, number>()
  const revise = (sessionID: string) => {
    const revision = (revisions.get(sessionID) ?? 0) + 1
    revisions.set(sessionID, revision)
    return revision
  }
  const write = (sessionID: string, status: PeakStatus | undefined) => {
    if (status && status.sessionID !== sessionID) return
    setStatuses((current) => {
      const next = { ...current }
      if (status) next[sessionID] = status
      else delete next[sessionID]
      return next
    })
  }

  return {
    status: (sessionID: string): PeakStatus | undefined => statuses()[sessionID],
    sessions: () => Object.keys(statuses()),
    publish(status: PeakStatus) {
      revise(status.sessionID)
      write(status.sessionID, status)
    },
    async refresh(sessionID: string) {
      if (!sessionID) return
      const revision = revise(sessionID)
      try {
        const status = await readStatus(sessionID)
        if (revisions.get(sessionID) === revision) write(sessionID, status)
      } catch {
        // A failed transport is not an authoritative "no status" result.
      }
    },
  }
}

/** Bind a mounted slot to its reactive session and that session's model. */
export function createSessionIndicator(input: {
  sessionID: () => string
  model: () => SessionModel | undefined
  status: (sessionID: string) => PeakStatus | undefined
  refresh: (sessionID: string) => Promise<void>
}) {
  createEffect(on(
    () => {
      const sessionID = input.sessionID()
      const model = input.model()
      return [sessionID, model?.providerID, model?.id] as const
    },
    ([sessionID]) => {
      if (sessionID) void input.refresh(sessionID)
    },
  ))

  return () => {
    const sessionID = input.sessionID()
    if (!sessionID) return undefined
    const status = input.status(sessionID)
    const model = input.model()
    if (!status || status.sessionID !== sessionID) return undefined
    // An in-flight request may still describe the previously selected model.
    if (model && (status.providerID !== model.providerID || status.modelID !== model.id)) return undefined
    return status
  }
}
