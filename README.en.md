[繁體中文](README.md) · **English**

# VibingWrapper

A Windows live wallpaper whose weather follows your Claude Code sessions — sky, sea, and a small fleet of boats.

When Claude is thinking, the sky clouds over. When it starts running tools, a thunderstorm rolls in. When it's done, the rain stops and the sun breaks through.
And when it stops to ask you a question or wait for your approval, a single star lights up and slowly pulses.
You never have to switch windows: the corner of your eye tells you what your AI is up to.

![The sea at night: five Claude Code sessions are five boats. The star overhead and one boat's lamps are pulsing — that session is waiting for you](docs/screenshots/ocean-night.jpg)

## States

| What Claude Code is doing | Weather | Top-right HUD |
|---|---|---|
| Idle | Clear | AI · 待命 (standby) |
| Got your prompt (UserPromptSubmit) | Overcast | AI · 思考中 (thinking) |
| Running tools (PreToolUse) | Thunderstorm | AI · 執行中 (working) |
| Finished (Stop) | Clearing, then clear after 20 s | AI · 收尾 (wrapping up) |
| Asking you a question / waiting for permission | Sky dims, one star pulses | AI · 等你 (waiting for you) |

**Several sessions at once (up to 5):** each session keeps its own state, and the sky shows the most urgent one (waiting > storm > overcast > clearing > clear).
On the sea wallpapers every session is a boat: busy boats get underway with a wake behind them, and the boat that is waiting for you blinks its lamps — so you can tell at a glance which session needs you.

## Three wallpapers

Gear menu → 桌布 (wallpaper) cycles through them:

- **Weather (天氣)** — sky only: clouds, rain, lightning, crepuscular rays, following the real sunrise and sunset in Taipei.
- **Weather + sea (天氣＋海)** — a distant sea fills the lower part of the screen, mirroring the same sky, with the fleet on it.
- **Sea (海)** — a 3D ocean seen from just above the water: crests, foam, moonlight, and the fleet riding the swell.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/weather-storm.jpg" alt="Weather: thunderstorm with lightning"><br>Weather · working (thunderstorm)</td>
<td width="50%"><img src="docs/screenshots/sky-sea-dusk.jpg" alt="Weather + sea: the fleet at dusk"><br>Weather + sea · the fleet at dusk</td>
</tr>
<tr>
<td><img src="docs/screenshots/ocean-day.jpg" alt="Sea: daytime"><br>Sea · daytime</td>
<td><img src="docs/screenshots/ocean-storm.jpg" alt="Sea: thunderstorm"><br>Sea · thunderstorm</td>
</tr>
</table>

The wallpaper lives behind your desktop icons and never gets in the way. It pauses itself while a maximized or full-screen window covers the desktop.

## Little tools

| Feature | Shortcut |
|---|---|
| Hide / show all desktop icons | Ctrl+Alt+D |
| Boss key — wallpaper and HUD vanish, only a tiny gear stays | Ctrl+Alt+B (change it in the gear menu) |
| Screen eyedropper (copies `#RRGGBB`) | Ctrl+Q |
| Region screenshot (clipboard + `Pictures\Saved Pictures`) | Ctrl+R |

The UI is in Traditional Chinese.

## Install

Requires Windows 10 / 11, [Node.js](https://nodejs.org/) 18+, and [Claude Code](https://claude.com/claude-code).

```bash
git clone https://github.com/youllook/VibingWrapper.git
cd VibingWrapper
npm install
npm start
```

`npm run shortcut` creates a desktop shortcut. "Start with Windows" (開機自動啟動) is in the tray menu.

## Connect Claude Code

VibingWrapper listens for Claude Code hook events on `127.0.0.1:47321`. Merge this into the `hooks` of `~/.claude/settings.json` (if you already have hooks, add these entries to the matching arrays rather than replacing them):

```json
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -o /dev/null -X POST -H \"Content-Type: application/json\" --data-binary @- http://127.0.0.1:47321/claude 2>/dev/null || true", "timeout": 3, "async": true }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -o /dev/null -X POST -H \"Content-Type: application/json\" --data-binary @- http://127.0.0.1:47321/claude 2>/dev/null || true", "timeout": 3, "async": true }] }],
    "PreToolUse":       [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -o /dev/null -X POST -H \"Content-Type: application/json\" --data-binary @- http://127.0.0.1:47321/claude 2>/dev/null || true", "timeout": 3, "async": true }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -o /dev/null -X POST -H \"Content-Type: application/json\" --data-binary @- http://127.0.0.1:47321/claude 2>/dev/null || true", "timeout": 3, "async": true }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -o /dev/null -X POST -H \"Content-Type: application/json\" --data-binary @- http://127.0.0.1:47321/claude 2>/dev/null || true", "timeout": 3, "async": true }] }],
    "SubagentStop":     [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -o /dev/null -X POST -H \"Content-Type: application/json\" --data-binary @- http://127.0.0.1:47321/claude 2>/dev/null || true", "timeout": 3, "async": true }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -o /dev/null -X POST -H \"Content-Type: application/json\" --data-binary @- http://127.0.0.1:47321/claude 2>/dev/null || true", "timeout": 3, "async": true }] }]
  }
}
```

When VibingWrapper isn't running, curl gives up quietly after one second, so Claude Code is never slowed down.
Claude Code sessions that were already open need a restart to pick up the new hooks.

Received events are logged by name and the first 8 characters of the session ID only (`%APPDATA%\vibing-wrapper\weather-log.jsonl`, rotated at 1 MB) — never prompt text, commands, or paths.

## Files

| Path | What it is |
|---|---|
| `main.js` | Electron main process: HUD window, tray, settings |
| `prototype/hud.html` | The top-right AI state icon + gear menu |
| `tools/claude-bridge.js` | Hook events → per-session state → combined weather → `weather/state.json`; also serves the `weather/` pages |
| `tools/wallpaper.js`, `attach-wallpaper.ps1` | Parents the wallpaper window behind the desktop icons (WorkerW) |
| `weather/index.html` | Weather wallpaper (`?sea=1` adds the sea), a single WebGL fragment shader |
| `weather/ocean.html` | 3D ocean and fleet |
| `weather/demo.html` | Tuning page: switch states, scrub the clock through day and night |
| `tools/desktop-icons.*`, `boss-key.js`, `capture.*` | Desktop-icon toggle, boss key, eyedropper / screenshot |

## Credits

- Cloud rendering after [power418/skygl](https://github.com/power418/skygl) (MIT), squeezed into a single 2D pass.
- The 3D ocean and the fleet were designed and built by Claude (Fable); the AI state icons and the logo were designed by Codex.
- The whole project was written with Claude Code.

## License

[MIT](LICENSE)
