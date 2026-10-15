# Contributing

Thanks for wanting to help! Good first issues: **macOS / Linux support**
(replace `where.exe` and `taskkill` with `which` and `pkill`), new Clawd
poses, new stations, better mood words.

## Setup

1. Fork and clone the repo.
2. Load it into Claude Code for one session:
   `claude --plugin-dir <path-to-clone>`
3. Check your work:

```bash
claude plugin validate .
claude plugin test .
```

Both must pass. Add or update a `*.test.ts` for any behaviour you change.

## Rules

- No skills, no agents, no prompt-injecting hooks: this mod stays UI-only.
- Host commands go through `$.process` with an argument list. No shell strings.
- No bundled audio unless you can show its license (CC0, public domain, or
  your own work). Stations are links only.
- Keep the Claude Code look: theme keys for colours, raw hex only for genre
  tones.
- Small focused pull requests, with a note of what you tested and on which
  surface (terminal, desktop app, VS Code).

By contributing you agree your work is licensed under Apache-2.0.
