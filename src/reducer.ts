// The pure reducer. Every entry point (band and pane buttons, the mood input,
// slash commands, the reconciler's failover) goes through reduce(). It never
// touches the engine: the controller reads the atoms, passes random numbers
// and the bad-station keys in, then writes the result back.

import type { Anim, Catalog, Player, Prefs, Station, Tools } from '../types'
import { fallbackStation, pickStation, stationByKey } from './catalog'
import { clampVolume } from './prefs'

export const FAILOVER_TRIES = 3
export const QUICK_FAIL_MS = 5000
export const ERROR_TICKS = 15
export const TRACK_TOAST_MS = 3000
export const ERROR_TOAST_MS = 5000
export const FOCUS_TOAST_MS = 6000
export const NO_FFPLAY_MESSAGE = 'ffplay not found; run: winget install Gyan.FFmpeg'
export const RESUME_NOTICE = 'Playback stopped when the mod reloaded; press p to resume.'

export type Core = {
  player: Player
  anim: Anim
  catalog: Catalog
  tools: Tools
}

export type Attempt = {
  tries: number
  retried: boolean
}

export type Ctx = {
  rand: number
  rand2: number
  bad: readonly string[]
  lastGenre: string | null
  lastStationByGenre: Readonly<Record<string, string>>
  attempt: Attempt
}

export type Toast = { text: string; timeoutMs: number }

export type Result = {
  core: Core
  attempt: Attempt
  text: string
  notice?: string | null
  toast?: Toast
  prefs?: Partial<Prefs>
  cancelFocus?: boolean
}

export type Action =
  | { type: 'playGenre'; genre: string; label?: string }
  | { type: 'playStation'; key: string }
  | { type: 'playDefault' }
  | { type: 'resume' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'stop' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'setVolume'; volume: number }
  | { type: 'volumeStep'; delta: number }
  | { type: 'mute' }
  | { type: 'streamEnded'; key: string; ranMs: number; cannotStart: boolean }
  | { type: 'fail'; message: string; intent: 'pause' | 'stop' }
  | { type: 'focusEnd' }
  | { type: 'restore' }
  | { type: 'setTools'; tools: Tools }

export const IDLE_ATTEMPT: Attempt = { tries: 0, retried: false }

// The station a genre plays now: a usable catalog station, else the genre's
// local loop when it has one.
function chooseStation(core: Core, genre: string, ctx: Ctx, exclude: string | null, rand: number): Station | null {
  const picked = pickStation(core.catalog, genre, {
    exclude,
    bad: ctx.bad,
    ytdlpOk: core.tools.ytdlp,
    rand,
  })
  if (picked) return picked
  const loop = fallbackStation(genre)
  if (loop && !ctx.bad.includes(loop.key)) return loop
  return null
}

function fail(core: Core, message: string, intent: 'pause' | 'stop'): Result {
  const player: Player = { ...core.player, status: 'error', message, intent }
  const anim: Anim = { ...core.anim, errorUntilTick: core.anim.tick + ERROR_TICKS }
  return {
    core: { ...core, player, anim },
    attempt: IDLE_ATTEMPT,
    text: message,
    toast: { text: message, timeoutMs: ERROR_TOAST_MS },
  }
}

// Moves to `next`: a new genre starts the record swap (or lifts the old one),
// a new station inside the record's genre starts the cue (steps 7 and 8). The
// swap is retargeted when one is already running.
function changeStation(core: Core, next: Station, ctx: Ctx, label: string | null): Result {
  const p = core.player
  if (p.station !== null && p.station.key === next.key && p.intent === 'play' && p.status !== 'error') {
    return { core, attempt: IDLE_ATTEMPT, text: `Already on ${next.name}.` }
  }
  const a = core.anim
  const anim: Anim = { ...a }
  const onPlatter = a.platterGenre
  const inSwap = a.swapStep >= 1 && a.swapStep <= 6
  if (inSwap) {
    anim.swapTo = next.genre
  } else if (onPlatter === next.genre) {
    if (p.station === null || p.station.key !== next.key) {
      anim.swapStep = 7
      anim.swapFrom = onPlatter
      anim.swapTo = next.genre
    }
  } else {
    anim.swapStep = 1
    anim.swapFrom = onPlatter
    anim.swapTo = next.genre
  }
  const player: Player = {
    ...p,
    intent: 'play',
    status: 'loading',
    genre: next.genre,
    station: next,
    prevStation: p.station !== null && p.station.key !== next.key ? p.station : p.prevStation,
    message: null,
  }
  const result: Result = {
    core: { ...core, player, anim },
    attempt: IDLE_ATTEMPT,
    text: `Tuning in: ${next.name} (${next.genre}).`,
    toast: { text: `Now playing: ${next.name}`, timeoutMs: TRACK_TOAST_MS },
    prefs: {
      lastGenre: next.genre,
      lastStationByGenre: { ...ctx.lastStationByGenre, [next.genre]: next.key },
    },
  }
  if (label !== null) result.notice = label
  return result
}

function resume(core: Core, ctx: Ctx): Result {
  const p = core.player
  if (p.station === null) return playDefault(core, ctx)
  if (p.intent === 'play' && p.status === 'playing') {
    return { core, attempt: IDLE_ATTEMPT, text: `Already playing ${p.station.name}.` }
  }
  const player: Player = { ...p, intent: 'play', status: 'loading', message: null }
  return {
    core: { ...core, player },
    attempt: IDLE_ATTEMPT,
    text: `Resuming ${p.station.name}.`,
  }
}

// /music play with no argument, or the first play: the last genre and its last
// station from the store, else a random genre and station.
function playDefault(core: Core, ctx: Ctx): Result {
  if (core.player.station !== null) return resume(core, ctx)
  const remembered =
    ctx.lastGenre !== null && core.catalog.genres.some(g => g.name === ctx.lastGenre) ? ctx.lastGenre : null
  const genre = remembered ?? pickGenreUniform(core.catalog, ctx.rand)
  if (genre === null) return { core, attempt: IDLE_ATTEMPT, text: 'The catalog is empty.' }
  const rememberedKey = ctx.lastStationByGenre[genre]
  const rememberedStation = rememberedKey ? stationByKey(core.catalog, rememberedKey) : null
  const usable =
    rememberedStation !== null &&
    !ctx.bad.includes(rememberedStation.key) &&
    (rememberedStation.kind !== 'youtube' || core.tools.ytdlp !== false)
  const station = usable ? rememberedStation : chooseStation(core, genre, ctx, null, ctx.rand2)
  if (station === null) return fail(core, `no playable station in ${genre}`, 'stop')
  return changeStation(core, station, ctx, null)
}

function pickGenreUniform(catalog: Catalog, rand: number): string | null {
  if (catalog.genres.length === 0) return null
  const index = Math.min(Math.max(Math.floor(rand * catalog.genres.length), 0), catalog.genres.length - 1)
  return catalog.genres[index]?.name ?? null
}

// A moved-on failover: the same genre, a new station, one more try spent.
function failoverTo(core: Core, next: Station, tries: number): Result {
  const player: Player = { ...core.player, station: next, status: 'loading', message: null }
  return {
    core: { ...core, player },
    attempt: { tries, retried: false },
    text: `Trying ${next.name}.`,
  }
}

function streamEnded(core: Core, ctx: Ctx, action: { key: string; ranMs: number; cannotStart: boolean }): Result {
  const p = core.player
  if (p.intent !== 'play' || p.station === null || p.station.key !== action.key) {
    return { core, attempt: ctx.attempt, text: '' }
  }
  if (action.cannotStart) return fail(core, NO_FFPLAY_MESSAGE, 'pause')
  if (action.ranMs >= QUICK_FAIL_MS && !ctx.attempt.retried) {
    const player: Player = { ...p, status: 'error', message: 'stream ended' }
    const anim: Anim = { ...core.anim, errorUntilTick: core.anim.tick + ERROR_TICKS }
    return {
      core: { ...core, player, anim },
      attempt: { tries: ctx.attempt.tries, retried: true },
      text: 'Stream ended; retrying.',
    }
  }
  const station = p.station
  const tries = ctx.attempt.tries
  if (tries < FAILOVER_TRIES) {
    const next = pickStation(core.catalog, station.genre, {
      exclude: station.key,
      bad: ctx.bad,
      ytdlpOk: core.tools.ytdlp,
      rand: ctx.rand,
    })
    if (next !== null && next.key !== station.key) return failoverTo(core, next, tries + 1)
  }
  const loop = fallbackStation(station.genre)
  if (station.kind !== 'file' && loop !== null && !ctx.bad.includes(loop.key)) {
    return failoverTo(core, loop, tries + 1)
  }
  return fail(core, `no playable station in ${station.genre}`, 'stop')
}

export function reduce(core: Core, action: Action, ctx: Ctx): Result {
  const p = core.player
  switch (action.type) {
    case 'playGenre': {
      const genre = action.genre
      if (!core.catalog.genres.some(g => g.name === genre)) {
        return { core, attempt: ctx.attempt, text: `No genre ${genre}.` }
      }
      const exclude = p.station !== null && p.station.genre === genre ? p.station.key : null
      const station = chooseStation(core, genre, ctx, exclude, ctx.rand)
      if (station === null) return fail(core, `no playable station in ${genre}`, 'stop')
      return changeStation(core, station, ctx, action.label ?? null)
    }
    case 'playStation': {
      const station = stationByKey(core.catalog, action.key)
      if (station === null) return { core, attempt: ctx.attempt, text: `No station ${action.key}.` }
      return changeStation(core, station, ctx, null)
    }
    case 'playDefault':
      return playDefault(core, ctx)
    case 'resume':
      return resume(core, ctx)
    case 'pause': {
      if (p.intent !== 'play') {
        const text = p.station !== null && p.intent === 'pause' ? 'Already paused.' : 'Nothing is playing.'
        return { core, attempt: ctx.attempt, text }
      }
      const player: Player = { ...p, intent: 'pause', status: 'paused' }
      return {
        core: { ...core, player },
        attempt: ctx.attempt,
        text: `Paused ${p.station !== null ? p.station.name : ''}.`.trim(),
      }
    }
    case 'toggle': {
      if (p.intent === 'play') return reduce(core, { type: 'pause' }, ctx)
      return resume(core, ctx)
    }
    case 'stop': {
      const player: Player = { ...p, intent: 'stop', status: 'stopped', message: null }
      return { core: { ...core, player }, attempt: IDLE_ATTEMPT, text: 'Stopped.', cancelFocus: true }
    }
    case 'next': {
      if (p.station === null) return playDefault(core, ctx)
      const current = p.station
      const station = chooseStation(core, current.genre, ctx, current.key, ctx.rand)
      if (station === null || station.key === current.key) {
        return { core, attempt: ctx.attempt, text: `Only one station in ${current.genre}; staying on ${current.name}.` }
      }
      return changeStation(core, station, ctx, null)
    }
    case 'prev': {
      if (p.prevStation === null) return { core, attempt: ctx.attempt, text: 'No previous station.' }
      return changeStation(core, p.prevStation, ctx, null)
    }
    case 'setVolume': {
      const volume = clampVolume(action.volume)
      const player: Player = { ...p, volume }
      return {
        core: { ...core, player },
        attempt: ctx.attempt,
        text: `Volume: ${volume}/100`,
        prefs: { volume },
      }
    }
    case 'volumeStep': {
      const volume = clampVolume(p.volume + action.delta)
      const player: Player = { ...p, volume }
      return {
        core: { ...core, player },
        attempt: ctx.attempt,
        text: `Volume: ${volume}/100`,
        prefs: { volume },
      }
    }
    case 'mute': {
      const muted = !p.muted
      const player: Player = { ...p, muted }
      return {
        core: { ...core, player },
        attempt: ctx.attempt,
        text: muted ? 'Muted.' : 'Unmuted.',
        prefs: { muted },
      }
    }
    case 'streamEnded':
      return streamEnded(core, ctx, action)
    case 'fail':
      return fail(core, action.message, action.intent)
    case 'focusEnd': {
      const player: Player = { ...p, intent: 'stop', status: 'stopped', message: null }
      return {
        core: { ...core, player },
        attempt: IDLE_ATTEMPT,
        text: 'Focus time is up.',
        toast: { text: 'Focus time is up', timeoutMs: FOCUS_TOAST_MS },
      }
    }
    case 'restore': {
      if (p.station === null || (p.status !== 'playing' && p.status !== 'loading')) {
        return { core, attempt: ctx.attempt, text: '' }
      }
      const player: Player = { ...p, intent: 'pause', status: 'paused' }
      return { core: { ...core, player }, attempt: IDLE_ATTEMPT, text: '', notice: RESUME_NOTICE }
    }
    case 'setTools':
      return { core: { ...core, tools: action.tools }, attempt: ctx.attempt, text: '' }
  }
}

// One tick of the animation clock: the swap steps move on, and the record is
// placed on the platter at step 6 (START). Pure; the controller applies it
// with update() so a press made meanwhile is never overwritten.
export function advanceAnim(a: Anim, nowMs: number): Anim {
  const anim: Anim = { ...a, tick: a.tick + 1, nowMs }
  if (a.swapStep >= 1 && a.swapStep <= 5) {
    anim.swapStep = a.swapStep + 1
  } else if (a.swapStep === 6) {
    anim.platterGenre = a.swapTo ?? a.platterGenre
    anim.swapStep = 0
    anim.swapFrom = null
    anim.swapTo = null
  } else if (a.swapStep === 7) {
    anim.swapStep = 8
  } else if (a.swapStep === 8) {
    anim.swapStep = 0
    anim.swapTo = null
  }
  return anim
}

// An error that has run its 3 seconds returns to rest: loading when the
// intent is play, paused or stopped otherwise. Pure.
export function expireError(player: Player, anim: Anim): Player {
  if (player.status !== 'error' || anim.tick < anim.errorUntilTick) return player
  const status = player.intent === 'play' ? 'loading' : player.intent === 'pause' ? 'paused' : 'stopped'
  return { ...player, status, message: null }
}
