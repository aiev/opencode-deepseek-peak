import * as esbuild from "esbuild"

const shared = {
  bundle: true,
  format: "esm",
  platform: "node",
  sourcemap: true,
  external: ["@opencode/plugin", "@opencode/plugin/*", "@opentui/*", "solid-js", "solid-js/*"],
}

await Promise.all([
  esbuild.build({ ...shared, entryPoints: ["src/index.ts"], outfile: "dist/index.js" }),
  esbuild.build({ ...shared, entryPoints: ["src/rpc.ts"], outfile: "dist/rpc.js" }),
])

await import("./build.tui.mjs")
