import type { Plugin } from "@opencode/plugin/tui"
import { createT, LANG_META, type LangCode } from "../i18n.js"
import type { TuiSettings } from "../types.js"

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * Native sections menu: each pick applies and persists immediately, then the
 * menu reopens (the host closes the dialog before the next select). Cancelling
 * exits the menu.
 */
export function openSettingsMenu(
  context: Plugin.Context,
  settings: TuiSettings,
  update: (mutation: (draft: TuiSettings) => void) => Promise<void>,
  lang: () => LangCode,
): void {
  const t = createT(lang)
  const onOff = (value: boolean) => (value ? t("settings.on") : t("settings.off"))

  const pickBool = (title: string, current: boolean) =>
    context.ui.dialog.select<boolean>({
      title,
      options: [
        { title: t("settings.on"), value: true },
        { title: t("settings.off"), value: false },
      ],
      current,
    })

  void (async () => {
    while (true) {
      const choice = await context.ui.dialog.select<string>({
        title: t("settings.title"),
        options: [
          { title: `${t("settings.toast")}: ${onOff(settings.toast)}`, value: "toast" },
          { title: `${t("settings.footer")}: ${onOff(settings.indicator)}`, value: "indicator" },
          { title: `${t("settings.sidebar")}: ${onOff(settings.sidebarIndicator !== false)}`, value: "sidebar" },
          { title: `${t("settings.evidence")}: ${onOff(settings.sidebarEvidence !== false)}`, value: "evidence" },
          {
            title: `${t("settings.frequency")}: ${settings.toastEveryRequest ? t("frequency.every") : t("frequency.change")}`,
            value: "frequency",
          },
          {
            title: `${t("settings.lang")}: ${LANG_META.find((meta) => meta.code === lang())?.label ?? lang()}`,
            value: "lang",
          },
        ],
      })
      if (choice === undefined) return

      if (choice === "toast") {
        const picked = await pickBool(t("settings.toast"), settings.toast)
        if (picked !== undefined) {
          await update((draft) => {
            draft.toast = picked
          })
        }
      } else if (choice === "indicator") {
        const picked = await pickBool(t("settings.footer"), settings.indicator)
        if (picked !== undefined) {
          await update((draft) => {
            draft.indicator = picked
          })
        }
      } else if (choice === "sidebar") {
        const picked = await pickBool(t("settings.sidebar"), settings.sidebarIndicator !== false)
        if (picked !== undefined) {
          await update((draft) => {
            draft.sidebarIndicator = picked
          })
        }
      } else if (choice === "evidence") {
        const picked = await pickBool(t("settings.evidence"), settings.sidebarEvidence !== false)
        if (picked !== undefined) {
          await update((draft) => {
            draft.sidebarEvidence = picked
          })
        }
      } else if (choice === "frequency") {
        const picked = await context.ui.dialog.select<"change" | "every">({
          title: t("settings.frequency"),
          options: [
            { title: t("frequency.change"), value: "change" },
            { title: t("frequency.every"), value: "every" },
          ],
          current: settings.toastEveryRequest ? "every" : "change",
        })
        if (picked !== undefined) {
          await update((draft) => {
            draft.toastEveryRequest = picked === "every"
          })
        }
      } else if (choice === "lang") {
        const picked = await context.ui.dialog.select<LangCode>({
          title: t("settings.lang"),
          options: LANG_META.map((meta) => ({ title: meta.label, value: meta.code })),
          current: lang(),
        })
        if (picked !== undefined) {
          await update((draft) => {
            draft.lang = picked
          })
        }
      }

      await nextTick()
    }
  })()
}
