# OpenCode DeepSeek Peak

OpenCode V2 plugin that reports whether a request falls in an official peak or
off-peak pricing period.

The package name is historical: the plugin now works across providers. It uses
built-in official schedules where they are known and explicit pricing headers
returned by any API. When neither is available it shows no indicator instead of
guessing.

The sidebar evidence also names the next schedule change, for example
`Official schedule · ▼ 07:00` in your local time (`10:00 UTC` when the timezone
setting is UTC): `▲` means peak starts, `▼` means peak ends, and the weekday is
added when the change lands on another day. A trailing `*` means the period is
computed from the schedule before any request was observed. The line never
wraps and refreshes itself while the session is idle. The `/deepseek-peak`
dialog lists the full peak windows.

Indicators follow each tab's session and selected model independently, including
when only the prompt footer is visible. Changing to a model without a known
pricing period hides the previous indicator; late previews cannot replace a
newer refresh or provider event.

## Screenshot

![Sidebar indicator showing DeepSeek off-peak and the next schedule change](https://raw.githubusercontent.com/aiev/opencode-deepseek-peak/main/assets/sidebar-indicator.png)

## Providers

- **DeepSeek** — peak **01:00–04:00 UTC** and **06:00–10:00 UTC**, Monday
  through Friday, excluding Chinese public holidays.
- **Z.ai Coding Plan** — peak **14:00–18:00 Singapore time (UTC+8)**, Monday
  through Friday. Applies only to the coding endpoints (`/api/coding`,
  `/api/anthropic`, `/api/v1`); the standard pay-as-you-go API has flat pricing
  and is not matched.
- **Alibaba Model Studio** — busy hours **08:00–22:00 Beijing time (UTC+8)**,
  every day, for the models `deepseek-v4.1-flash`, `deepseek-v4-pro-0813` and
  `deepseek-v4-flash-0731` served from `dashscope.aliyuncs.com`. The
  international endpoint is not matched.
- **Alibaba Token Plan** — full Credits **08:00–22:00 Beijing time (UTC+8)**, every
  day; the published night discount (50% off) applies **22:00–08:00** for
  `deepseek-v4.1-flash`, `deepseek-v4-pro-0813` and `deepseek-v4-flash-0731`,
  and **60% off** in the same window for `qwen3.8-max` and `qwen3.8-flash`.
  This follows the current limited-time promotion.

## How detection works

Profiles are resolved in this order:

1. **Exact provider ID** — this keeps working behind local proxies such as
   `http://127.0.0.1:8787/v1`.
2. **Request base URL** against official endpoints, for custom-named providers.
3. **Model filter** for provider products that cover only some models.

If nothing matches and no pricing header arrives, the plugin shows no indicator
and `/deepseek-peak` explains that no official schedule is known — it never
guesses a period.

API response headers always win over schedules. The accepted header names stay
the same:

- `x-deepseek-pricing-tier: peak|off-peak`
- `x-deepseek-price-period: peak|off-peak`
- `x-deepseek-peak: true|false`
- `x-pricing-tier: peak|off-peak`

A header is cached for the configured TTL. When an API header disagrees with the
schedule, the indicator marks it (`⚠`).

## Commands

- `/deepseek-peak` — show the last observed status and evidence.
- `/deepseek-peak-sections` — toggle toast, footer indicator, sidebar indicator,
  sidebar evidence, toast frequency, timezone (local or UTC), and language.
- `/deepseek-peak-lang` — switch the display language.

The command names are kept for compatibility.

## Language

The interface follows the environment language (`LANG`/`LC_ALL`) and defaults
to English. English, Portuguese, Simplified Chinese, Japanese, and Korean are
available; change it from `/deepseek-peak-lang` or the sections menu. Chinese
public holidays are localized too (for example `中秋节` in Chinese and
`Mid-Autumn Festival` in English).

## Installation

Once published to npm:

```sh
npm install -g opencode-deepseek-peak
opencode-deepseek-peak
```

The installer adds the package to the OpenCode server and CLI configurations as
well as `tui.json(c)` for OpenCode V1, preserving existing settings. Restart
OpenCode after installation.

For manual configuration, add the package to both plugin lists:

```jsonc
{
  "plugins": ["opencode-deepseek-peak"]
}
```

Optional server settings:

```jsonc
{
  "plugins": [{
    "package": "opencode-deepseek-peak",
    "options": {
      "providerIDs": [],
      "apiSignalHeaders": ["x-deepseek-pricing-tier"],
      "apiSignalTtlMs": 300000
    }
  }]
}
```

`providerIDs` is an optional allowlist: leave it empty or omit it to observe
every provider. `apiSignalHeaders` and `apiSignalTtlMs` are unchanged in
meaning: which response headers to accept and how long a header stays cached.

## OpenCode V1

OpenCode V1 loads TUI plugins from `tui.json` (`plugin` list) and has no
server-side plugin hooks, so the V1 build computes schedules locally per
session from the provider/model, resolving the same profiles (the DeepSeek
schedule is the fallback when the model is unknown). Sidebar and prompt-right
indicators, commands, toast on period change, settings, and i18n all work. Only
the API header source of truth is unavailable there.

```jsonc
// ~/.config/opencode/tui.jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-deepseek-peak"]
}
```

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```
