import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { parse } from "jsonc-parser"

test("installer preserves JSONC and installs once in server and CLI config", async () => {
  const root = await mkdtemp(join(tmpdir(), "deepseek-peak-install-"))
  try {
    const directory = join(root, "opencode")
    await mkdir(directory)
    const server = join(directory, "opencode.jsonc")
    const cli = join(directory, "cli.json")
    await writeFile(server, '{\n// Keep this comment\n"plugins": [{"package":"other-plugin"}],\n"model": "test/model",\n}\n')
    await writeFile(cli, '{"plugins": ["other-tui"], "animations": false}')
    const run = () => execFileSync(process.execPath, [fileURLToPath(new URL("../install.mjs", import.meta.url))], {
      env: { ...process.env, XDG_CONFIG_HOME: root, APPDATA: root },
    })
    run()
    const first = await readFile(server, "utf8")
    assert.match(first, /Keep this comment/)
    assert.deepEqual(parse(first).plugins, [{ package: "other-plugin" }, "opencode-deepseek-peak"])
    assert.equal(parse(first).model, "test/model")
    assert.deepEqual(parse(await readFile(cli, "utf8")), {
      plugins: ["other-tui", "opencode-deepseek-peak"], animations: false,
    })
    run()
    assert.equal(await readFile(server, "utf8"), first)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
