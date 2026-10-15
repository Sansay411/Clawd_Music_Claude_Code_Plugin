// Playback state transitions of the pure reducer: the record swap, the cue,
// the failover, pause and stop, volume and mute, prev, and error expiry.

import { expect, test } from 'claude-code/testing'
import { initialCatalog } from '../src/catalog'
import type { Core, Ctx } from '../src/reducer'
import { advanceAnim, ERROR_TICKS, expireError, IDLE_ATTEMPT, NO_FFPLAY_MESSAGE, reduce, RESUME_NOTICE } from '../src/reducer'
import { INITIAL_ANIM, INITIAL_PLAYER } from '../src/state'

function makeCore(overrides: Partial<Core> = {}): Core {
  return {
    player: INITIAL_PLAYER,
    anim: INITIAL_ANIM,
    catalog: initialCatalog(),
    tools: { ffplay: true, ytdlp: true },
    ...overrides,
  }
}

function makeCtx(overrides: Partial<Ctx> = {}): Ctx {
  return {
    rand: 0,
    rand2: 0,
    bad: [],
    lastGenre: null,
    lastStationByGenre: {},
    attempt: IDLE_ATTEMPT,
    ...overrides,
  }
}

// Ticks the animation clock until the record is down.
function settle(core: Core): Core {
  let c = core
  for (let i = 0; i < 8; i++) c = { ...c, anim: advanceAnim(c.anim, 0) }
  return c
}

function playing(genre: string, key: string): Core {
  const first = reduce(makeCore(), { type: 'playStation', key }, makeCtx()).core
  return settle(first)
}

test('a first play starts the record swap at step 1 and tunes in', async () => {
  const r = reduce(makeCore(), { type: 'playGenre', genre: 'lofi' }, makeCtx())
  expect(r.core.anim.swapStep).toBe(1)
  expect(r.core.anim.swapFrom).toBeNull()
  expect(r.core.anim.swapTo).toBe('lofi')
  expect(r.core.player.intent).toBe('play')
  expect(r.core.player.status).toBe('loading')
  expect(r.core.player.genre).toBe('lofi')
  expect(r.core.player.station?.key).toBe('lofi/0')
  expect(r.core.player.station?.name).toBe('Lofi Girl')
})

test('the swap runs six steps, then the record is on the platter', async () => {
  let c = makeCore()
  c = reduce(c, { type: 'playGenre', genre: 'lofi' }, makeCtx()).core
  const steps: number[] = [c.anim.swapStep]
  for (let i = 0; i < 6; i++) {
    c = { ...c, anim: advanceAnim(c.anim, 0) }
    steps.push(c.anim.swapStep)
  }
  expect(steps).toEqual([1, 2, 3, 4, 5, 6, 0])
  expect(c.anim.platterGenre).toBe('lofi')
  expect(c.anim.swapTo).toBeNull()
})

test('a new genre lifts the old record; a new station in the same genre cues', async () => {
  const onLofi = playing('lofi', 'lofi/0')
  expect(onLofi.anim.platterGenre).toBe('lofi')
  const toJazz = reduce(onLofi, { type: 'playGenre', genre: 'jazz' }, makeCtx())
  expect(toJazz.core.anim.swapStep).toBe(1)
  expect(toJazz.core.anim.swapFrom).toBe('lofi')
  expect(toJazz.core.anim.swapTo).toBe('jazz')
  const toStation = reduce(onLofi, { type: 'playStation', key: 'lofi/1' }, makeCtx())
  expect(toStation.core.anim.swapStep).toBe(7)
  expect(toStation.core.player.station?.key).toBe('lofi/1')
})

test('a same-genre play never picks the current station when another exists', async () => {
  const onLofi = playing('lofi', 'lofi/0')
  const r = reduce(onLofi, { type: 'playGenre', genre: 'lofi' }, makeCtx({ rand: 0 }))
  expect(r.core.player.station?.key).toBe('lofi/1')
})

test('a quick failure fails over to the next station of the genre', async () => {
  const onLofi = playing('lofi', 'lofi/0')
  const r = reduce(
    onLofi,
    { type: 'streamEnded', key: 'lofi/0', ranMs: 1200, cannotStart: false },
    makeCtx({ bad: ['lofi/0'] }),
  )
  expect(r.core.player.station?.key).toBe('lofi/1')
  expect(r.core.player.status).toBe('loading')
  expect(r.attempt.tries).toBe(1)
})

test('a stream that ran long is retried once before any failover', async () => {
  const onLofi = playing('lofi', 'lofi/0')
  const first = reduce(onLofi, { type: 'streamEnded', key: 'lofi/0', ranMs: 60000, cannotStart: false }, makeCtx())
  expect(first.core.player.status).toBe('error')
  expect(first.core.player.message).toBe('stream ended')
  expect(first.core.player.station?.key).toBe('lofi/0')
  expect(first.attempt.retried).toBe(true)
  const second = reduce(
    first.core,
    { type: 'streamEnded', key: 'lofi/0', ranMs: 60000, cannotStart: false },
    makeCtx({ attempt: first.attempt, bad: ['lofi/0'] }),
  )
  expect(second.core.player.station?.key).toBe('lofi/1')
})

test('a missing ffplay pauses with the install line and no retries', async () => {
  const onLofi = playing('lofi', 'lofi/0')
  const r = reduce(onLofi, { type: 'streamEnded', key: 'lofi/0', ranMs: 0, cannotStart: true }, makeCtx())
  expect(r.core.player.status).toBe('error')
  expect(r.core.player.intent).toBe('pause')
  expect(r.core.player.message).toBe(NO_FFPLAY_MESSAGE)
})

test('a genre with no usable station errors, since no local loop ships', async () => {
  const noYoutube = reduce(makeCore({ tools: { ffplay: true, ytdlp: false } }), { type: 'playGenre', genre: 'lofi' }, makeCtx())
  expect(noYoutube.core.player.status).toBe('error')
  expect(noYoutube.core.player.message).toBe('no playable station in lofi')
  const exhausted = ['synthwave/0', 'synthwave/1', 'synthwave/2']
  const synth = reduce(makeCore(), { type: 'playGenre', genre: 'synthwave' }, makeCtx({ bad: exhausted }))
  expect(synth.core.player.status).toBe('error')
  expect(synth.core.player.message).toBe('no playable station in synthwave')
  expect(synth.core.player.intent).toBe('stop')
})

test('pause keeps the station, resume and stop behave as the labels say', async () => {
  const onLofi = playing('lofi', 'lofi/0')
  const paused = reduce(onLofi, { type: 'pause' }, makeCtx())
  expect(paused.core.player.intent).toBe('pause')
  expect(paused.core.player.status).toBe('paused')
  expect(paused.core.player.station?.key).toBe('lofi/0')
  const resumed = reduce(paused.core, { type: 'toggle' }, makeCtx())
  expect(resumed.core.player.intent).toBe('play')
  expect(resumed.core.player.status).toBe('loading')
  const stopped = reduce(resumed.core, { type: 'stop' }, makeCtx())
  expect(stopped.core.player.intent).toBe('stop')
  expect(stopped.core.player.status).toBe('stopped')
  expect(stopped.core.player.station?.key).toBe('lofi/0')
  expect(stopped.cancelFocus).toBe(true)
})

test('prev steps back to the station before, and toggles', async () => {
  const onLofi = playing('lofi', 'lofi/0')
  const second = reduce(onLofi, { type: 'playStation', key: 'lofi/1' }, makeCtx())
  expect(second.core.player.prevStation?.key).toBe('lofi/0')
  const back = reduce(settle(second.core), { type: 'prev' }, makeCtx())
  expect(back.core.player.station?.key).toBe('lofi/0')
  expect(back.core.player.prevStation?.key).toBe('lofi/1')
})

test('volume clamps to 0 to 100 and steps by the delta; mute toggles', async () => {
  const high = reduce(makeCore(), { type: 'setVolume', volume: 150 }, makeCtx())
  expect(high.core.player.volume).toBe(100)
  expect(high.prefs?.volume).toBe(100)
  const low = reduce(makeCore({ player: { ...INITIAL_PLAYER, volume: 5 } }), { type: 'volumeStep', delta: -10 }, makeCtx())
  expect(low.core.player.volume).toBe(0)
  const muted = reduce(makeCore(), { type: 'mute' }, makeCtx())
  expect(muted.core.player.muted).toBe(true)
  expect(muted.text).toBe('Muted.')
  expect(muted.prefs?.muted).toBe(true)
})

test('an error runs its window, then rests as paused for an intent of pause', async () => {
  const failed = reduce(makeCore(), { type: 'fail', message: 'boom', intent: 'pause' }, makeCtx())
  expect(failed.core.player.status).toBe('error')
  expect(failed.core.anim.errorUntilTick).toBe(ERROR_TICKS)
  let c = failed.core
  c = { ...c, anim: { ...c.anim, tick: ERROR_TICKS - 1 } }
  expect(expireError(c.player, c.anim).status).toBe('error')
  c = { ...c, anim: { ...c.anim, tick: ERROR_TICKS } }
  expect(expireError(c.player, c.anim).status).toBe('paused')
  expect(expireError(c.player, c.anim).message).toBeNull()
})

test('restore after a reload pauses a playing station and leaves the notice', async () => {
  const onLofi = playing('lofi', 'lofi/0')
  const r = reduce(onLofi, { type: 'restore' }, makeCtx())
  expect(r.core.player.intent).toBe('pause')
  expect(r.core.player.status).toBe('paused')
  expect(r.notice).toBe(RESUME_NOTICE)
})

test('an unknown station key changes nothing', async () => {
  const r = reduce(makeCore(), { type: 'playStation', key: 'nope/9' }, makeCtx())
  expect(r.text).toBe('No station nope/9.')
  expect(r.core.player.intent).toBe('stop')
})
