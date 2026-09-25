#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir, platform } from "node:os"
import { join } from "node:path"
import { applyEdits, modify, parse } from "jsonc-parser"

const PLUGIN_SPEC = "opencode-deepseek-peak"
const base = platform() === "win32"
  ? process.env.APPDATA ?? join(homedir(), "AppData", "Roaming")
  : process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
const directory = join(base, "opencode")

async function readOptional(path) {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (error.code === "ENOENT") return undefined
    throw error
  }
}

async function install() {
  await mkdir(directory, { recursive: true })
  const jsoncPath = join(directory, "opencode.jsonc")
  const jsonc = await readOptional(jsoncPath)
  const targets = [
    [jsonc !== undefined ? jsoncPath : join(directory, "opencode.json"), "https://opencode.ai/config.json"],
    [join(directory, "cli.json"), "https://opencode.ai/v2/cli.json"],
  ]
  // Validate both documents before writing either one. JSONC edits preserve
  // comments, trailing commas and unrelated settings.
  const updates = []
  for (const [path, schema] of targets) {
    const text = await readOptional(path) ?? JSON.stringify({ $schema: schema, plugins: [] }, null, 2) + "\n"
    const errors = []
    const config = parse(text, errors, { allowTrailingComma: true })
    if (errors.length || !config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error(`Invalid configuration: ${path}`)
    }
    const plugins = config.plugins ?? []
    if (!Array.isArray(plugins)) throw new Error(`Expected a plugins array: ${path}`)
    const present = plugins.some((item) => {
      const spec = typeof item === "string" ? item : item?.package
      return spec === PLUGIN_SPEC || spec?.startsWith(`${PLUGIN_SPEC}@`)
    })
    if (present) continue
    const result = applyEdits(text, modify(text, ["plugins"], [...plugins, PLUGIN_SPEC], {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    }))
    updates.push([path, result])
  }
  for (const [path, text] of updates) {
    await writeFile(path, text)
    console.log(`[${PLUGIN_SPEC}] Added to ${path}`)
  }
  console.log(updates.length ? "Restart OpenCode to load DeepSeek Peak." : "DeepSeek Peak is already configured.")
}

install().catch((error) => {
  console.error("Install failed:", error.message)
  process.exitCode = 1
})
