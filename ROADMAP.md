# Roadmap

Directional, not a promise. Issues and PRs welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md). The guiding constraints don't change:
**local-only, zero runtime dependencies, degrade-not-crash.**

## Now — 0.5.x

- The Claude desktop app mod (`desktop-mod/`): a 🎭 Theater pane in the Code tab —
  one card per open conversation, one row per subagent, the drawer, pin,
  show/hide finished, search, the 5-hour meter, the demo; text cards in terminal,
  VS Code and mobile sessions.
- Installed through this repository's own plugin marketplace
  (`.claude-plugin/marketplace.json`).
- Isolated scanner with degrade-not-crash.
- Bilingual UI (English / Hebrew), instant toggle, RTL-aware.

## Next

- **Claude Code version adapters** as the format evolves — driven by
  community format-drift reports (the #1 contribution).
- **More languages** — each is an edit to the string tables in
  `desktop-mod/hooks/i18n.ts`.
- Labels for **tools** beyond the current set (broader MCP coverage).

## Ideas (v2, unscheduled)

- Themes / skins.
- Per-agent timing stats (durations, tool histograms).

## Non-goals

- No telemetry, no network calls, nothing leaves your machine.
- No required runtime dependencies.
- No control over agents — Claude Theater only *watches* the transcripts Claude
  Code already writes.
