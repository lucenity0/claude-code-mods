# mods

Small mods for [Claude Code](https://claude.com/claude-code). Each folder is a self-contained plugin built on Claude Code's **function hooks**, a TypeScript module that can draw panes and status lines, block or rewrite tool calls, add slash commands and play sounds.

| Mod | What it does |
| --- | --- |
| [**turn-meter**](#turn-meter) | Live turn timer in the status line, then duration and tokens when the turn ends |
| [**seatbelt**](#seatbelt) | Blocks destructive shell commands and edits to secrets before they run |
| [**ding**](#ding) | Chime and toast when a long turn finishes, so you can look away |
| [**session-dash**](#session-dash) | `/dash` opens a live side pane: tool calls, files touched, tokens, turn-time sparkline |

> Function hooks are an **early-access** Claude Code API and may change between releases. These mods were built and tested against Claude Code 2.1.287.

## Install

Clone the repo, then point Claude Code at the mods you want.

```sh
git clone <this repo> ~/mods

# one session, any mods you like
claude --plugin-dir ~/mods/seatbelt --plugin-dir ~/mods/turn-meter
```

To load them in every session, list the folders in `~/.claude/settings.json` (colon-separated on macOS/Linux):

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/mods/seatbelt:~/mods/turn-meter:~/mods/ding:~/mods/session-dash"
  }
}
```

Interactive sessions watch these folders, so saving a change reloads the mod immediately.

---

## turn-meter

While a turn runs, the status line under the prompt counts up (`⏱ 12s`). When the turn ends it shows the totals:

```
✓ 41s · 12.3k in · 1.8k out
```

"In" counts every input token, cached ones included. Subagent turns are ignored, and an interrupted turn shows `✗ stopped after …`.

## seatbelt

Checks every `Bash`, `Edit`, `Write` and `NotebookEdit` call before it runs. When a call matches a rule, seatbelt denies it, tells the model not to work around the block, and shows a toast.

| Rule | Example it blocks |
| --- | --- |
| `rm -rf` on `/`, a top-level folder, or `~` | `rm -rf /`, `rm -fr ~`, `rm -rf /tmp/x/../../` (paths are normalized) |
| Force-push to main/master | `git push -f origin main`, `git push origin +master` |
| Piping the internet into a shell | `curl … \| bash`, `wget -qO- … \| sudo sh` |
| Disk wipers | `mkfs.ext4 …`, `dd … of=/dev/disk2` |
| `chmod -R 777` | `chmod -R 777 .` |
| Fork bomb | `:(){ :\|:& };:` |
| Secret files | edits to `.env`, `.env.local`, `*.pem`, `*.key`, `id_rsa*`, anything in `~/.ssh/` (`.env.example` is fine) |

Everyday commands still go through, for example `rm -rf node_modules`, `git push --force origin my-branch` and `git push origin main`. To add a rule, append it to `BASH_RULES` or `FILE_RULES` in [`seatbelt/hooks/rules.ts`](seatbelt/hooks/rules.ts) and add a case to the test file.

seatbelt is a guardrail against accidents, not a sandbox. A determined script can get past pattern matching.

## ding

When a main-loop turn that ran at least 30 seconds finishes, ding shows `🔔 Done in 47s` and plays a short chime. On macOS the chime plays through `afplay`. Elsewhere you get the toast only. Interrupted turns and subagent turns stay quiet.

Both settings appear in `/config`, or you can set them in settings:

```json
{ "pluginConfigs": { "ding": { "options": { "thresholdSeconds": 60, "sound": false } } } }
```

## session-dash

Type `/dash` to open a side pane, and `/dash` again (or `q`) to close it. The pane shows:

- turns, total time, and input and output tokens
- tool calls by tool, as bars
- a sparkline of the last 30 turn durations, drawn as a `Raster` in the terminal
- the files most recently read or edited
- the number of blocked and errored calls

Press `r` to reset the counters. The stats live in session state, so they survive hot reloads.

---

## Making your own

Each mod has the same layout:

```
my-mod/
  .claude-plugin/plugin.json   name, version, description (+ "types" if it keeps $.state)
  hooks/hooks.json             { "modules": ["./register.ts"] }
  hooks/register.ts(x)         export const register: Register = (on, options) => { ... }
  hooks/*.test.ts              tests, run by `claude plugin test`
  types/index.d.ts             state contract (only if the mod uses $.state)
```

Check it, then test it:

```sh
claude plugin validate ./my-mod   # what the mod hooks and calls, and anything the engine would refuse
claude plugin test ./my-mod       # runs hooks/*.test.ts against the real engine
```

Once Claude Code has loaded a mod, it writes the API typings into `.claude-plugin/types/` (ignored by git), so `tsc -p ./my-mod` type-checks it.
