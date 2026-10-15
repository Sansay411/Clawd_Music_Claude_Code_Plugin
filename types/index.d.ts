// Contract for the claude-music mod: the value types its hooks module uses,
// and the PluginState keys it owns (declared under the mod name).

export type Intent = 'play' | 'pause' | 'stop'

export type Status = 'stopped' | 'loading' | 'playing' | 'paused' | 'error'

export type StationKind = 'direct' | 'youtube' | 'file'

export type Station = {
  key: string
  name: string
  url: string
  kind: StationKind
  genre: string
}

export type Player = {
  intent: Intent
  status: Status
  genre: string | null
  station: Station | null
  prevStation: Station | null
  startedAt: number | null
  message: string | null
  volume: number
  muted: boolean
}

export type Anim = {
  tick: number
  nowMs: number
  swapStep: number
  swapFrom: string | null
  swapTo: string | null
  platterGenre: string | null
  errorUntilTick: number
}

export type CatalogStation = {
  name: string
  url: string
  kind: 'direct' | 'youtube'
}

export type CatalogGenre = {
  name: string
  tone: string
  stations: CatalogStation[]
}

export type Catalog = {
  genres: CatalogGenre[]
  error: string | null
}

export type Tools = {
  ffplay: boolean | null
  ytdlp: boolean | null
}

export type PaneState = {
  moodDraft: string
  notice: string | null
}

export type Session = {
  // Whether this session can play: interactive, on the terminal, the desktop
  // app or VS Code. Mobile and non-interactive runs show the pane only.
  canPlay: boolean
  // The surface the session draws on, from session.start or the last draw.
  surface: string | null
  focusEndsAt: number | null
  focusMinutes: number
  sessionMinutes: number
  // Whether this session's start from stopped has been counted in the totals.
  sessionCounted: boolean
  // The copy of the hooks module that owns playback; a copy left behind by a
  // hot reload sees another owner and does nothing.
  owner: string | null
  totalMinutes: number
  totalSessions: number
  glyphSet: 'unicode' | 'ascii'
}

// Persisted in $.store under the key 'prefs' (not state).
export type Totals = {
  sessions: number
  minutes: number
}

export type Prefs = {
  volume: number
  muted: boolean
  lastGenre: string | null
  lastStationByGenre: Record<string, string>
  ffplayPath: string | null
  ytdlpPath: string | null
  glyphSet: 'unicode' | 'ascii'
  totals: Totals
}

declare module 'claude-code' {
  interface PluginState {
    'clawd-music': {
      player: Player
      anim: Anim
      catalog: Catalog
      tools: Tools
      pane: PaneState
      session: Session
    }
  }
}
