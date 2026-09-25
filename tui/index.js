// Dual-format TUI entry:
// - OpenCode V1 reads `tui` (TuiPluginModule)
// - OpenCode V2 reads `setup`
import { tui as v1Tui } from "./../dist/tui-v1.js"
import v2Mod from "./../dist/tui.js"

export default {
  id: "opencode-deepseek-peak-tui",
  tui: v1Tui,
  setup: v2Mod.setup,
}
