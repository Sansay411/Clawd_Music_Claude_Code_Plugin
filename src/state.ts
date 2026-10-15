// The mod's state: the initial values of its six atoms, and a reader for all of
// them. The atoms themselves are declared in hooks/register.tsx, where the
// engine's state library can see their literal references. Drawing reads
// them; only handlers, timers and the controller write.

import type { Anim, Catalog, PaneState, Player, Session, Tools } from '../types'
import type { Io } from './io'

// The pane's id. A pane id is not the plugin's name, so it keeps this form.
export const PANE_ID = 'claude-music'

export const INITIAL_PLAYER: Player = {
  intent: 'stop',
  status: 'stopped',
  genre: null,
  station: null,
  prevStation: null,
  startedAt: null,
  message: null,
  volume: 30,
  muted: false,
}

export const INITIAL_ANIM: Anim = {
  tick: 0,
  nowMs: 0,
  swapStep: 0,
  swapFrom: null,
  swapTo: null,
  platterGenre: null,
  errorUntilTick: 0,
}

export const INITIAL_CATALOG: Catalog = { genres: [], error: null }

export const INITIAL_TOOLS: Tools = { ffplay: null, ytdlp: null }

export const INITIAL_PANE: PaneState = { moodDraft: '', notice: null }

// The surfaces that play: the terminal, the desktop app and VS Code. Mobile
// draws the pane only. A non-interactive run (claude -p, the SDK) plays nothing
// whatever its surface, so the session start checks both.
export function surfacePlays(surface: string | null): boolean {
  return surface === 'terminal' || surface === 'desktop' || surface === 'vscode'
}

const MOBILE_NOTICE = 'Playback is off on mobile. Play from the terminal, the desktop app or VS Code.'
const RUN_NOTICE = 'Playback is off in this run. It needs an interactive session: the terminal, the desktop app or VS Code.'
const STALE_NOTICE = 'Claude Music was updated after this session began. Start a new session to play.'

// The notice that says why nothing plays in this session, in words true for it.
// A session an older build started has no boolean canPlay (a hot reload keeps the
// state but not the start), so it gets the update notice, not a surface notice.
export function noPlayText(session: { canPlay: unknown; surface: string | null }): string {
  if (typeof session.canPlay !== 'boolean') return STALE_NOTICE
  return session.surface === 'mobile' ? MOBILE_NOTICE : RUN_NOTICE
}

// The notice line is orange only on a surface that cannot play (mobile, where the
// pane is all there is). On a surface that plays, a playback problem (a stop that
// failed, a stream that ended) and the words of a non-interactive run keep the
// text colour, so orange never marks a music that is playing.
export function noticeColor(surface: string | null, notice: string | null): 'warning' | undefined {
  return notice !== null && !surfacePlays(surface) ? 'warning' : undefined
}

export const INITIAL_SESSION: Session = {
  canPlay: false,
  surface: null,
  focusEndsAt: null,
  focusMinutes: 25,
  sessionMinutes: 0,
  sessionCounted: false,
  owner: null,
  totalMinutes: 0,
  totalSessions: 0,
  glyphSet: 'unicode',
}

export type Snapshot = {
  player: Player
  anim: Anim
  catalog: Catalog
  tools: Tools
  pane: PaneState
  session: Session
}

export async function readSnapshot(io: Io): Promise<Snapshot> {
  return {
    player: await io.player.read(),
    anim: await io.anim.read(),
    catalog: await io.catalog.read(),
    tools: await io.tools.read(),
    pane: await io.pane.read(),
    session: await io.session.read(),
  }
}
