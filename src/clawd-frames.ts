// Clawd's pose, as a pure function of the player, the animation clock and the
// tick. Priority: swap (steps 1 to 8), error, tuning (loading), playing,
// paused, idle. The render draws what this returns; nothing here draws.

import type { Anim, Player } from '../types'

export type Glyphs = 'unicode' | 'ascii'

export type Eyes = 'open' | 'squint' | 'blink' | 'dead' | 'asleep'

export type Plinth = 'subtle' | 'bold' | 'error'

export type Disc = { glyph: string; tone: string; dim: boolean }

export type PoseName =
  | 'LIFT'
  | 'REACH'
  | 'SWAP'
  | 'DROP'
  | 'SETTLE'
  | 'START'
  | 'CUE'
  | 'ERROR'
  | 'LISTEN'
  | 'GROOVE'
  | 'PAUSED'
  | 'IDLE'

export type Pose = {
  name: PoseName
  eyes: Eyes
  legs: 'A' | 'B'
  lift: Disc | null
  disc: Disc | null
  crateTone: string
  plinth: Plinth
  zzz: string | null
}

export type PoseInput = {
  player: Player
  anim: Anim
  tick: number
  glyphSet: Glyphs
  toneOf: (genre: string | null) => string
}

export const SUBTLE = 'subtle'

const SPIN: Record<Glyphs, readonly string[]> = {
  unicode: ['◐', '◓', '◑', '◒'],
  ascii: ['|', '/', '-', '\\'],
}

const TUNING: Record<Glyphs, string> = { unicode: '◌', ascii: '.' }

const PARKED: Record<Glyphs, string> = { unicode: '◯', ascii: 'o' }

const ZZZ = ['z', 'zz', 'zzz']

export function spinGlyph(glyphSet: Glyphs, n: number): string {
  const set = SPIN[glyphSet]
  return set[((n % set.length) + set.length) % set.length] ?? ''
}

export function tuningGlyph(glyphSet: Glyphs): string {
  return TUNING[glyphSet]
}

export function parkedGlyph(glyphSet: Glyphs): string {
  return PARKED[glyphSet]
}

function swapPose(input: PoseInput): Pose {
  const { anim, toneOf } = input
  const oldTone = toneOf(anim.swapFrom)
  const newTone = toneOf(anim.swapTo)
  const hasOld = anim.swapFrom !== null
  const oldLift: Disc | null = hasOld ? { glyph: '◐', tone: oldTone, dim: false } : null
  const step = anim.swapStep
  if (step === 1) {
    return { name: 'LIFT', eyes: 'open', legs: 'A', lift: oldLift, disc: null, crateTone: SUBTLE, plinth: 'subtle', zzz: null }
  }
  if (step === 2) {
    return { name: 'REACH', eyes: 'squint', legs: 'A', lift: oldLift, disc: null, crateTone: newTone, plinth: 'subtle', zzz: null }
  }
  if (step === 3) {
    return {
      name: 'SWAP',
      eyes: 'open',
      legs: 'A',
      lift: { glyph: '◑', tone: newTone, dim: false },
      disc: null,
      crateTone: oldTone,
      plinth: 'subtle',
      zzz: null,
    }
  }
  if (step === 4) {
    return {
      name: 'DROP',
      eyes: 'open',
      legs: 'A',
      lift: null,
      disc: { glyph: '◐', tone: newTone, dim: false },
      crateTone: newTone,
      plinth: 'subtle',
      zzz: null,
    }
  }
  if (step === 5) {
    return {
      name: 'SETTLE',
      eyes: 'open',
      legs: 'A',
      lift: null,
      disc: { glyph: '◐', tone: newTone, dim: false },
      crateTone: newTone,
      plinth: 'bold',
      zzz: null,
    }
  }
  return {
    name: 'START',
    eyes: 'open',
    legs: 'A',
    lift: null,
    disc: { glyph: '◐', tone: newTone, dim: false },
    crateTone: newTone,
    plinth: 'subtle',
    zzz: null,
  }
}

function cuePose(input: PoseInput): Pose {
  const { anim, tick, glyphSet, toneOf } = input
  const tone = toneOf(anim.platterGenre)
  return {
    name: 'CUE',
    eyes: anim.swapStep === 7 ? 'squint' : 'open',
    legs: 'A',
    lift: null,
    disc: { glyph: spinGlyph(glyphSet, tick), tone, dim: false },
    crateTone: SUBTLE,
    plinth: 'subtle',
    zzz: null,
  }
}

export function pose(input: PoseInput): Pose {
  const { player, anim, tick, glyphSet, toneOf } = input
  if (anim.swapStep >= 1 && anim.swapStep <= 6) return swapPose(input)
  if (anim.swapStep === 7 || anim.swapStep === 8) return cuePose(input)

  const platterTone = toneOf(anim.platterGenre)

  if (player.status === 'error' && tick < anim.errorUntilTick) {
    return {
      name: 'ERROR',
      eyes: 'dead',
      legs: 'A',
      lift: null,
      disc: anim.platterGenre !== null ? { glyph: parkedGlyph(glyphSet), tone: SUBTLE, dim: false } : null,
      crateTone: SUBTLE,
      plinth: 'error',
      zzz: null,
    }
  }

  if (player.status === 'loading') {
    return {
      name: 'LISTEN',
      eyes: tick % 8 === 7 ? 'squint' : 'open',
      legs: 'A',
      lift: null,
      disc: { glyph: tuningGlyph(glyphSet), tone: platterTone, dim: tick % 2 === 0 },
      crateTone: SUBTLE,
      plinth: 'subtle',
      zzz: null,
    }
  }

  if (player.status === 'playing') {
    const turn = player.muted ? Math.floor(tick / 2) : tick
    return {
      name: 'GROOVE',
      eyes: tick % 25 === 24 ? 'blink' : 'open',
      legs: Math.floor(tick / 5) % 2 === 0 ? 'A' : 'B',
      lift: null,
      disc: anim.platterGenre !== null ? { glyph: spinGlyph(glyphSet, turn), tone: platterTone, dim: false } : null,
      crateTone: SUBTLE,
      plinth: 'subtle',
      zzz: null,
    }
  }

  if (player.status === 'paused') {
    return {
      name: 'PAUSED',
      eyes: 'asleep',
      legs: 'A',
      lift: null,
      disc: anim.platterGenre !== null ? { glyph: '◐', tone: platterTone, dim: true } : null,
      crateTone: SUBTLE,
      plinth: 'subtle',
      zzz: ZZZ[Math.floor(tick / 5) % ZZZ.length] ?? null,
    }
  }

  return {
    name: 'IDLE',
    eyes: tick % 26 === 25 ? 'blink' : 'open',
    legs: 'A',
    lift: null,
    disc: anim.platterGenre !== null ? { glyph: parkedGlyph(glyphSet), tone: SUBTLE, dim: false } : null,
    crateTone: SUBTLE,
    plinth: 'subtle',
    zzz: null,
  }
}

// The text after the deck: what the player is doing, in words.
export function statusWord(player: Player, anim: Anim, tick: number): string {
  if (player.status === 'error' && tick < anim.errorUntilTick) return player.message ?? 'error'
  if (player.status === 'loading') return `tuning in${'.'.repeat((tick % 3) + 1)}`
  if (player.status === 'playing') return player.muted ? 'muted' : 'playing'
  if (player.status === 'paused') return 'paused'
  if (player.status === 'error') return player.message ?? 'error'
  return 'stopped · /music play'
}

// The pane's status badge: a glyph and a word.
export function badgeOf(player: Player, anim: Anim, tick: number): { glyph: string; word: string } {
  if (player.status === 'playing') return { glyph: '●', word: player.muted ? 'muted' : 'playing' }
  if (player.status === 'paused') return { glyph: '❚❚', word: 'paused' }
  if (player.status === 'loading') return { glyph: '◌', word: 'tuning in' }
  if (player.status === 'error' && tick < anim.errorUntilTick) return { glyph: '×', word: 'error' }
  if (player.status === 'error') return { glyph: '■', word: 'stopped' }
  return { glyph: '■', word: 'stopped' }
}

// The word of the pause button: pause while playing or tuning, resume when
// paused, play when stopped.
export function pauseWord(player: Player): 'pause' | 'resume' | 'play' {
  if (player.intent === 'play') return 'pause'
  if (player.status === 'paused' || (player.intent === 'pause' && player.station !== null)) return 'resume'
  return 'play'
}

// The pane's pause button label, with its hotkey.
export function pauseLabel(player: Player): string {
  return `${pauseWord(player)} p`
}

// Filled cells of the volume bar (of ten). Muted shows an empty bar.
export function volumeCells(player: Player): number {
  if (player.muted) return 0
  return Math.round(Math.min(100, Math.max(0, player.volume)) / 10)
}
