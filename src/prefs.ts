// Preferences kept in the engine's store under 'prefs' (not state, survives
// sessions). Pure: the store calls live in controller.ts.

import type { Prefs } from '../types'

export const DEFAULT_PREFS: Prefs = {
  volume: 30,
  muted: false,
  lastGenre: null,
  lastStationByGenre: {},
  ffplayPath: null,
  ytdlpPath: null,
  glyphSet: 'unicode',
  totals: { sessions: 0, minutes: 0 },
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PREFS.volume
  return Math.min(100, Math.max(0, Math.round(value)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Whatever the store holds, field by field: a wrong or missing field falls
// back to its default, so a damaged file never blocks the mod.
export function mergePrefs(raw: unknown): Prefs {
  const source = isRecord(raw) ? raw : {}
  const totals = isRecord(source.totals) ? source.totals : {}
  const byGenre: Record<string, string> = {}
  if (isRecord(source.lastStationByGenre)) {
    for (const [genre, key] of Object.entries(source.lastStationByGenre)) {
      if (typeof key === 'string') byGenre[genre] = key
    }
  }
  return {
    volume: typeof source.volume === 'number' ? clampVolume(source.volume) : DEFAULT_PREFS.volume,
    muted: typeof source.muted === 'boolean' ? source.muted : DEFAULT_PREFS.muted,
    lastGenre: typeof source.lastGenre === 'string' ? source.lastGenre : null,
    lastStationByGenre: byGenre,
    ffplayPath: typeof source.ffplayPath === 'string' ? source.ffplayPath : null,
    ytdlpPath: typeof source.ytdlpPath === 'string' ? source.ytdlpPath : null,
    glyphSet: source.glyphSet === 'ascii' ? 'ascii' : 'unicode',
    totals: {
      sessions: typeof totals.sessions === 'number' && totals.sessions >= 0 ? Math.floor(totals.sessions) : 0,
      minutes: typeof totals.minutes === 'number' && totals.minutes >= 0 ? totals.minutes : 0,
    },
  }
}

// /music reset: the listed fields go back to their defaults, the totals and
// the tool paths and glyph choice stay.
export function resetPrefs(previous: Prefs): Prefs {
  return {
    ...previous,
    volume: DEFAULT_PREFS.volume,
    muted: DEFAULT_PREFS.muted,
    lastGenre: null,
    lastStationByGenre: {},
  }
}
