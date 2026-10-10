/** @jsxImportSource @opentui/solid */

import type { Plugin } from "@opencode/plugin/tui"
import { INITIAL_SETTINGS, statusLabel } from "./core/display.js"
import { createSessionIndicator, createSessionStatuses } from "./core/session-status.js"
import { createT, detectLang, type LangCode } from "./i18n.js"
import { FooterStatus } from "./panel/FooterStatus.js"
import { PeakPanel } from "./panel/PeakPanel.js"
import { DeepSeekPeakRpc } from "./rpc.js"
import type { PeakStatus, TuiSettings } from "./types.js"
import { CommandRoot } from "./v2/commands.js"

const mod: Plugin.Definition = {
  id: "opencode-deepseek-peak-tui",
  setup(context) {
    const client = context.client.rpc(DeepSeekPeakRpc)
    const [settings, update] = context.storage.store<TuiSettings>(
      "opencode-deepseek-peak.settings",
      { initial: { ...INITIAL_SETTINGS, lang: detectLang() } },
    )
    // Stored settings may predate the `lang` field.
    const lang = () => (settings.lang ?? detectLang()) as LangCode
    const t = createT(lang)
    // Local by default; `utc` pins the official schedule times.
    const timeZone = () => (settings.timezone === "utc" ? "UTC" : undefined)
    const lastToast = new Map<string, string>()

    const readStatus = async (sessionID: string) => {
      // Preview re-synthesizes the current schedule, so an idle session stays
      // fresh; it already folds in a recent API header when one exists.
      try {
        const preview = await client.preview({ sessionID }) as { found: boolean; status?: PeakStatus }
        if (preview.found && preview.status) return preview.status
        return undefined
      } catch (error) {
        try {
          const result = await client.status({ sessionID }) as { found: boolean; status?: PeakStatus }
          return result.found ? result.status : undefined
        } catch {
          throw error
        }
      }
    }

    const statuses = createSessionStatuses(readStatus)

    const unsubscribe = client.events.on("updated", (event) => {
      const status = event.data as unknown as PeakStatus
      statuses.publish(status)
      // Without a reliable rule there is nothing to toast about.
      if (status.period === "unknown") return
      if (!settings.toast) return
      const fingerprint = `${status.period}:${status.mismatch}`
      if (!settings.toastEveryRequest && lastToast.get(status.sessionID) === fingerprint) return
      lastToast.set(status.sessionID, fingerprint)
      context.ui.toast.show({
        title: t("toast.title"),
        message: statusLabel(status, t),
        variant: status.period === "peak" ? "warning" : "success",
        duration: 4500,
      })
    })

    const indicator = (sessionID: () => string) => createSessionIndicator({
      sessionID,
      model: () => context.data.session.get(sessionID())?.model,
      status: statuses.status,
      refresh: statuses.refresh,
    })

    // Keep the period and the next-change label fresh while the session is idle.
    const timer = setInterval(() => {
      for (const sessionID of statuses.sessions()) void statuses.refresh(sessionID)
    }, 30_000)

    const unregisterCommands = context.ui.slot({
      append: "app",
      render: () => (
        <CommandRoot
          context={context}
          settings={settings}
          update={update}
          readStatus={readStatus}
          lang={lang}
          timeZone={timeZone}
        />
      ),
    })
    const unregisterSidebar = context.ui.slot({
      append: "sidebar.content",
      render: (props) => {
        const status = indicator(() => String(props.sessionID ?? ""))
        return (
          <PeakPanel
            context={context}
            status={status}
            enabled={() => settings.sidebarIndicator !== false}
            evidence={() => settings.sidebarEvidence !== false}
            lang={lang}
            timeZone={timeZone}
          />
        )
      },
    })
    const unregisterFooter = context.ui.slot({
      append: "prompt.footer.status",
      render: (props) => {
        const status = indicator(() => String(props.sessionID ?? ""))
        return (
          <FooterStatus
            context={context}
            status={status}
            enabled={() => settings.indicator}
            lang={lang}
          />
        )
      },
    })

    return () => {
      clearInterval(timer)
      unsubscribe()
      unregisterCommands()
      unregisterSidebar()
      unregisterFooter()
    }
  },
}

export default mod
