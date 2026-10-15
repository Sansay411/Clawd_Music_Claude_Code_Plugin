// Clawd's poses: the priority of the states, the swap steps, the spin, the
// blink and the z bubble, and the status words the band and pane show.

import { expect, test } from 'claude-code/testing'
import type { PoseInput } from '../src/clawd-frames'
import { badgeOf, pauseLabel, pose, spinGlyph, statusWord, volumeCells } from '../src/clawd-frames'
import { INITIAL_ANIM, INITIAL_PLAYER } from '../src/state'

const TONES: Record<string, string> = { lofi: '#C9899B', jazz: '#D9A441' }
const toneOf = (genre: string | null): string => (genre !== null && TONES[genre] ? TONES[genre] : 'subtle')

function input(overrides: Partial<PoseInput> = {}): PoseInput {
  return {
    player: INITIAL_PLAYER,
    anim: INITIAL_ANIM,
    tick: 0,
    glyphSet: 'unicode',
    toneOf,
    ...overrides,
  }
}

const onLofi = {
  ...INITIAL_PLAYER,
  intent: 'play' as const,
  status: 'playing' as const,
  genre: 'lofi',
  station: { key: 'lofi/0', name: 'Lofi Girl', url: 'u', kind: 'youtube' as const, genre: 'lofi' },
}

test('stopped with no record shows idle with no disc', async () => {
  const p = pose(input())
  expect(p.name).toBe('IDLE')
  expect(p.disc).toBeNull()
  expect(p.eyes).toBe('open')
})

test('idle parks the record and blinks once every 26 ticks', async () => {
  const anim = { ...INITIAL_ANIM, platterGenre: 'lofi' }
  expect(pose(input({ anim, tick: 3 })).disc?.glyph).toBe('◯')
  expect(pose(input({ anim, tick: 25 })).eyes).toBe('blink')
  expect(pose(input({ anim, tick: 26 })).eyes).toBe('open')
})

test('playing spins one glyph per tick, and the legs alternate every five ticks', async () => {
  const anim = { ...INITIAL_ANIM, platterGenre: 'lofi' }
  const at = (tick: number) => pose(input({ player: onLofi, anim, tick }))
  expect(at(0).name).toBe('GROOVE')
  expect(at(0).disc?.glyph).toBe('◐')
  expect(at(1).disc?.glyph).toBe('◓')
  expect(at(4).disc?.glyph).toBe('◐')
  expect(at(0).legs).toBe('A')
  expect(at(5).legs).toBe('B')
  expect(at(10).legs).toBe('A')
  expect(at(24).eyes).toBe('blink')
})

test('muted spins every other tick', async () => {
  const anim = { ...INITIAL_ANIM, platterGenre: 'lofi' }
  const player = { ...onLofi, muted: true }
  const glyph = (tick: number) => pose(input({ player, anim, tick })).disc?.glyph
  expect(glyph(2)).toBe(glyph(3))
  expect(glyph(2)).toBe('◓')
  expect(glyph(4)).toBe('◑')
})

test('the ascii spin uses bar, slash, dash and backslash', async () => {
  expect(spinGlyph('ascii', 0)).toBe('|')
  expect(spinGlyph('ascii', 1)).toBe('/')
  expect(spinGlyph('ascii', 2)).toBe('-')
  expect(spinGlyph('ascii', 3)).toBe('\\')
})

test('tuning shows the listen pose with a squint every eight ticks', async () => {
  const player = { ...INITIAL_PLAYER, intent: 'play' as const, status: 'loading' as const, genre: 'lofi' }
  const anim = { ...INITIAL_ANIM, platterGenre: 'lofi' }
  expect(pose(input({ player, anim, tick: 0 })).name).toBe('LISTEN')
  expect(pose(input({ player, anim, tick: 0 })).eyes).toBe('open')
  expect(pose(input({ player, anim, tick: 7 })).eyes).toBe('squint')
  expect(pose(input({ player, anim, tick: 0 })).disc?.glyph).toBe('◌')
})

test('paused sleeps with a z bubble that cycles every five ticks', async () => {
  const player = { ...onLofi, intent: 'pause' as const, status: 'paused' as const }
  const anim = { ...INITIAL_ANIM, platterGenre: 'lofi' }
  const at = (tick: number) => pose(input({ player, anim, tick }))
  expect(at(0).name).toBe('PAUSED')
  expect(at(0).eyes).toBe('asleep')
  expect(at(0).zzz).toBe('z')
  expect(at(5).zzz).toBe('zz')
  expect(at(10).zzz).toBe('zzz')
  expect(at(15).zzz).toBe('z')
  expect(at(0).disc?.dim).toBe(true)
})

test('an error shows dead eyes and an error plinth until its window ends', async () => {
  const player = { ...INITIAL_PLAYER, status: 'error' as const, message: 'boom' }
  const anim = { ...INITIAL_ANIM, errorUntilTick: 15 }
  const inside = pose(input({ player, anim, tick: 3 }))
  expect(inside.name).toBe('ERROR')
  expect(inside.eyes).toBe('dead')
  expect(inside.plinth).toBe('error')
  expect(pose(input({ player, anim, tick: 15 })).name).toBe('IDLE')
  expect(statusWord(player, anim, 3)).toBe('boom')
})

test('the swap goes lift, reach, swap, drop, settle, start over steps 1 to 6', async () => {
  const base = { ...INITIAL_ANIM, platterGenre: 'lofi', swapFrom: 'lofi', swapTo: 'jazz' }
  const at = (swapStep: number) => pose(input({ anim: { ...base, swapStep }, tick: 0 }))
  expect(at(1).name).toBe('LIFT')
  expect(at(1).lift?.tone).toBe('#C9899B')
  expect(at(1).disc).toBeNull()
  expect(at(2).name).toBe('REACH')
  expect(at(2).eyes).toBe('squint')
  expect(at(2).crateTone).toBe('#D9A441')
  expect(at(3).name).toBe('SWAP')
  expect(at(3).lift?.glyph).toBe('◑')
  expect(at(3).lift?.tone).toBe('#D9A441')
  expect(at(3).crateTone).toBe('#C9899B')
  expect(at(4).name).toBe('DROP')
  expect(at(4).disc?.tone).toBe('#D9A441')
  expect(at(5).plinth).toBe('bold')
  expect(at(6).name).toBe('START')
})

test('with no record on the platter the lift is skipped', async () => {
  const anim = { ...INITIAL_ANIM, swapStep: 1, swapFrom: null, swapTo: 'lofi' }
  expect(pose(input({ anim })).lift).toBeNull()
})

test('a station change inside one genre squints, then opens, while the record spins', async () => {
  const anim = { ...INITIAL_ANIM, platterGenre: 'lofi', swapStep: 7 }
  expect(pose(input({ player: onLofi, anim, tick: 0 })).name).toBe('CUE')
  expect(pose(input({ player: onLofi, anim: { ...anim, swapStep: 7 }, tick: 0 })).eyes).toBe('squint')
  expect(pose(input({ player: onLofi, anim: { ...anim, swapStep: 8 }, tick: 0 })).eyes).toBe('open')
})

test('the status words and badges say what the player does', async () => {
  const anim = { ...INITIAL_ANIM, platterGenre: 'lofi' }
  expect(statusWord({ ...INITIAL_PLAYER, status: 'loading' }, anim, 0)).toBe('tuning in.')
  expect(statusWord({ ...INITIAL_PLAYER, status: 'loading' }, anim, 2)).toBe('tuning in...')
  expect(statusWord(onLofi, anim, 0)).toBe('playing')
  expect(statusWord({ ...onLofi, muted: true }, anim, 0)).toBe('muted')
  expect(statusWord(INITIAL_PLAYER, anim, 0)).toBe('stopped · /music play')
  expect(badgeOf(onLofi, anim, 0).glyph).toBe('●')
  expect(badgeOf({ ...onLofi, status: 'paused' }, anim, 0).glyph).toBe('❚❚')
})

test('the pause button reads pause while playing, resume when paused, play when stopped', async () => {
  expect(pauseLabel(onLofi)).toBe('pause p')
  expect(pauseLabel({ ...onLofi, intent: 'pause', status: 'paused' })).toBe('resume p')
  expect(pauseLabel(INITIAL_PLAYER)).toBe('play p')
})

test('the volume bar fills in tenths and is empty when muted', async () => {
  expect(volumeCells({ ...INITIAL_PLAYER, volume: 60 })).toBe(6)
  expect(volumeCells({ ...INITIAL_PLAYER, volume: 100 })).toBe(10)
  expect(volumeCells({ ...INITIAL_PLAYER, volume: 60, muted: true })).toBe(0)
})
