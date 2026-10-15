# Security policy

## Supported versions

Only the latest release gets security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's
private reporting instead: **Security -> Report a vulnerability** on this
repository. Include what you saw, the steps to reproduce it, and the version.
You will get a reply within 7 days. A fix and a short advisory follow once the
problem is confirmed.

## What this mod does on your machine

- It runs only these programs, always with an argument list and never through
  a shell, so a station name or a typed mood cannot become a command:
  `ffplay` (plays the stream), `yt-dlp` (resolves a YouTube page to an audio
  URL, only for YouTube stations), `where.exe` (finds ffplay and yt-dlp) and
  `taskkill.exe` (stops ffplay).
- It makes **no network requests of its own**. The only traffic is ffplay and
  yt-dlp opening the stream URLs listed in `config/sources.yml`.
- It reads and writes no files outside its plugin folder and the plugin store
  Claude Code gives it (volume, last station, listening totals).
- It has no telemetry, no analytics, no accounts, no API keys and no secrets.
- It adds no skills, no agents, no prompt text and no tool-call hooks, so it
  cannot read or change your conversation or your code.

## Known limitation

Stopping the player ends ffplay processes by name on this machine, so another
program's ffplay can be stopped too. See the README, "Limitations".

## For contributors

Keep every host command argv-only, never build a command from user text, and
discuss any new network call in an issue first.
