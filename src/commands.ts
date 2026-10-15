// Slash commands: /music with its subcommands, and the old names (/play,
// /stop, /volume and so on) served by the same router. Every handler answers
// at once; slow work (yt-dlp, spawn) is started by the controller in the back.

import {
  actFocus,
  actMood,
  actPlayQuery,
  actShuffle,
  actVibe,
  press,
  resetPrefsNow,
} from './controller'
import type { Io } from './io'
import { noPlayText, PANE_ID, readSnapshot } from './state'

type Spec = {
  name: string
  description: string
  argumentHint?: string
  immediate: boolean
}

export const COMMAND_SPECS: readonly Spec[] = [
  {
    name: 'music',
    description: 'Claude Music: open the pane, or a subcommand (play, stop, vol, mood, focus, help...)',
    argumentHint: '[pane|play|stop|pause|next|prev|vol|mute|status|list|mood|vibe|shuffle|focus|reset|help]',
    immediate: true,
  },
  { name: 'play', description: 'Play a genre or station (/music play)', argumentHint: '[genre|station]', immediate: false },
  { name: 'stop', description: 'Stop the music; the station is kept for resume', immediate: true },
  { name: 'pause', description: 'Pause, or resume the paused station', immediate: true },
  { name: 'next', description: 'Next station in this genre', immediate: true },
  { name: 'prev', description: 'Back to the previous station', immediate: true },
  { name: 'volume', description: 'Volume 0-100, or up and down', argumentHint: '<0-100|up|down>', immediate: true },
  { name: 'mute', description: 'Mute or unmute the music', immediate: true },
  { name: 'mood', description: 'Play music that fits a mood', argumentHint: '<text>', immediate: false },
  { name: 'vibe', description: 'A random genre, weighted by its stations', immediate: false },
  { name: 'dj', description: 'A random genre, weighted by its stations (as /vibe)', immediate: false },
  { name: 'shuffle', description: 'A random genre, then a random station', immediate: false },
  { name: 'focus', description: 'Focus timer with music; a chime when time is up', argumentHint: '[minutes]', immediate: false },
  { name: 'pomodoro', description: 'Same as /focus', argumentHint: '[minutes]', immediate: false },
  { name: 'list', description: 'List the genres and their stations', immediate: true },
  { name: 'nowplaying', description: 'What is playing now, in one line', immediate: true },
]

// The old names, each served by one /music subcommand.
export const ALIAS_SUBCOMMAND: Readonly<Record<string, string>> = {
  play: 'play',
  stop: 'stop',
  pause: 'pause',
  next: 'next',
  prev: 'prev',
  volume: 'vol',
  mute: 'mute',
  mood: 'mood',
  vibe: 'vibe',
  dj: 'vibe',
  shuffle: 'shuffle',
  focus: 'focus',
  pomodoro: 'focus',
  list: 'list',
  nowplaying: 'status',
}

export const HELP_TEXT = [
  'Claude Music',
  '/music                       open the pane',
  '/music play [genre|station]  a genre (random station), or a station by name',
  '/music stop | pause | next | prev',
  '/music vol <0-100|up|down>   volume; /music mute, status, list',
  '/music mood <text>           e.g. /music mood rainy focus',
  '/music vibe | shuffle        a random genre',
  '/music focus [minutes]       timer, 1-120 (default 25); a chime when done',
  '/music reset                 default volume and last station; totals kept',
  'Band keys (after ctrl+x tab): b prev, p play or pause, n next, m mute, d vol-, u vol+',
  'Pane keys: Tab walks the buttons, 1-8 pick a genre, p s n b m u d controls, f c l e mood chips, Esc closes (music keeps playing)',
  'Pause and resume restart the stream (live radio has no position); volume and mute restart it after a short gap.',
  'Old names also work: /play /stop /pause /next /prev /volume /mute /mood /vibe /dj /shuffle /focus /pomodoro /list /nowplaying',
].join('\n')

// Each name is registered on its own: a refused name is logged to the debug
// log and skipped, and the others still work.
export async function registerCommands(io: Io): Promise<void> {
  for (const spec of COMMAND_SPECS) {
    try {
      await io.registerCommand({
        name: spec.name,
        description: spec.description,
        ...(spec.argumentHint !== undefined ? { argumentHint: spec.argumentHint } : {}),
        ...(spec.immediate ? { immediate: true as const } : {}),
      })
    } catch (err) {
      try {
        io.debug(`command /${spec.name} was refused: ${String(err)}`)
      } catch {
        // debug only
      }
    }
  }
}

export async function openPane(io: Io): Promise<string> {
  const snap = await readSnapshot(io)
  let outcome: string
  try {
    const opened = await io.open({ id: PANE_ID, title: 'Claude Music', rows: 20, columns: 60 })
    outcome = opened.isPlaced ? 'Claude Music opened.' : `Claude Music waits: ${opened.reason}`
  } catch (err) {
    outcome = `Claude Music could not open: ${String(err)}`
  }
  return snap.session.surface !== 'mobile' ? outcome : `${outcome} ${noPlayText(snap.session)}`
}

function elapsed(startedAt: number | null, nowMs: number): string {
  const seconds = startedAt === null ? 0 : Math.max(0, Math.floor((nowMs - startedAt) / 1000))
  const minutes = Math.floor(seconds / 60)
  const rest = String(seconds % 60).padStart(2, '0')
  return `${minutes}:${rest}`
}

async function status(io: Io): Promise<string> {
  const snap = await readSnapshot(io)
  const p = snap.player
  const parts: string[] = [`status ${p.status}`, `genre ${p.genre ?? 'none'}`, `station ${p.station?.name ?? 'none'}`]
  if (p.station !== null) {
    parts.push(p.station.kind === 'file' ? `elapsed ${elapsed(p.startedAt, snap.anim.nowMs)}` : 'LIVE')
  }
  parts.push(`vol ${p.volume}`, p.muted ? 'muted' : 'unmuted')
  parts.push(`session ${Math.round(snap.session.sessionMinutes)} min`)
  parts.push(`total ${Math.round(snap.session.totalMinutes)} min in ${snap.session.totalSessions} sessions`)
  if (snap.session.surface === 'mobile') parts.push(noPlayText(snap.session))
  return parts.join(' · ')
}

async function list(io: Io): Promise<string> {
  const { catalog } = await readSnapshot(io)
  if (catalog.error !== null && catalog.genres.length === 0) {
    return `Catalog error in config/sources.yml: ${catalog.error}`
  }
  const lines = catalog.genres.map(g => `${g.name} (${g.stations.length}): ${g.stations.map(s => s.name).join(', ')}`)
  if (lines.length === 0) return 'No genres loaded from config/sources.yml.'
  return lines.join('\n')
}

async function pauseOrResume(io: Io): Promise<string> {
  const { player } = await readSnapshot(io)
  if (player.intent === 'play') return press(io, { type: 'pause' })
  if (player.intent === 'pause' && player.station !== null) return press(io, { type: 'resume' })
  return 'Nothing is playing.'
}

async function volume(io: Io, rest: string): Promise<string> {
  const arg = rest.trim().toLowerCase()
  if (arg === '') {
    const { player } = await readSnapshot(io)
    return `Volume: ${player.volume}/100${player.muted ? ' (muted)' : ''}`
  }
  if (arg === 'up') return press(io, { type: 'volumeStep', delta: 10 })
  if (arg === 'down') return press(io, { type: 'volumeStep', delta: -10 })
  if (!/^\d+$/.test(arg)) return 'Usage: /music vol <0-100|up|down>'
  const level = Number(arg)
  if (level < 0 || level > 100) return 'Usage: /music vol <0-100|up|down>'
  return press(io, { type: 'setVolume', volume: level })
}

async function focus(io: Io, rest: string): Promise<string> {
  let minutes = 25
  if (rest.trim() !== '') {
    const requested = Number(rest.trim())
    if (!Number.isFinite(requested)) return 'Usage: /music focus [minutes 1-120]'
    minutes = Math.min(120, Math.max(1, Math.round(requested)))
  }
  return actFocus(io, minutes)
}

async function music(io: Io, sub: string, rest: string): Promise<string> {
  switch (sub) {
    case '':
    case 'pane':
      return openPane(io)
    case 'play':
      return rest === '' ? press(io, { type: 'playDefault' }) : actPlayQuery(io, rest)
    case 'stop':
      return press(io, { type: 'stop' })
    case 'pause':
      return pauseOrResume(io)
    case 'next':
      return press(io, { type: 'next' })
    case 'prev':
      return press(io, { type: 'prev' })
    case 'vol':
      return volume(io, rest)
    case 'mute':
      return press(io, { type: 'mute' })
    case 'status':
      return status(io)
    case 'list':
      return list(io)
    case 'mood':
      return rest === '' ? 'Usage: /music mood <text>' : actMood(io, rest)
    case 'vibe':
      return actVibe(io)
    case 'shuffle':
      return actShuffle(io)
    case 'focus':
      return focus(io, rest)
    case 'reset':
      return resetPrefsNow(io)
    case 'help':
      return HELP_TEXT
    default:
      return `Unknown subcommand "${sub}". Try /music help.`
  }
}

// The command.run hook's body for every registered name.
export async function runCommand(io: Io, name: string, rawArgs: string): Promise<{ text: string }> {
  const args = rawArgs.trim()
  try {
    if (name === 'music') {
      const space = args.search(/\s/)
      const sub = space < 0 ? args : args.slice(0, space)
      const rest = space < 0 ? '' : args.slice(space + 1).trim()
      return { text: await music(io, sub.toLowerCase(), rest) }
    }
    const sub = ALIAS_SUBCOMMAND[name]
    if (sub === undefined) return { text: `Unknown command /${name}.` }
    return { text: await music(io, sub, args) }
  } catch (err) {
    return { text: `Claude Music: ${String(err)}` }
  }
}
