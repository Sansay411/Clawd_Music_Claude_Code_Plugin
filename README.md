# Clawd Music

**A tiny radio player that lives inside Claude Code. A little pixel mascot spins the record, and swaps it when you change the genre.**

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Platform: Windows](https://img.shields.io/badge/platform-Windows-lightgrey)
![No skills, no agents](https://img.shields.io/badge/skills-0-brightgreen)
![No telemetry](https://img.shields.io/badge/telemetry-none-brightgreen)

```
   ██▀██████▀██
 ▀▀████████████▀▀   ◐   ○ lofi  ● jazz  ○ classical  ○ ambient
    ▀ ▀    ▀ ▀
```

A three-row band sits above your prompt: Clawd stands at a turntable, the record
turns while a station plays, and when the genre changes Clawd lifts the old
record, reaches into the crate and sets the new one down. The sound starts only
after the record is down. Open the pane for genres, stations, transport, volume,
a mood box and a focus timer.

> **Unofficial.** Not affiliated with or endorsed by Anthropic. See [NOTICE](NOTICE).

## Why it is different

- **No skills, no agents, no prompts.** It is a Claude Code *mod*: only UI and
  one slash command. It cannot read your conversation or your code.
- **No telemetry, no accounts, no keys.** See [PRIVACY](PRIVACY.md) and
  [SECURITY](SECURITY.md).
- **Eight genres, 30+ stations** (SomaFM, WDCB, All Classical Portland, France
  Musique, Lofi Girl, Chillhop and more), streamed from their own servers. No audio is
  bundled.
- Plays in the **terminal, the desktop app and VS Code**.

## Install

Requires Claude Code 2.1.275 or later and **ffplay** (`winget install Gyan.FFmpeg`).
`yt-dlp` is optional and enables the YouTube stations.

```
/plugin install clawd-music --marketplace Sansay411/Clawd_Music_Claude_Code_Plugin
```

Or try it for one session without installing:

```bash
git clone https://github.com/Sansay411/Clawd_Music_Claude_Code_Plugin
claude --plugin-dir ./Clawd_Music_Claude_Code_Plugin
```

Then type `/music`.

## Commands

| Command | What it does |
| --- | --- |
| `/music` | open the pane |
| `/music play [genre or station]` | a genre (random station) or a station by name; no argument resumes |
| `/music stop` / `pause` | stop (keeps the station) / pause or resume |
| `/music next` / `prev` | next station in the genre / the previous one |
| `/music vol <0-100\|up\|down>` | volume |
| `/music mute` | mute or unmute |
| `/music mood <text>` | pick a genre from mood words (English and Russian): `/music mood rainy focus` |
| `/music vibe` / `shuffle` | a random genre |
| `/music focus [minutes]` | a timer, 1-120 min; the music stops and a chime plays at the end |
| `/music list` / `status` / `reset` / `help` | list genres, one-line status, reset, help |

Short aliases also work: `/play /stop /pause /next /prev /volume /mute /mood /vibe /shuffle /focus /list`.

Keys in the pane and the band: `b` prev, `p` play/pause, `n` next, `m` mute,
`d` / `u` volume, `1`-`8` genres. Click the band, or press `ctrl+x tab`, to focus it.

## Limitations (honest list)

- **Windows only for now.** It uses `where.exe` and `taskkill`. macOS/Linux
  support is the best first contribution, see [CONTRIBUTING](CONTRIBUTING.md).
- Stopping the player ends **all `ffplay.exe`** on the machine, so another
  program's ffplay stops too.
- Live radio has no position, so pause and volume changes restart the stream.
- The YouTube stations depend on `yt-dlp` and YouTube's own terms; use them at your
  own discretion.
- No local fallback audio ships with the repo; if every station of a genre is down,
  you get an error message.
- Early software: it runs on Claude Code's early-access mod API, which may change.

## Development

```bash
claude plugin validate .
claude plugin test .
```

Layout: `hooks/register.tsx` registers everything; `src/reducer.ts` is the pure
player state machine; `src/controller.ts` owns ffplay; `src/clawd*.ts(x)` draw
and animate Clawd; `src/pane.tsx` and `src/band.tsx` are the two views.

## По-русски

Мини-радио прямо в Claude Code: пиксельный Клодик крутит пластинку и меняет её при
смене жанра. Без скиллов, агентов и телеметрии. Работает в терминале, десктопе и VS Code
(пока только Windows). Нужен `ffplay`: `winget install Gyan.FFmpeg`. Установка и команды выше,
запуск: `/music`.

## License

[Apache-2.0](LICENSE). Station streams belong to their operators.
