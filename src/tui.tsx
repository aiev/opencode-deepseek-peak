/** @jsxImportSource @opentui/solid */

import type { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { INITIAL_SETTINGS, statusLabel } from "./core/display.js"
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
    const [statuses, setStatuses] = createSignal<Record<string, PeakStatus>>({})
    const lastToast = new Map<string, string>()

    const unsubscribe = client.events.on("updated", (event) => {
      const status = event.data as unknown as PeakStatus
      setStatuses((current) => ({ ...current, [status.sessionID]: status }))
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

    const readStatus = async (sessionID: string) => {
      const result = await client.status({ sessionID }) as { found: boolean; status?: PeakStatus }
      if (result.found && result.status) return result.status
      try {
        const preview = await client.preview({ sessionID }) as { found: boolean; status?: PeakStatus }
        return preview.found ? preview.status : undefined
      } catch {
        return undefined
      }
    }

    // Pull the server's last observed status so the indicators render as soon
    // as a session opens, not only after the next DeepSeek request.
    const refresh = (sessionID: string) => {
      void readStatus(sessionID)
        .then((status) => {
          if (status) setStatuses((current) => ({ ...current, [status.sessionID]: status }))
        })
        .catch(() => {})
    }

    const unregisterCommands = context.ui.slot({
      append: "app",
      render: () => (
        <CommandRoot context={context} settings={settings} update={update} readStatus={readStatus} lang={lang} />
      ),
    })
    const unregisterSidebar = context.ui.slot({
      append: "sidebar.content",
      render: (props) => {
        const sessionID = String(props.sessionID ?? "")
        return (
          <PeakPanel
            context={context}
            status={() => statuses()[sessionID]}
            enabled={() => settings.sidebarIndicator !== false}
            evidence={() => settings.sidebarEvidence !== false}
            lang={lang}
            sessionID={sessionID}
            refresh={refresh}
          />
        )
      },
    })
    const unregisterFooter = context.ui.slot({
      append: "prompt.footer.status",
      render: (props) => {
        const sessionID = String(props.sessionID ?? "")
        return (
          <FooterStatus
            context={context}
            status={() => statuses()[sessionID]}
            enabled={() => settings.indicator}
            lang={lang}
            sessionID={sessionID}
            refresh={refresh}
          />
        )
      },
    })

    return () => {
      unsubscribe()
      unregisterCommands()
      unregisterSidebar()
      unregisterFooter()
    }
  },
}

export default mod
