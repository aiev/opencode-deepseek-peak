import * as esbuild from "esbuild"

const shared = {
  bundle: true,
  format: "esm",
  platform: "node",
  sourcemap: true,
  external: [
    "@opencode/plugin",
    "@opencode/plugin/*",
    "@opencode-ai/*",
    "@opentui/*",
    "solid-js",
    "solid-js/*",
  ],
}

await Promise.all([
  esbuild.build({ ...shared, entryPoints: ["src/index.ts"], outfile: "dist/index.js" }),
  esbuild.build({ ...shared, entryPoints: ["src/rpc.ts"], outfile: "dist/rpc.js" }),
  esbuild.build({ ...shared, entryPoints: ["src/v1/tui.tsx"], outfile: "dist/tui-v1.js" }),
])

await import("./build.tui.mjs")
