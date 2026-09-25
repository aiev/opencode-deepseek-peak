# OpenCode DeepSeek Peak

OpenCode V2 plugin that reports whether a DeepSeek request is in the official
peak or off-peak pricing period.

The current official schedule is peak from **01:00–04:00 UTC** and
**06:00–10:00 UTC**, Monday through Friday, excluding Chinese public holidays.
All other times are off-peak.

The plugin also watches API response headers. The official DeepSeek API does
not currently document a peak/off-peak response header, so the schedule remains
the source unless DeepSeek or a local proxy returns one of:

- `x-deepseek-pricing-tier: peak|off-peak`
- `x-deepseek-price-period: peak|off-peak`
- `x-deepseek-peak: true|false`
- `x-pricing-tier: peak|off-peak`

When such a header exists, it becomes the source of truth and the indicator
marks disagreements with `⚠`.

The sidebar evidence also names the next schedule change, for example
`Official schedule · ▼ 07:00` in your local time (`10:00 UTC` when the timezone
setting is UTC): `▲` means peak starts, `▼` means peak ends, and the weekday is
added when the change lands on another day. The line never wraps and refreshes
itself while the session is idle. The `/deepseek-peak` dialog lists the full
peak windows.

## Commands

- `/deepseek-peak` — show the last observed status and evidence.
- `/deepseek-peak-sections` — toggle toast, footer indicator, sidebar indicator,
  sidebar evidence, toast frequency, timezone (local or UTC), and language.
- `/deepseek-peak-lang` — switch the display language.

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
      "providerIDs": ["deepseek"],
      "apiSignalHeaders": ["x-deepseek-pricing-tier"],
      "apiSignalTtlMs": 300000
    }
  }]
}
```

## OpenCode V1

OpenCode V1 loads TUI plugins from `tui.json` (`plugin` list) and has no
server-side plugin hooks, so the V1 build computes the official schedule
locally: sidebar and prompt-right indicators, commands, toast on period
change, settings, and i18n all work. Only the API response header source of
truth is unavailable there.

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
