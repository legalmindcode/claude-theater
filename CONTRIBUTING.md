# Contributing to Claude Theater

Thanks for helping! The single most valuable contribution is a **transcript sample
from a Claude Code version we haven't tested** — that's what keeps the scanner
honest as the format evolves.

## #1 contribution: a format-drift report

If an agent renders oddly after a Claude Code update (a missing room, a wrong
status, an empty task or result), please:

1. Find a recent `agent-*.jsonl` under
   `~/.claude/projects/<encoded-cwd>/<session-id>/subagents/`.
2. **Scrub it.** These files contain real conversation content. Replace every
   task/prompt and every result/text with synthetic placeholder text. Keep the
   structure (the `type`, `message.content` block shapes, `tool_use` names,
   `stop_reason`, `version`) — that's all the scanner cares about.
3. Add it to the `FIXTURES` table in `desktop-mod/hooks/scanner.test.ts` (the
   tests carry the samples inline) and open a PR, or attach it to a format-drift
   issue. Mention the exact `claude --version`.

A scrubbed sample + the version string is enough for us to add a test case.
**Never commit unscrubbed transcript content.**

## Adding a language

The UI is bilingual (English/Hebrew). To add a language, edit the string table
and the tool → activity label table in `desktop-mod/hooks/i18n.ts` (and the cast
names in `desktop-mod/hooks/personas.ts`) — no scanner changes. Keep the key set
identical across languages (`i18n.test.ts` checks the tool tables for parity).
Read the header of `i18n.ts` first: the desktop draws every text as an LTR
paragraph, so a string that holds Hebrew must hold no Latin letters.

## Dev setup

Nothing to install beyond Claude Code itself (2.1.304 or newer):

```bash
claude plugin validate desktop-mod   # the manifest and the hooks module
claude plugin test desktop-mod       # every *.test.ts in desktop-mod/hooks (about 45 s)
```

To run your clone in the desktop app, add it as a marketplace by path instead of
the GitHub slug — `claude plugin marketplace add /path/to/claude-theater` — then
install `agent-theater@claude-theater` as in the README.

## Ground rules

- **Privacy first.** Keep everything local; never add telemetry or outbound
  calls. The mod reads the local transcripts and writes only its own settings.
- **No runtime dependencies.** The mod is TypeScript over Claude Code's plugin
  API — nothing to `npm install`.
- **Keep the scanner isolated.** `desktop-mod/hooks/scanner.ts` is the only code
  that touches raw JSONL; everything else consumes the payload it produces
  (`desktop-mod/types/index.d.ts`).
- Add or update a sample + test in `scanner.test.ts` when you change parsing or
  the payload.
