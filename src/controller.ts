// The controller: the one module that performs I/O (state writes, the store,
// ffplay and yt-dlp, taskkill, the clock, toasts and the status line), through
// the Io door. Every change of playback goes through applyAction(), which runs
// the pure reducer. Every mutation runs inside serial(), so a press, a tick
// and a child's exit never interleave. yt-dlp runs outside the queue so a slow
// lookup never holds up a Stop press.
//
// A hot reload starts a fresh module and does not fire session.start again. So
// ensureEnv() runs once per environment, before its first change: it loads the
// stored prefs, restarts the ticker, restores a station that was playing as
// paused (the engine has ended its child) and re-arms a running focus timer.

import type { Player, Prefs, Station, Tools } from '../types'
import { findGenre, findStation, initialCatalog, parseSources, pickUniformGenre, pickVibeGenre } from './catalog'
import type { Io, Spawned, Timer } from './io'
import { pickMoodGenre } from './moods'
import { DEFAULT_PREFS, mergePrefs, resetPrefs } from './prefs'
import { advanceAnim, expireError, IDLE_ATTEMPT, NO_FFPLAY_MESSAGE, QUICK_FAIL_MS, reduce } from './reducer'
import type { Action, Attempt, Core, Ctx, Result } from './reducer'
import { INITIAL_TOOLS, noPlayText, readSnapshot, surfacePlays } from './state'
import { isStartFailure, killSucceeded, minutesBetween, parseWhereOutput } from './tools'

export const TICK_MS = 200
export const BAD_TTL_MS = 10 * 60 * 1000
export const YT_TTL_MS = 10 * 60 * 1000
const YT_TIMEOUT_MS = 25000
const VOLUME_DEBOUNCE_MS = 400
const KILL_TIMEOUT_MS = 3000
const END_KILL_TIMEOUT_MS = 1000
const KILL_RETRY_TICKS = 5
const KILL_MAX_TRIES = 4
const KILL_FAILED_NOTICE = 'Could not stop ffplay yet; retrying.'
const KILL_GAVE_UP_MESSAGE = 'ffplay did not stop; press p to try again.'

type Child = { key: string; volume: number; gen: number; startedAt: number }

let child: Child | null = null
let genSeq = 0
// Names this copy of the module. The session atom holds the owner's name, so a
// copy left behind by a hot reload sees another owner and stays idle.
const OWNER = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
let queue: Promise<unknown> = Promise.resolve()
let tickQueued = false
let ticker: Timer | null = null
let focusTimer: Timer | null = null
let focusToken: object | null = null
let volumeTimer: Timer | null = null
let volumeSettling = false
let attempt: Attempt = IDLE_ATTEMPT
let prefs: Prefs = DEFAULT_PREFS
let prefsReady = false
let prefsTried = false
let statusLine: string | null = null
let envReady = false
let sessionEnded = false
let killPending = false
let killWait = 0
let killTries = 0
let lastClock = 0
let ytMissingToasted = false
const bad = new Map<string, number>()
const ytCache = new Map<string, { url: string; at: number }>()
const resolving = new Set<string>()

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

// Resolves once every task queued so far has run (tests, and callers that need
// the queue flushed).
export function drainQueue(): Promise<void> {
  return serial(async () => undefined)
}

// The session atom names the copy that owns playback. A copy that is not the
// owner (an older copy, after a hot reload) does nothing; no owner yet means
// nobody has claimed it, so the copy that runs first proceeds.
async function isCurrentOwner(io: Io): Promise<boolean> {
  try {
    const { owner } = await io.session.read()
    return owner === null || owner === OWNER
  } catch {
    return true
  }
}

async function claimOwner(io: Io): Promise<void> {
  try {
    await io.session.update(s => (s.owner === OWNER ? s : { ...s, owner: OWNER }))
  } catch {
    // the atom refused: this copy plays on, unclaimed
  }
}

// serial() for a callback an earlier copy of this module may still run after a
// hot reload: it does nothing once a newer copy has claimed the session.
function serialOwned<T>(io: Io, task: () => Promise<T>): Promise<T | undefined> {
  return serial(async () => ((await isCurrentOwner(io)) ? task() : undefined))
}

// For a task nobody awaits: its failure is handled here, never left unhandled.
export function quietly(task: Promise<unknown>): void {
  task.catch(() => undefined)
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// The clock's reading. When the clock fails, the last reading stands, so a
// missing clock never turns into the epoch (a start time of 0).
async function clockNow(io: Io): Promise<number> {
  try {
    lastClock = await io.now()
  } catch {
    // keep lastClock
  }
  return lastClock
}

function toast(io: Io, text: string, timeoutMs: number): void {
  try {
    io.toast(text, timeoutMs)
  } catch {
    // the surface may be gone (a -p run); playback does not depend on it
  }
}

function debugLine(io: Io, text: string): void {
  try {
    io.debug(text)
  } catch {
    // the debug log is optional
  }
}

function effectiveVolume(player: Player): number {
  return player.muted ? 0 : player.volume
}

function pluginPath(io: Io, relative: string): string {
  return `${io.pluginRoot}/${relative}`
}

function activeBad(now: number): string[] {
  const keys: string[] = []
  for (const [key, until] of bad) {
    if (until > now) keys.push(key)
    else bad.delete(key)
  }
  return keys
}

function isPlayAction(action: Action): boolean {
  return (
    action.type === 'playGenre' ||
    action.type === 'playStation' ||
    action.type === 'playDefault' ||
    action.type === 'resume' ||
    action.type === 'toggle' ||
    action.type === 'next' ||
    action.type === 'prev'
  )
}

// --- prefs, tools, mirrors -------------------------------------------------

// Reads the store's prefs. A failed read leaves prefs unready: nothing is
// written over the stored values until a read succeeds.
async function loadPrefs(io: Io): Promise<void> {
  prefsTried = true
  try {
    prefs = mergePrefs(await io.getStore('prefs'))
    prefsReady = true
  } catch {
    prefsReady = false
  }
}

// Loads the stored prefs once per environment, before any write, so a fresh
// module never writes its defaults over the stored totals.
async function ensurePrefs(io: Io): Promise<void> {
  if (!prefsReady && !prefsTried) await loadPrefs(io)
}

async function mirrorSession(io: Io): Promise<void> {
  await io.session.update(s => ({
    ...s,
    totalMinutes: prefs.totals.minutes,
    totalSessions: prefs.totals.sessions,
    glyphSet: prefs.glyphSet,
  }))
}

// Changes prefs from the current values, then writes them when the store was
// read. Without a readable store the values hold for this session only.
async function updatePrefs(io: Io, change: (current: Prefs) => Partial<Prefs>): Promise<void> {
  await ensurePrefs(io)
  prefs = { ...prefs, ...change(prefs) }
  if (prefsReady) {
    try {
      await io.setStore('prefs', prefs)
    } catch {
      // the store refused the write: the values still hold for this session
    }
  }
  await mirrorSession(io)
}

async function patchTools(io: Io, patch: Partial<Tools>): Promise<void> {
  await io.tools.update(t => ({ ...t, ...patch }))
}

// A Windows tool by its full path under the system folder. A bare name would
// also be searched in the current directory, where a project's own copy could sit.
async function systemExe(io: Io, name: string): Promise<string> {
  let root: string | undefined
  try {
    root = await io.envSystemRoot()
  } catch {
    root = undefined
  }
  const base = root !== undefined && root.trim() !== '' ? root.trim().replace(/[\\/]+$/, '') : 'C:\\Windows'
  return `${base}\\System32\\${name}`
}

async function fileExists(io: Io, path: string): Promise<boolean> {
  try {
    return await io.exists(path)
  } catch {
    return false
  }
}

// where.exe with the $PATH: prefix searches PATH only (the bare form also
// searches the current directory first). It writes the console code page when
// its output is piped, so a non-ASCII path can come back garbled: a path that is
// not a file is not trusted, and the PATH scan below finds the file instead.
async function whereExe(io: Io, name: string): Promise<string | null> {
  try {
    const where = await systemExe(io, 'where.exe')
    const result = await io.run([where, `$PATH:${name}.exe`], 10000)
    if (result.exitCode !== 0) return null
    return parseWhereOutput(result.stdout)
  } catch {
    return null
  }
}

// The first PATH folder that holds the file, read with the engine's own strings.
// Relative PATH entries are skipped, so the current directory is never searched.
async function scanPath(io: Io, file: string): Promise<string | null> {
  let raw: string | undefined
  try {
    raw = await io.envPath()
  } catch {
    return null
  }
  if (raw === undefined) return null
  const folders = raw
    .split(';')
    .map(folder => folder.trim().replace(/^"(.*)"$/, '$1').replace(/[\\/]+$/, ''))
    .filter(folder => /^[A-Za-z]:[\\/]/.test(folder))
    .slice(0, 64)
  for (const folder of folders) {
    const candidate = `${folder}\\${file}`
    if (await fileExists(io, candidate)) return candidate
  }
  return null
}

async function locate(io: Io, name: string): Promise<string | null> {
  const fromWhere = await whereExe(io, name)
  if (fromWhere !== null && (await fileExists(io, fromWhere))) return fromWhere
  return scanPath(io, `${name}.exe`)
}

// Looks for both tools. Reads only: the caller writes the result inside serial().
async function findTools(io: Io): Promise<{ ffplay: string | null; ytdlp: string | null }> {
  const ffplay = await locate(io, 'ffplay')
  const ytdlp = await locate(io, 'yt-dlp')
  return { ffplay, ytdlp }
}

// Stores what findTools found. Runs inside serial().
async function writeTools(io: Io, found: { ffplay: string | null; ytdlp: string | null }): Promise<void> {
  await patchTools(io, { ffplay: found.ffplay !== null, ytdlp: found.ytdlp !== null })
  await updatePrefs(io, () => ({ ffplayPath: found.ffplay, ytdlpPath: found.ytdlp }))
}

// At session start, the lookup runs outside the queue; the write waits its turn.
export async function probeTools(io: Io): Promise<void> {
  const found = await findTools(io)
  await serial(() => writeTools(io, found))
}

// --- status line ------------------------------------------------------------

function statusLineFor(player: Player): string | null {
  if (player.status === 'loading') return 'tuning in…'
  if (player.status === 'playing') return `playing ${player.station !== null ? player.station.name : ''}`.trim()
  if (player.status === 'paused') return 'paused'
  if (player.status === 'error') return `error: ${player.message ?? 'playback failed'}`
  return null
}

function syncStatus(io: Io, player: Player): void {
  const line = statusLineFor(player)
  if (line === statusLine) return
  statusLine = line
  try {
    io.status(line === null ? undefined : `Claude Music: ${line}`)
  } catch {
    // the status line is optional
  }
}

// --- the child process -----------------------------------------------------

// taskkill /F /IM ffplay.exe. True when it ended one, or none was running.
async function killAll(io: Io, timeoutMs: number): Promise<boolean> {
  try {
    const taskkill = await systemExe(io, 'taskkill.exe')
    const result = await io.run([taskkill, '/F', '/IM', 'ffplay.exe'], timeoutMs)
    return killSucceeded(result.exitCode)
  } catch {
    return false
  }
}

// A kill that failed is tried again about once a second, and nothing new starts
// meanwhile. After KILL_MAX_TRIES failed tries the player pauses with a message,
// and the next press starts over. True when no kill is pending.
async function retryKill(io: Io): Promise<boolean> {
  if (!killPending) return true
  killWait += 1
  if (killWait < KILL_RETRY_TICKS) return false
  killWait = 0
  killTries += 1
  if (await killAll(io, KILL_TIMEOUT_MS)) {
    killPending = false
    killTries = 0
    await io.pane.update(p => ({ ...p, notice: p.notice === KILL_FAILED_NOTICE ? null : p.notice }))
    return true
  }
  if (killTries < KILL_MAX_TRIES) return false
  killPending = false
  killTries = 0
  await applyAction(io, { type: 'fail', message: KILL_GAVE_UP_MESSAGE, intent: 'pause' })
  await io.pane.update(p => ({ ...p, notice: KILL_GAVE_UP_MESSAGE }))
  return false
}

// Counts a child's minutes into the session and the stored totals.
async function accrueSince(io: Io, startedAt: number, now: number): Promise<void> {
  const minutes = minutesBetween(startedAt, now)
  if (minutes <= 0) return
  await io.session.update(s => ({ ...s, sessionMinutes: s.sessionMinutes + minutes }))
  await updatePrefs(io, current => ({ totals: { ...current.totals, minutes: current.totals.minutes + minutes } }))
}

// Ends the current child: kill it, then count its minutes. A kill that fails
// stays pending and is retried; nothing new starts while it is.
async function stopChild(io: Io): Promise<void> {
  const ended = child
  child = null
  if (!(await killAll(io, KILL_TIMEOUT_MS))) {
    killPending = true
    killWait = 0
    killTries = 0
    await io.pane.update(p => ({ ...p, notice: KILL_FAILED_NOTICE }))
  }
  if (ended === null) return
  await accrueSince(io, ended.startedAt, await clockNow(io))
}

async function startChild(io: Io, station: Station, url: string, eff: number, now: number): Promise<void> {
  // No bare-name fallback: a path that was not found on PATH is not guessed.
  const ffplay = prefs.ffplayPath
  let stream: Spawned | null = null
  if (ffplay !== null) {
    const argv = [ffplay, '-nodisp', '-hide_banner', '-loglevel', 'error', '-volume', String(eff)]
    if (station.kind === 'file') argv.push('-loop', '0')
    argv.push(url)
    try {
      stream = io.spawn(argv)
    } catch {
      stream = null
    }
  }
  if (stream === null) {
    await patchTools(io, { ffplay: false })
    await applyAction(io, { type: 'streamEnded', key: station.key, ranMs: 0, cannotStart: true })
    return
  }
  const gen = ++genSeq
  child = { key: station.key, volume: eff, gen, startedAt: now }
  // One session is counted per start from stopped; a pause or a hot reload does not count again.
  if (!(await io.session.read()).sessionCounted) {
    await io.session.update(s => ({ ...s, sessionCounted: true }))
    await updatePrefs(io, current => ({ totals: { ...current.totals, sessions: current.totals.sessions + 1 } }))
  }
  await io.player.update(p => (p.intent === 'play' ? { ...p, status: 'playing', startedAt: now, message: null } : p))
  quietly(watchChild(io, stream, gen, station, now))
  syncStatus(io, (await readSnapshot(io)).player)
}

// Drains the child's output and, when it ends on its own, hands the outcome
// to the reducer. A child we killed or replaced has another gen and is ignored.
async function watchChild(io: Io, stream: Spawned, gen: number, station: Station, startedAt: number): Promise<void> {
  let pulled = false
  let threw = false
  let lastLine = ''
  try {
    for await (const piece of stream) {
      pulled = true
      const lines = piece.text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
      if (lines.length > 0) lastLine = lines[lines.length - 1] ?? lastLine
    }
  } catch {
    threw = true
  }
  try {
    await stream.result
  } catch {
    // the stream was closed before its end; the loop above already settled
  }
  await serialOwned(io, async () => {
    if (child === null || child.gen !== gen) return
    child = null
    if (lastLine.length > 0) debugLine(io, `ffplay: ${lastLine}`)
    const now = await clockNow(io)
    const ranMs = now - startedAt
    const cannotStart = threw && !pulled
    if (cannotStart) await patchTools(io, { ffplay: false })
    else if (ranMs < QUICK_FAIL_MS) bad.set(station.key, now + BAD_TTL_MS)
    await accrueSince(io, startedAt, now)
    await applyAction(io, { type: 'streamEnded', key: station.key, ranMs, cannotStart })
    await reconcileNow(io)
  })
}

// --- youtube pages -----------------------------------------------------------

function missingYtdlpToast(io: Io): void {
  if (ytMissingToasted) return
  ytMissingToasted = true
  toast(io, 'yt-dlp not found: YouTube stations are skipped. Install it, e.g. winget install yt-dlp.yt-dlp', 5000)
}

async function runYtdlp(io: Io, station: Station): Promise<string | null> {
  const ytdlp = prefs.ytdlpPath
  if (ytdlp === null) {
    await patchTools(io, { ytdlp: false })
    missingYtdlpToast(io)
    return null
  }
  const started = await clockNow(io)
  try {
    const result = await io.run([ytdlp, '--no-playlist', '-g', '-f', 'bestaudio/worst', station.url], YT_TIMEOUT_MS)
    if (result.exitCode !== 0) return null
    const line = result.stdout
      .split(/\r?\n/)
      .map(text => text.trim())
      .find(text => text.length > 0)
    if (line === undefined) return null
    await patchTools(io, { ytdlp: true })
    return line
  } catch {
    // $.process.run rejects at its timeout too: only a quick rejection means
    // yt-dlp did not start; a slow one is a lookup that timed out.
    const ended = await clockNow(io)
    if (isStartFailure(ended - started, YT_TIMEOUT_MS)) {
      await patchTools(io, { ytdlp: false })
      missingYtdlpToast(io)
    }
    return null
  }
}

function resolveInBackground(io: Io, station: Station): void {
  if (resolving.has(station.key)) return
  resolving.add(station.key)
  void (async () => {
    const url = await runYtdlp(io, station)
    const now = await clockNow(io)
    await serialOwned(io, async () => {
      resolving.delete(station.key)
      if (url !== null) {
        ytCache.set(station.url, { url, at: now })
      } else {
        // A missing yt-dlp is not the station's fault, so it is not marked bad.
        if ((await io.tools.read()).ytdlp !== false) bad.set(station.key, now + BAD_TTL_MS)
        await applyAction(io, { type: 'streamEnded', key: station.key, ranMs: 0, cannotStart: false })
      }
      await reconcileNow(io)
    })
  })().catch(() => {
    resolving.delete(station.key)
  })
}

// --- reconciler ------------------------------------------------------------

// Brings the child in line with the player: a stop or pause kills it, a play
// starts the station once the record is down (swapStep 0), and a volume or
// mute change restarts it (volume after the debounce). Runs inside serial().
async function reconcileNow(io: Io): Promise<void> {
  if (sessionEnded) return
  await ensureEnv(io)
  const snap = await readSnapshot(io)
  if (snap.session.surface === 'mobile') return
  if (snap.tools.ffplay === null) return
  const player = snap.player
  if (snap.tools.ffplay === false) {
    if (player.intent === 'play') await applyAction(io, { type: 'fail', message: NO_FFPLAY_MESSAGE, intent: 'pause' })
    return
  }
  if (!(await retryKill(io))) return
  if (player.intent !== 'play' || player.station === null) {
    if (child !== null) await stopChild(io)
    return
  }
  const station = player.station
  // A stream that ended on its own keeps its error on show for the error's window
  // before the retry starts.
  if (player.status === 'error' && snap.anim.tick < snap.anim.errorUntilTick) return
  const eff = effectiveVolume(player)
  if (child !== null && child.key === station.key && (child.volume === eff || volumeSettling)) return

  const now = await clockNow(io)
  let url: string
  if (station.kind === 'youtube') {
    const cached = ytCache.get(station.url)
    if (cached !== undefined && now - cached.at < YT_TTL_MS) {
      url = cached.url
    } else {
      // yt-dlp was missing at the last probe: the station is passed over without a
      // bad mark, so it comes back once a play press finds yt-dlp.
      if (snap.tools.ytdlp === false) {
        await applyAction(io, { type: 'streamEnded', key: station.key, ranMs: 0, cannotStart: false })
        return
      }
      resolveInBackground(io, station)
      return
    }
  } else if (station.kind === 'file') {
    url = pluginPath(io, station.url)
  } else {
    url = station.url
  }
  if (snap.anim.swapStep !== 0) return
  if (child !== null) await stopChild(io)
  // A kill that failed leaves the old stream possibly playing: nothing new
  // starts until it is confirmed gone. The session may have ended during the
  // kill; the check and startChild's spawn have no await between them.
  if (sessionEnded || killPending) return
  await startChild(io, station, url, eff, now)
}

function scheduleReconcile(io: Io): void {
  quietly(serialOwned(io, () => reconcileNow(io)))
}

// --- the reducer's door ----------------------------------------------------

async function applyAction(io: Io, action: Action): Promise<string> {
  let snap = await readSnapshot(io)
  // On a surface that cannot play nothing plays, so the record does not move
  // either: the reducer does not run and the pane says why.
  if (snap.session.surface === 'mobile' && isPlayAction(action)) {
    const notice = noPlayText(snap.session)
    await io.pane.update(p => ({ ...p, notice }))
    return notice
  }
  // A tool that was missing at the last probe is looked for again by a play press,
  // before the reducer decides, so the press that follows an install plays at once.
  if (isPlayAction(action) && (snap.tools.ffplay === false || snap.tools.ytdlp === false)) {
    await writeTools(io, await findTools(io))
    snap = await readSnapshot(io)
  }
  const now = await clockNow(io)
  if (action.type === 'playStation') bad.delete(action.key)
  const core: Core = { player: snap.player, anim: snap.anim, catalog: snap.catalog, tools: snap.tools }
  const ctx: Ctx = {
    rand: Math.random(),
    rand2: Math.random(),
    bad: activeBad(now),
    lastGenre: prefs.lastGenre,
    lastStationByGenre: prefs.lastStationByGenre,
    attempt,
  }
  const result: Result = reduce(core, action, ctx)
  attempt = result.attempt
  if (action.type === 'stop' || action.type === 'focusEnd') {
    await io.session.update(s => ({ ...s, sessionCounted: false }))
  }
  if (!sameJson(result.core.player, snap.player)) await io.player.update(() => result.core.player)
  if (!sameJson(result.core.anim, snap.anim)) await io.anim.update(() => result.core.anim)
  if (!sameJson(result.core.tools, snap.tools)) await io.tools.update(() => result.core.tools)
  if (result.notice !== undefined) {
    const shown: string | null = result.notice
    await io.pane.update(p => ({ ...p, notice: shown }))
  }
  if (result.toast) toast(io, result.toast.text, result.toast.timeoutMs)
  const patch = result.prefs
  if (patch !== undefined) await updatePrefs(io, () => patch)
  if (result.cancelFocus) await cancelFocusNow(io)
  if (action.type === 'setVolume' || action.type === 'volumeStep') settleVolume(io)
  syncStatus(io, result.core.player)
  return result.text
}

// The one public door for playback changes: queued, then the child follows.
export function press(io: Io, action: Action): Promise<string> {
  return serial(async () => {
    await ensureEnv(io)
    const text = await applyAction(io, action)
    scheduleReconcile(io)
    return text
  })
}

// A volume change restarts the child once the value has settled for 400 ms.
function settleVolume(io: Io): void {
  volumeSettling = true
  if (volumeTimer !== null) volumeTimer.cancel()
  try {
    volumeTimer = io.after(VOLUME_DEBOUNCE_MS, () => {
      volumeTimer = null
      volumeSettling = false
      scheduleReconcile(io)
    })
  } catch {
    volumeTimer = null
    volumeSettling = false
  }
}

// --- the 200 ms ticker -----------------------------------------------------

// Starts the ticker unless one runs. Render hooks call it as well: a hot
// reload drops the old timers, and the next drawing restarts them.
export function ensureTicker(io: Io): void {
  if (ticker !== null || sessionEnded) return
  try {
    ticker = io.every(TICK_MS, () => notifyTick(io))
  } catch {
    ticker = null
  }
}

async function onTick(io: Io): Promise<void> {
  await ensureEnv(io)
  const now = await clockNow(io)
  const anim = await io.anim.update(a => advanceAnim(a, now))
  const current = await io.player.read()
  if (current.status === 'error' && anim.tick >= anim.errorUntilTick) {
    const player = await io.player.update(p => expireError(p, anim))
    syncStatus(io, player)
  }
  await reconcileNow(io)
}

// The ticker's entry: at most one tick waits in the queue, so a slow turn of
// the engine cannot pile up timers.
export function notifyTick(io: Io): void {
  if (tickQueued) return
  tickQueued = true
  quietly(
    serialOwned(io, () => onTick(io)).finally(() => {
      tickQueued = false
    }),
  )
}

// Runs once per environment, before its first change (see the header).
async function ensureEnv(io: Io): Promise<void> {
  if (envReady) return
  envReady = true
  await claimOwner(io)
  ensureTicker(io)
  await ensurePrefs(io)
  const snap = await readSnapshot(io)
  const p = snap.player
  if (child === null && p.station !== null && (p.status === 'playing' || p.status === 'loading')) {
    await applyAction(io, { type: 'restore' })
  }
  const endsAt = snap.session.focusEndsAt
  if (endsAt !== null && focusTimer === null) {
    const left = endsAt - (await clockNow(io))
    if (left <= 0) await onFocusEnd(io)
    else armFocus(io, left)
  }
}

// --- focus -----------------------------------------------------------------

async function cancelFocusNow(io: Io): Promise<void> {
  focusToken = null
  if (focusTimer !== null) {
    focusTimer.cancel()
    focusTimer = null
  }
  await io.session.update(s => ({ ...s, focusEndsAt: null }))
}

// Each armed focus timer has its own token. A timer that fires after a stop, or
// after a newer focus was armed, finds the token replaced and does nothing.
function armFocus(io: Io, ms: number): boolean {
  const token: object = {}
  focusToken = token
  try {
    focusTimer = io.after(ms, () => {
      quietly(serialOwned(io, () => onFocusFired(io, token)))
    })
    return true
  } catch {
    focusTimer = null
    focusToken = null
    return false
  }
}

async function onFocusFired(io: Io, token: object): Promise<void> {
  if (focusToken !== token) return
  await onFocusEnd(io)
}

export function startFocus(io: Io, minutes: number): Promise<void> {
  return serial(async () => {
    await ensureEnv(io)
    await cancelFocusNow(io)
    const now = await clockNow(io)
    const span = minutes * 60000
    if (!armFocus(io, span)) return
    await io.session.update(s => ({ ...s, focusEndsAt: now + span, focusMinutes: minutes }))
  })
}

// The focus timer fired: stop the music, then play the chime once, on its
// own child, so the kill that stops the music cannot take the chime with it.
async function onFocusEnd(io: Io): Promise<void> {
  focusTimer = null
  focusToken = null
  await io.session.update(s => ({ ...s, focusEndsAt: null }))
  if (child !== null) await stopChild(io)
  await applyAction(io, { type: 'focusEnd' })
  playChime(io)
}

function playChime(io: Io): void {
  const ffplay = prefs.ffplayPath
  if (ffplay === null) return
  try {
    const stream = io.spawn([
      ffplay,
      '-nodisp',
      '-autoexit',
      '-loglevel',
      'error',
      '-volume',
      '60',
      pluginPath(io, 'assets/chime.wav'),
    ])
    quietly(
      (async () => {
        for await (const piece of stream) void piece
        await stream.result
      })(),
    )
  } catch {
    // no chime when ffplay cannot start; the stop still happened
  }
}

// --- the catalog file -------------------------------------------------------

// Reads config/sources.yml. When the file cannot be read, the built-in copy
// stands in; when it is read but does not parse, the error is shown instead.
async function loadCatalog(io: Io): Promise<void> {
  let text: string | null
  try {
    text = await io.readText(pluginPath(io, 'config/sources.yml'))
  } catch {
    text = null
  }
  if (text === null) {
    await io.catalog.update(() => initialCatalog())
    debugLine(io, 'config/sources.yml could not be read; the built-in catalog is in use')
    return
  }
  const parsed = parseSources(text)
  await io.catalog.update(() => ({ genres: parsed.genres, error: parsed.error }))
}

// --- session ---------------------------------------------------------------

export async function startSession(io: Io, e: { isInteractive: boolean; surface: string | null }): Promise<void> {
  sessionEnded = false
  await serial(async () => {
    if (ticker !== null) ticker.cancel()
    ticker = null
    if (focusTimer !== null) focusTimer.cancel()
    focusTimer = null
    focusToken = null
    if (volumeTimer !== null) volumeTimer.cancel()
    volumeTimer = null
    volumeSettling = false
    killPending = false
    killWait = 0
    killTries = 0
    ytMissingToasted = false
    // The desktop app and the SDK start a session with surface null and isInteractive
    // false (the surface attaches later), so only mobile, which cannot spawn a player,
    // is refused.
    const canPlay = e.surface !== 'mobile'
    await loadPrefs(io)
    envReady = true
    child = null
    attempt = IDLE_ATTEMPT
    bad.clear()
    ytCache.clear()
    resolving.clear()
    statusLine = null
    await loadCatalog(io)
    await io.tools.update(() => INITIAL_TOOLS)
    const before = await readSnapshot(io)
    await io.session.update(s => ({
      ...s,
      canPlay,
      surface: e.surface,
      focusEndsAt: null,
      glyphSet: prefs.glyphSet,
      sessionMinutes: 0,
      sessionCounted: false,
      owner: OWNER,
    }))
    if (before.player.station === null && before.player.status === 'stopped') {
      await io.player.update(p => ({ ...p, volume: prefs.volume, muted: prefs.muted }))
    }
    await mirrorSession(io)
    await io.pane.update(p => ({ ...p, notice: canPlay ? null : noPlayText({ canPlay, surface: e.surface }) }))
    ensureTicker(io)
    if (before.player.station !== null && (before.player.status === 'playing' || before.player.status === 'loading')) {
      await applyAction(io, { type: 'restore' })
    }
  })
  quietly(probeTools(io))
  scheduleReconcile(io)
}

// A hot reload keeps the session's state but starts no session, so a session an
// older build started has no boolean canPlay. Its draw shows the update notice
// instead of the stale one. This only reads and sets the notice; playback still
// waits for a session.start, the event that decides canPlay.
export function noteStaleSession(io: Io): void {
  quietly(
    serial(async () => {
      const session = await io.session.read()
      const pane = await io.pane.read()
      const stale = pane.notice !== null && /^(Playback is off|Claude Music was updated)/.test(pane.notice)
      if (session.surface === 'mobile') {
        const notice = noPlayText({ canPlay: false, surface: 'mobile' })
        if (pane.notice !== notice) await io.pane.update(p => ({ ...p, notice }))
      } else if (stale) {
        await io.pane.update(p => ({ ...p, notice: null }))
      }
    }),
  )
}

// session.end: a /clear keeps the music going; any other end stops it. The
// session is marked ended first, so a lookup that finishes later cannot start
// a child after this.
export async function endSession(io: Io, reason: string): Promise<void> {
  if (reason === 'clear') return
  sessionEnded = true
  if (ticker !== null) {
    ticker.cancel()
    ticker = null
  }
  if (focusTimer !== null) {
    focusTimer.cancel()
    focusTimer = null
  }
  if (volumeTimer !== null) {
    volumeTimer.cancel()
    volumeTimer = null
  }
  volumeSettling = false
  const ended = child
  child = null
  // The kill comes first: the session's hooks share one short time bound, and a
  // child that outlives Claude is the failure that matters. Minutes come after.
  if (ended !== null || killPending) await killAll(io, END_KILL_TIMEOUT_MS)
  if (ended === null) return
  try {
    await accrueSince(io, ended.startedAt, await clockNow(io))
  } catch {
    // the session is ending; the totals keep what they had
  }
}

// --- compound actions (mood, vibe, shuffle, search, focus, reset) ---------

export async function actMood(io: Io, text: string): Promise<string> {
  await ensurePrefs(io)
  const { catalog } = await readSnapshot(io)
  const trimmed = text.trim()
  // Only genres the catalog still lists can win a mood.
  const available = catalog.genres.map(g => g.name)
  const pick = pickMoodGenre(trimmed, prefs.lastGenre, Math.random(), available)
  const genre = pick.genre ?? pickVibeGenre(catalog, prefs.lastGenre, Math.random())
  if (genre === null) return 'The catalog is empty.'
  const label = pick.matched ? `mood "${trimmed}": ${genre}` : `no mood match; picked ${genre}`
  return press(io, { type: 'playGenre', genre, label })
}

export async function actVibe(io: Io): Promise<string> {
  await ensurePrefs(io)
  const { catalog } = await readSnapshot(io)
  const genre = pickVibeGenre(catalog, prefs.lastGenre, Math.random())
  if (genre === null) return 'The catalog is empty.'
  return press(io, { type: 'playGenre', genre })
}

export async function actShuffle(io: Io): Promise<string> {
  const { catalog } = await readSnapshot(io)
  const genre = pickUniformGenre(catalog, Math.random())
  if (genre === null) return 'The catalog is empty.'
  return press(io, { type: 'playGenre', genre })
}

export async function actPlayQuery(io: Io, query: string): Promise<string> {
  const { catalog } = await readSnapshot(io)
  const genre = findGenre(catalog, query)
  if (genre !== null) return press(io, { type: 'playGenre', genre })
  const station = findStation(catalog, query)
  if (station !== null) return press(io, { type: 'playStation', key: station.key })
  return `no genre or station ${query}; try /music list`
}

// The timer runs whether or not music plays; it stops nothing that is not
// playing.
export async function actFocus(io: Io, minutes: number): Promise<string> {
  await startFocus(io, minutes)
  const { player } = await readSnapshot(io)
  const tail = player.intent === 'play' ? '' : ' Nothing is playing yet; /music play starts it.'
  return `Focus for ${minutes} min. The music stops and a chime plays when time is up.${tail}`
}

export function resetPrefsNow(io: Io): Promise<string> {
  return serial(async () => {
    await ensureEnv(io)
    await ensurePrefs(io)
    prefs = resetPrefs(prefs)
    if (prefsReady) {
      try {
        await io.setStore('prefs', prefs)
      } catch {
        // the store refused; the reset still holds for this session
      }
    }
    await io.player.update(p => ({ ...p, volume: prefs.volume, muted: prefs.muted }))
    await mirrorSession(io)
    settleVolume(io)
    return 'Preferences reset: volume 30, unmuted, no last station. Totals kept.'
  })
}
