<!-- Thanks for contributing to Claude Theater! Keep it short. -->

## What & why

<!-- What does this change, and why? Link any related issue (e.g. Closes #12). -->

## Checklist

- [ ] `claude plugin validate desktop-mod` and `claude plugin test desktop-mod` pass
- [ ] If this touches the scanner (`desktop-mod/hooks/scanner.ts`) or the payload
      the pane reads, I considered Claude Code **format drift** and added/updated
      a sample in `desktop-mod/hooks/scanner.test.ts` if needed
- [ ] If this adds or changes any UI string, both `en` and `he` entries in
      `desktop-mod/hooks/i18n.ts` are updated (parity)
- [ ] No new third-party runtime dependencies (the mod stays plain TypeScript
      over Claude Code's plugin API)
