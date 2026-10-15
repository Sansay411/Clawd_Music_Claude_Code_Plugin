// Playback under a fake Io, with no engine: the kill comes before the minutes
// are counted at session end, nothing starts once the session has ended, a
// stream that ends early keeps its error on show before the retry, a play press
// finds a tool installed mid-session at once, and a kill that keeps failing is
// given up with the player paused. Then the surfaces: an interactive terminal,
// desktop or VS Code session plays; mobile, a non-interactive run and a session
// an older build started do not.

import { expect, test } from 'claude-code/testing'
import {
  drainQueue,
  endSession,
  ensureTicker,
  noteStaleSession,
  notifyTick,
  press,
  probeTools,
  startSession,
} from '../src/controller'
import type { Io, Spawned } from '../src/io'
import { ERROR_TICKS } from '../src/reducer'
import { INITIAL_ANIM, INITIAL_CATALOG, INITIAL_PANE, INITIAL_PLAYER, INITIAL_SESSION, INITIAL_TOOLS, noPlayText } from '../src/state'
import type { Session } from '../types'

const FFPLAY = 'C:\\tools\\ffplay.exe'
const KILL_FAILED = 'Could not stop ffplay yet; retrying.'
const KILL_GAVE_UP = 'ffplay did not stop; press p to try again.'

type Spawn = { argv: readonly string[]; finish: () => void }

type Fake = {
  io: Io
  calls: string[]
  spawns: Spawn[]
  clock: { now: number }
  tick: { run: (() => void) | null }
  installed: { ffplay: boolean }
  killExit: { code: number }
}

function slot<T>(initial: T) {
  let value = initial
  return {
    read: async (): Promise<T> => value,
    update: async (change: (current: T) => T): Promise<T> => {
      value = change(value)
      return value
    },
  }
}

// A child's output that stays open until finish() is called; then it ends.
function fakeStream(): { stream: Spawned; finish: () => void } {
  let finish: () => void = () => undefined
  const ended = new Promise<void>(resolve => {
    finish = resolve
  })
  const stream = {
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        await ended
        return { done: true, value: undefined }
      },
    }),
    result: ended.then(() => ({ code: 0, signal: null })),
  }
  return { stream: stream as unknown as Spawned, finish }
}

function makeFake(options: { ffplayInstalled: boolean; killExitCode?: number }): Fake {
  const calls: string[] = []
  const spawns: Spawn[] = []
  const clock = { now: 1_000_000 }
  const tick: { run: (() => void) | null } = { run: null }
  const installed = { ffplay: options.ffplayInstalled }
  const killExit = { code: options.killExitCode ?? 0 }
  const store = new Map<string, unknown>()
  const io: Io = {
    pluginRoot: 'C:\\plugin',
    readText: async () => {
      throw new Error('no catalog file in the test')
    },
    now: async () => clock.now,
    player: slot(INITIAL_PLAYER),
    anim: slot(INITIAL_ANIM),
    catalog: slot(INITIAL_CATALOG),
    tools: slot(INITIAL_TOOLS),
    pane: slot(INITIAL_PANE),
    session: slot(INITIAL_SESSION),
    exists: async path => path === FFPLAY && installed.ffplay,
    envPath: async () => undefined,
    envSystemRoot: async () => 'C:\\Windows',
    run: async argv => {
      const program = argv[0] ?? ''
      if (program.endsWith('taskkill.exe')) {
        calls.push('taskkill')
        return { exitCode: killExit.code, stdout: '', stderr: '' }
      }
      if (program.endsWith('where.exe')) {
        const found = (argv[1] ?? '').includes('ffplay') && installed.ffplay
        return { exitCode: found ? 0 : 1, stdout: found ? `${FFPLAY}\r\n` : '', stderr: '' }
      }
      return { exitCode: 1, stdout: '', stderr: '' }
    },
    spawn: argv => {
      const { stream, finish } = fakeStream()
      spawns.push({ argv, finish })
      return stream
    },
    getStore: async key => store.get(key),
    setStore: async (key, value) => {
      calls.push('store')
      store.set(key, value)
    },
    toast: () => undefined,
    status: () => undefined,
    debug: () => undefined,
    after: () => ({ cancel: () => undefined }),
    every: (_ms, fn) => {
      tick.run = fn
      return {
        cancel: () => {
          tick.run = null
        },
      }
    },
    open: async () => ({ isPlaced: true, reason: '' }),
    registerCommand: async () => undefined,
  }
  return { io, calls, spawns, clock, tick, installed, killExit }
}

// Lets the chains of awaited steps reach the queue, then drains it twice.
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve()
  await drainQueue()
  await drainQueue()
}

// Ticker readings: each one moves the record's swap and the reconciler on.
async function ticks(fake: Fake, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    fake.tick.run?.()
    await settle()
  }
}

// Starts the session, plays an electronic station (direct streams only) and
// waits for the record to go down, which is when the child starts.
async function startPlaying(fake: Fake): Promise<void> {
  await startSession(fake.io, { isInteractive: true, surface: 'terminal' })
  await probeTools(fake.io)
  await press(fake.io, { type: 'playGenre', genre: 'electronic' })
  await ticks(fake, 6)
}

test('ending the session kills the child before it counts the minutes', async () => {
  const fake = makeFake({ ffplayInstalled: true })
  await startPlaying(fake)
  expect(fake.spawns.length).toBe(1)
  fake.clock.now += 120_000
  const before = fake.calls.length
  await endSession(fake.io, 'exit')
  const after = fake.calls.slice(before)
  expect(after[0]).toBe('taskkill')
  expect(after.includes('store')).toBe(true)
  expect((await fake.io.session.read()).sessionMinutes).toBe(2)
})

test('nothing starts once the session has ended, and the ticker is not re-armed', async () => {
  const fake = makeFake({ ffplayInstalled: true })
  await startPlaying(fake)
  await endSession(fake.io, 'exit')
  ensureTicker(fake.io)
  expect(fake.tick.run).toBe(null)
  // A play press sets the record swapping; the ticks that follow still must not start a child.
  await press(fake.io, { type: 'playGenre', genre: 'jazz' })
  for (let i = 0; i < 8; i++) {
    notifyTick(fake.io)
    await settle()
  }
  expect(fake.spawns.length).toBe(1)
})

test('a stream that ends early keeps its error on show before the retry starts', async () => {
  const fake = makeFake({ ffplayInstalled: true })
  await startPlaying(fake)
  fake.clock.now += 6_000
  fake.spawns[0]?.finish()
  await settle()
  expect((await fake.io.player.read()).status).toBe('error')
  expect(fake.spawns.length).toBe(1)
  await ticks(fake, ERROR_TICKS - 1)
  expect(fake.spawns.length).toBe(1)
  await ticks(fake, 1)
  expect(fake.spawns.length).toBe(2)
})

test('a play press after ffplay is installed starts it at once', async () => {
  const fake = makeFake({ ffplayInstalled: false })
  await startSession(fake.io, { isInteractive: true, surface: 'terminal' })
  await probeTools(fake.io)
  expect((await fake.io.tools.read()).ffplay).toBe(false)
  fake.installed.ffplay = true
  await press(fake.io, { type: 'playGenre', genre: 'electronic' })
  expect((await fake.io.tools.read()).ffplay).toBe(true)
  await ticks(fake, 6)
  expect(fake.spawns.length).toBe(1)
  expect((await fake.io.player.read()).intent).toBe('play')
})

test('a kill that keeps failing is given up after a few tries, and the player pauses', async () => {
  const fake = makeFake({ ffplayInstalled: true, killExitCode: 1 })
  await startPlaying(fake)
  await press(fake.io, { type: 'stop' })
  await settle()
  expect(fake.spawns.length).toBe(1)
  expect((await fake.io.pane.read()).notice).toBe(KILL_FAILED)
  await ticks(fake, 25)
  expect((await fake.io.player.read()).intent).toBe('pause')
  expect((await fake.io.pane.read()).notice).toBe(KILL_GAVE_UP)
  expect(fake.spawns.length).toBe(1)
})

// Playback follows the session start: an interactive run on the terminal, the
// desktop app or VS Code plays; mobile and a non-interactive run never do.
async function startOn(fake: Fake, isInteractive: boolean, surface: string | null): Promise<void> {
  await startSession(fake.io, { isInteractive, surface })
  await probeTools(fake.io)
}

for (const surface of ['terminal', 'desktop', 'vscode']) {
  test(`an interactive ${surface} session plays, and shows no warning line`, async () => {
    const fake = makeFake({ ffplayInstalled: true })
    await startOn(fake, true, surface)
    await press(fake.io, { type: 'playGenre', genre: 'electronic' })
    await ticks(fake, 6)
    expect(fake.spawns.length).toBe(1)
    expect((await fake.io.player.read()).intent).toBe('play')
    expect((await fake.io.pane.read()).notice).toBe(null)
  })
}

test('a mobile session shows the pane and plays nothing; the notice says why', async () => {
  const fake = makeFake({ ffplayInstalled: true })
  await startOn(fake, true, 'mobile')
  const reply = await press(fake.io, { type: 'playGenre', genre: 'electronic' })
  await ticks(fake, 6)
  expect(fake.spawns.length).toBe(0)
  expect((await fake.io.player.read()).intent).toBe('stop')
  expect((await fake.io.pane.read()).notice).toBe(noPlayText({ canPlay: false, surface: 'mobile' }))
  expect(reply).toBe(noPlayText({ canPlay: false, surface: 'mobile' }))
})

test('the desktop app starts a session with no surface and not interactive, and still plays', async () => {
  const fake = makeFake({ ffplayInstalled: true })
  await startOn(fake, false, null)
  await press(fake.io, { type: 'playGenre', genre: 'electronic' })
  await ticks(fake, 6)
  expect(fake.spawns.length).toBe(1)
  expect((await fake.io.pane.read()).notice).toBe(null)
})

test('a leftover play-off notice from an older build is cleared on a surface that plays', async () => {
  const fake = makeFake({ ffplayInstalled: true })
  await startOn(fake, false, null)
  await fake.io.pane.update(p => ({ ...p, notice: 'Playback is off in this run. It needs an interactive session.' }))
  noteStaleSession(fake.io)
  await settle()
  expect((await fake.io.pane.read()).notice).toBe(null)
})
