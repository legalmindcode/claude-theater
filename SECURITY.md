# Security Policy

Claude Theater is a local-only visualizer. Its security posture is part of the
product, so this policy doubles as a short statement of how it protects you.

## Security & privacy posture

- **Local-only.** The mod runs inside your Claude Code session; nothing listens
  on a port and nothing is exposed on your network.
- **Read-only.** It reads the transcripts Claude Code already writes
  (`~/.claude/projects`, plus the open-conversations registry in
  `~/.claude/sessions`); it never modifies them and never starts, stops, or
  talks to your agents. The only files of its own it touches are its small logo
  and its finish chime; it writes nothing outside its own settings (language,
  sound, pins).
- **Nothing leaves your machine.** No telemetry, no analytics, no outbound
  network calls. Your conversations and code stay on your computer.
- **No third-party runtime dependencies.** A handful of TypeScript modules over
  Claude Code's plugin API, no packages — a minimal supply-chain surface, easy
  to audit end to end.
- **Local helpers, read-only.** For transcripts too big to read directly it runs
  `head`/`tail`/`ps` (PowerShell and `tasklist` on Windows) and nothing else.

## Supported versions

This is a `0.x` project; only the mod as this repository's marketplace installs
it from `main` is supported. Please update the plugin and reproduce before
reporting.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

1. Preferred: GitHub **private vulnerability reporting** — the
   *Security → Report a vulnerability* button on this repository.
2. Alternatively, email the maintainer at `asaf@legalmind.co.il` with the subject
   `claude-theater security`.

Please include reproduction steps, the affected version, your OS, the Claude Code
version (`claude --version`) and the surface (desktop app Code tab, terminal,
VS Code). I aim to acknowledge reports within a few days. Thank you for helping
keep the project safe.
