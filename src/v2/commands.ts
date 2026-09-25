import type { Plugin } from "@opencode/plugin/tui"
import { statusLabel } from "../core/display.js"
import { createT, LANG_META, type LangCode } from "../i18n.js"
import type { PeakStatus, TuiSettings } from "../types.js"
import { openSettingsMenu } from "./settings-menu.js"

interface CommandProps {
  context: Plugin.Context
  settings: TuiSettings
  update: (mutation: (draft: TuiSettings) => void) => Promise<void>
  readStatus: (sessionID: string) => Promise<PeakStatus | undefined>
  lang: () => LangCode
}

/** Command layer (registered in the app slot: slash commands stay available when the sidebar is hidden). */
export function CommandRoot(props: CommandProps) {
  const { context } = props
  const t = createT(() => props.lang())

  context.keymap.layer(() => ({
    mode: "global" as const,
    commands: [
      {
        id: "opencode-deepseek-peak.peak.status",
        title: t("command.status.title"),
        description: t("command.status.description"),
        group: "DeepSeek",
        palette: true,
        slash: { name: "deepseek-peak" },
        run: async () => {
          const route = context.ui.router.current()
          if (route.type !== "session") {
            await context.ui.dialog.alert({ title: t("status.title"), message: t("status.noSession") })
            return
          }
          try {
            const status = await props.readStatus(route.sessionID)
            await context.ui.dialog.alert({
              title: t("status.title"),
              message: status
                ? `${statusLabel(status, t)}\n${t("status.source")}: ${status.source}\n${t("status.evidence")}: ${status.evidence}`
                : t("status.noRequest"),
            })
          } catch {
            context.ui.toast.show({ message: t("status.unavailable"), variant: "error" })
          }
        },
      },
      {
        id: "opencode-deepseek-peak.peak.sections",
        title: t("command.sections.title"),
        description: t("command.sections.description"),
        group: "DeepSeek",
        palette: true,
        slash: { name: "deepseek-peak-sections" },
        run: () => {
          openSettingsMenu(context, props.settings, props.update, props.lang)
        },
      },
      {
        id: "opencode-deepseek-peak.peak.lang",
        title: t("command.lang.title"),
        description: t("command.lang.description"),
        group: "DeepSeek",
        palette: true,
        slash: { name: "deepseek-peak-lang" },
        run: async () => {
          const picked = await context.ui.dialog.select<LangCode>({
            title: t("settings.lang"),
            options: LANG_META.map((meta) => ({ title: meta.label, value: meta.code })),
            current: props.lang(),
          })
          if (picked !== undefined) {
            await props.update((draft) => {
              draft.lang = picked
            })
          }
        },
      },
    ],
  }))
  return null
}
