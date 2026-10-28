<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

# 🎭 Claude Theater

**Watch your Claude Code conversations and subagents work — a live office, in real time.**

[![CI](https://github.com/legalmindcode/claude-theater/actions/workflows/ci.yml/badge.svg)](https://github.com/legalmindcode/claude-theater/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

<!-- Absolute raw URL so the image renders outside GitHub too (relative paths don't). -->
<img src="https://raw.githubusercontent.com/legalmindcode/claude-theater/main/docs/screenshots/desktop-pane.png" alt="The Theater pane in the Claude desktop app: a card per conversation, a row per subagent with its persona, model and status, the 5-hour usage meter, and the Legal Mind credit" width="420">

<sub>The 🎭 Theater pane in the Claude desktop app's Code tab: a card per conversation, a row per subagent, the 5-hour usage meter. A community visualizer **for Claude Code** — not affiliated with Anthropic.</sub>

</div>

**Claude Theater is a Claude Code plugin (a "mod")** that draws a **🎭 Theater** pane
beside your chat in the **Claude desktop app's Code tab** — no browser tab, no
server, nothing else to install.

**Why?** When you fan out a handful of subagents, the terminal becomes a wall of
interleaved JSON. Claude Theater turns it into a glance — who's working, who's
stuck, who just finished — without reading a single log line.

**Safe by design:** it runs entirely on your machine. It only *reads* your local
Claude Code transcripts, writes nothing outside its own settings, makes no network
calls and sends no telemetry. ([more](#privacy))

Want to look around without a single real subagent? Once installed, ⚙️ → *Demo*
(or `d`) fills the office with synthetic agents.

## Install

In the Claude desktop app, where `/plugin` doesn't run: click **+** next to the
prompt box → **Plugins** → **Add marketplace** → `legalmindcode/claude-theater`
→ **Add plugin** → `agent-theater`.

Or in a terminal Claude Code session:

```text
/plugin marketplace add legalmindcode/claude-theater
/plugin install agent-theater@claude-theater
```

(The marketplace is this repository's own `.claude-plugin/marketplace.json`.
`/plugin install` opens the plugin's details; pick the user scope and it loads in
the desktop app's local sessions too. From a plain shell the same two steps are
`claude plugin marketplace add legalmindcode/claude-theater` and
`claude plugin install agent-theater@claude-theater`.)

**Requires** the Claude desktop app's Code tab and **Claude Code 2.1.304 or newer**.
The mod is built on Claude Code's early-access function-hooks API, which may
change between releases — if a Claude Code update breaks the mod, please open an
issue here. Developed and tested on 2.1.304–2.1.308.

## The office

- **One framed card per open conversation**, titled by its subject, with **one row
  per subagent**: its persona, its model, what it's doing right now — and ✓ when
  it's finished (★ the moment it finishes, ✕ on a failure, ⏱︎ when it runs long) —
  calm monochrome marks in the Legal Mind teal, the personas in colour.
- **Click a row for its drawer** — the full task and the result, without leaving
  the chat.
- **Pin a conversation** (📌 on its title) to keep it at the top.
- **Show or hide the finished** — per conversation (`▸ 2 more finished`) or for
  the whole office with *Show finished*.
- **Search** shows up once the office gets large (more than 12 agents).
- **Hebrew and English**, one click apart; Hebrew flips the layout to RTL.
- **A 5-hour usage meter** in the office header and the status line, with a
  heads-up toast at 80% and 95% of the window.
- **A demo** — ⚙️ → *Demo* fills the office with synthetic agents, so you can look
  around without a single real subagent.
- It **opens itself** when your first subagent starts (or run `/theater`), and a
  finish gets a short toast naming the conversation plus a chime (mute with 🔔).
- In a terminal, VS Code or mobile session the same pane draws as **text cards**.

**Keys** (with the pane focused): `j`/`k` walk the rows · `o`/`Enter` open ·
`x` close · `f` show finished · `m` mute · `h` settings · `l` language · `d` demo.

## How it works

- Polls the transcripts Claude Code already writes — the session files (your
  conversations), `**/subagents/agent-*.jsonl` (the subagents they spawn), the
  workflow journals and the open-conversations registry in `~/.claude/sessions`.
  Claude Theater only reads them; it never starts or controls agents.
- One module, `desktop-mod/hooks/scanner.ts`, is the **only** code that touches
  the raw transcript format. Everything else consumes the payload it produces
  (typed in `desktop-mod/types/index.d.ts`), so a Claude Code format change is
  absorbed in one place.
- **Degrades, never crashes:** corrupt lines are skipped, unknown keys are
  ignored, and an agent missing fields still shows up instead of vanishing. A
  conversation whose transcript is too long to read is counted, and the pane says
  how many are too long to show.

## Privacy

Your transcripts contain real conversation content, so Claude Theater is built to
keep them on your machine:

- **Read-only.** It only reads your local Claude Code transcripts
  (`~/.claude/projects`, plus the open-conversations registry in
  `~/.claude/sessions`); the only file of its own it reads is its small logo, which
  ships in the mod's folder.
- **Writes nothing** outside its own settings (language, sound, pins).
- **Never transmits** anything anywhere — no network calls, no telemetry.
- **No server, no port.** The pane is drawn inside your Claude Code session;
  nothing listens on your machine.
- For transcripts too big to read directly it runs local read-only helpers
  (`head`/`tail`/`ps`, or PowerShell and `tasklist` on Windows).

## Development

```bash
claude plugin validate desktop-mod   # the manifest and the hooks module
claude plugin test desktop-mod       # every *.test.ts beside the modules (about 45 s)
```

The tests live beside the modules in `desktop-mod/hooks/*.test.ts`; the scanner
tests run synthetic transcript samples through the port and fail loudly if the
format drifts. Contributing a scrubbed transcript sample from a new Claude Code
build is the most valuable contribution — **scrub every prompt and result first**
(see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Compatibility

Developed and tested on Claude Code 2.1.304–2.1.308 (the requirement is under
[Install](#install)). If a newer build renders oddly — a missing room, a wrong
status, an empty task — please open a *format-drift report* with a scrubbed sample
so we can add a test case.

## License

[MIT](LICENSE) © 2026 Asaf Abramzon. "Claude" is a trademark of Anthropic;
this is an independent, community project for Claude Code.
