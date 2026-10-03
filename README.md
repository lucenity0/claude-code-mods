<div align="center">

# Claude Code Mods

**Small plugins that change how Claude Code looks and behaves.**
Each one is a single TypeScript file of function hooks. Clone it, point Claude Code at the folder, and it's live.

![Claude Code](https://img.shields.io/badge/Claude_Code-2.1.287-d97757?style=flat-square)
![mods](https://img.shields.io/badge/mods-4-d97757?style=flat-square)
![tests](https://img.shields.io/badge/tests-39_passing-57ab5a?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-8b8b8b?style=flat-square)

<img src="assets/hero.svg" alt="Claude Code with all four mods running: seatbelt blocking a dangerous rm, the session-dash pane, the turn-meter status line and a ding toast" width="900">

</div>

---

## The mods

| | Mod | What it does | Hooks it uses |
|---|---|---|---|
| ⏱ | [**turn-meter**](#-turn-meter) | Live turn timer in the status line, then the duration and tokens when the turn ends | `turn.start` `turn.complete` `$.ui.status` `$.clock.every` |
| 🛑 | [**seatbelt**](#-seatbelt) | Blocks destructive shell commands and edits to secrets before they run | `tool.call` → `{ deny }` |
| 🔔 | [**ding**](#-ding) | Chime and toast when a long turn finishes, so you can look away | `turn.complete` `$.audio.play` `$.ui.toast` |
| 📊 | [**session-dash**](#-session-dash) | `/dash` opens a live side pane with tool calls, files touched, tokens and turn times | `$.command.register` `$.ui.open` `ui.render` `$.state` `Raster` |

## Quick start

```sh
git clone https://github.com/lucenity0/claude-code-mods ~/claude-code-mods

# try one (or several) for a session
claude --plugin-dir ~/claude-code-mods/seatbelt --plugin-dir ~/claude-code-mods/session-dash
```

To keep them on in every session, add this to `~/.claude/settings.json`:

```jsonc
{
  "env": {
    // colon-separated on macOS / Linux
    "CLAUDE_CODE_PLUGIN_DIRS": "~/claude-code-mods/turn-meter:~/claude-code-mods/seatbelt:~/claude-code-mods/ding:~/claude-code-mods/session-dash"
  }
}
```

Interactive sessions watch those folders, so saving a mod hot-reloads it right away.

> [!NOTE]
> Function hooks are an **early-access** Claude Code API and can change between releases. These mods are built and tested against **Claude Code 2.1.287**.

---

## ⏱ turn-meter

A stopwatch in the status line while Claude works, and the bill when it's done.

```
⏱ 12s                              ← while the turn runs
✓ 41s · 12.3k in · 1.8k out        ← when it finishes
✗ stopped after 8s                 ← if you hit Esc
```

The core of it is a timer that starts on `turn.start` and is cancelled on `turn.complete`:

```ts
on('turn.start', ($, e, next) => {
  ticker?.cancel()
  let seconds = 0
  $.ui.status('⏱ 0s')
  ticker = $.clock.every(1000, () => {
    seconds += 1
    $.ui.status(`⏱ ${formatDuration(seconds * 1000)}`)
  })

  return next(e)
})
```

"In" counts every input token, cached ones included. Subagent turns are ignored.

## 🛑 seatbelt

A last line of defence. Every `Bash`, `Edit`, `Write` and `NotebookEdit` call is checked against a list of rules **before** it runs. When one matches, the call is denied, the model is told not to work around it, and you get a toast.

```
● Bash(rm -rf /tmp/build/../../)
  ⎿  seatbelt: blocked `rm -rf /tmp/build/../../` (rm -rf on / or ~): it recursively
     deletes the filesystem root, a top-level folder or your home folder. Do not retry…
```

| Rule | Blocks | Still allows |
|---|---|---|
| `rm -rf` on `/`, top-level dirs, `~` | `rm -rf /`, `sudo rm -rf /*`, `rm -fr ~`, `rm -rf /tmp/x/../../` | `rm -rf node_modules`, `rm -rf ./build` |
| Force-push to main | `git push -f origin main`, `git push origin +master` | `git push --force origin my-branch` |
| Internet → shell | `curl … \| bash`, `wget -qO- … \| sudo sh` | `curl -o install.sh …` |
| Disk wipers | `mkfs.ext4 /dev/sda1`, `dd … of=/dev/disk2` | |
| World-writable trees | `chmod -R 777 .` | `chmod 755 script.sh` |
| Fork bomb | `:(){ :\|:& };:` | |
| Secrets | edits to `.env`, `.env.local`, `*.pem`, `*.key`, `id_rsa*`, `~/.ssh/*` | `.env.example`, `.env.sample` |

Paths are normalized before they're checked, so `..` tricks don't slip through. Each rule is a small, plain object, so adding one is a few lines in [`seatbelt/hooks/rules.ts`](seatbelt/hooks/rules.ts):

```ts
{
  name: 'curl | sh',
  reason: 'pipes a script from the internet straight into a shell',
  matches: command => /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(command),
},
```

The hook that enforces the rules is the whole idea in one call:

```ts
on('tool.call', { tool: 'Bash' }, ($, e, next) => {
  const rule = firstMatch(BASH_RULES, e.command)
  if (rule === undefined) return next(e)          // let it run

  $.ui.toast(`🛑 seatbelt blocked ${rule.name}: ${clip(e.command)}`)
  return { deny: `seatbelt: blocked … (${rule.name}): it ${rule.reason}. …` }
})
```

> [!WARNING]
> seatbelt is a guardrail against accidents, not a sandbox. Pattern matching can be bypassed by a determined script.

## 🔔 ding

Start a long task, go make coffee, and come back when it chimes.

```
                                                         🔔 Done in 47s
```

When a main-loop turn that ran past the threshold finishes, ding shows a toast and plays [`sounds/done.wav`](ding/sounds/done.wav), an original two-note chime generated for this repo. Interrupted turns and subagent turns stay quiet. The sound plays on macOS through `afplay`. Other platforms get the toast only.

Both options show up in `/config`, or you can set them directly:

```json
{ "pluginConfigs": { "ding": { "options": { "thresholdSeconds": 60, "sound": false } } } }
```

## 📊 session-dash

Type **`/dash`** to dock a live dashboard beside the transcript. Type `/dash` again, or press `q`, to close it.

```
╭─ Session ─────────────────────────────╮
│ 4 turns · 2m13s · 184k in · 9.2k out  │
│ 1 blocked · 0 errored                 │
│                                       │
│ Tools (23 calls)                      │
│ Bash  ████████████████████ 9          │
│ Read  ███████████████ 7               │
│ Edit  █████████ 4                     │
│ Grep  ████ 2                          │
│                                       │
│ Turn time (last 12) · max 1m12s       │
│ ▂▄▃▆▁▅█▃▄▁▆▃                          │
│                                       │
│ Recent files (2)                      │
│ src/server.ts                         │
│ README.md                             │
│                                       │
│ [ Reset ]  [ Close ]                  │
╰───────────────────────────────────────╯
```

The stats live in `$.state`, so they survive hot reloads. Any write redraws only the parts of the pane that read the value. Every tool call passes through a counter on its way to the engine:

```ts
on('tool.call', async ($, e, next) => {
  const ran = await next(e)                              // let the tool run first…
  await update($, stats, current =>                      // …then record how it went
    countTool(current, e.tool, { isDenied: ran.deny !== undefined, isError: ran.isError === true }),
  )
  return ran
})
```

In the terminal the sparkline is drawn as a single `Raster`: one packed grid of colored cells, not one element per bar. Other surfaces fall back to `Text`.

---

## Make your own

A mod is three files. This is a complete one that toasts every time Claude edits a file:

```
hello/
├── .claude-plugin/plugin.json   { "name": "hello", "version": "0.1.0", "description": "…" }
└── hooks/
    ├── hooks.json               { "modules": ["./register.ts"] }
    └── register.ts
```

```ts
import type { Register } from 'claude-code'

export const register: Register = on => {
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const result = await next(e)
    $.ui.toast(`✏️  edited ${e.file_path.split('/').pop()}`)
    return result
  })
}
```

Every hook has the shape `($, e, next)`:

- `$` is the engine: `$.ui`, `$.clock`, `$.state`, `$.tool`, `$.audio` and the rest.
- `e` is the event.
- `next(e)` passes control on.

Return without calling `next` to answer for yourself (for example `{ deny }`), or call `next({ ...e, … })` to rewrite what the rest of the chain sees.

| You want… | Hook / call | See |
|---|---|---|
| a status line | `$.ui.status(text)` | turn-meter |
| a toast | `$.ui.toast(text)` | ding, seatbelt |
| to block or rewrite a tool call | `on('tool.call', { tool })` → `{ deny }` / `next({...e})` | seatbelt |
| a sound | `$.audio.play({ asset })` | ding |
| user settings | `userConfig` in `plugin.json` → `register(on, options)` | ding |
| a slash command | `$.command.register` + `on('command.run')` | session-dash |
| a pane | `$.ui.open` + `on('ui.render', { component: 'Pane' })` | session-dash |
| state that survives reloads | `atom` / `read` / `update` + a `types/index.d.ts` contract | session-dash |

Check your mod, then run its tests:

```sh
claude plugin validate ./hello   # what it hooks and calls, and anything the engine would refuse
claude plugin test ./hello       # runs hooks/*.test.ts against the real engine
```

Once Claude Code has loaded a mod, it writes the full API typings into `.claude-plugin/types/` (ignored by git), so `tsc -p ./hello` type-checks it.

## Ideas for what's next

- [ ] **todo-band**: pinned TODOs in a row above the prompt, ticked off with buttons
- [ ] **scratchpad**: a `notes` tool the model can call, persisted across sessions
- [ ] **cost-cap**: warn, then stop, when a session passes a token budget
- [ ] **focus-mode**: hide tool rows and show only Claude's answers

PRs and new mod ideas are welcome. Open an issue!

## License

[MIT](LICENSE)
