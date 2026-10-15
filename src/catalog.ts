// Pure helpers over the station catalog. Nothing here touches the engine:
// callers pass the catalog and any random numbers in. The catalog is read from
// config/sources.yml at session start (parseSources); the built-in copy in
// catalog-data.ts is used only when the file cannot be read.

import type { Catalog, CatalogGenre, CatalogStation, Station } from '../types'
import { CATALOG_DATA, FALLBACK_GENRES, GENRE_ALIASES } from './catalog-data'

export const UNKNOWN_TONE = 'subtle'

// A station is a YouTube page when its URL names youtube.com/watch, youtu.be/
// or youtube.com/live/. Everything else is a direct stream.
export function kindOf(url: string): 'direct' | 'youtube' {
  return /youtube\.com\/watch|youtu\.be\/|youtube\.com\/live\//i.test(url) ? 'youtube' : 'direct'
}

// The theme-free tone of a genre (raw hex), or subtle for a genre not in the
// palette. sources.yml has no tones; the palette lives with the built-in copy.
export function toneFor(genre: string): string {
  const found = CATALOG_DATA.find(g => g.name === genre)
  return found ? found.tone : UNKNOWN_TONE
}

export function initialCatalog(): Catalog {
  const genres: CatalogGenre[] = CATALOG_DATA.map(g => ({
    name: g.name,
    tone: g.tone,
    stations: g.stations.map(s => ({ name: s.name, url: s.url, kind: s.kind })),
  }))
  return { genres, error: null }
}

export type ParsedSources = { genres: CatalogGenre[]; error: string | null }

function unquote(value: string): string {
  const v = value.trim()
  if (v.length >= 2) {
    const first = v[0]
    const last = v[v.length - 1]
    if ((first === '"' || first === "'") && first === last) return v.slice(1, -1)
  }
  return v
}

// A station being read: its name and line, and its URL once a url line comes.
// Plain fields, so a station's URL is set on the one place that reads it.
type Draft = { hasName: boolean; name: string; line: number; url: string }

// Adds the station being read to its genre. It needs a URL; the reason is
// returned when it has none.
function addDraft(genre: CatalogGenre, draft: Draft): string | null {
  if (draft.url === '') return `line ${draft.line}: station "${draft.name}" has no url`
  const station: CatalogStation = { name: draft.name, url: draft.url, kind: kindOf(draft.url) }
  genre.stations.push(station)
  return null
}

// Reads config/sources.yml with a line parser, in the file's own shape:
//   genre:                     (indent 0)
//     stations:                (indent 2, ignored beyond its presence)
//       - name: ...            (indent 4 starts a station)
//         url: ...             (indent 6; description and tags are skipped)
// Lines starting with # and blank lines are skipped. A parse failure, or a file
// with no genres, returns an error and no genres: nothing plays from it.
export function parseSources(text: string): ParsedSources {
  const genres: CatalogGenre[] = []
  let genre: CatalogGenre | null = null
  let draft: Draft = { hasName: false, name: '', line: 0, url: '' }
  const lines = text.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? ''
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const n = i + 1
    const indent = raw.length - raw.trimStart().length

    if (indent === 0) {
      if (genre !== null && draft.hasName) {
        const why = addDraft(genre, draft)
        if (why !== null) return { genres: [], error: why }
      }
      draft = { hasName: false, name: '', line: 0, url: '' }
      const match = /^([A-Za-z][\w-]*):$/.exec(trimmed)
      if (match === null) return { genres: [], error: `line ${n}: expected a genre name ending in a colon` }
      const name = match[1] ?? ''
      genre = { name, tone: toneFor(name), stations: [] }
      genres.push(genre)
      continue
    }
    if (genre === null) return { genres: [], error: `line ${n}: a line before the first genre` }
    if (indent === 2) {
      if (trimmed !== 'stations:') return { genres: [], error: `line ${n}: expected "stations:"` }
      continue
    }
    if (indent === 4) {
      if (draft.hasName) {
        const why = addDraft(genre, draft)
        if (why !== null) return { genres: [], error: why }
      }
      const match = /^-\s+name:\s*(.*)$/.exec(trimmed)
      if (match === null) return { genres: [], error: `line ${n}: expected "- name:"` }
      draft = { hasName: true, name: unquote(match[1] ?? ''), line: n, url: '' }
      continue
    }
    if (indent >= 6) {
      if (!draft.hasName) return { genres: [], error: `line ${n}: a field outside a station` }
      const match = /^([a-z_]+):\s*(.*)$/.exec(trimmed)
      if (match === null) return { genres: [], error: `line ${n}: expected "key: value"` }
      if (match[1] === 'url') draft.url = unquote(match[2] ?? '')
      continue
    }
    return { genres: [], error: `line ${n}: unexpected indentation` }
  }
  if (genre !== null && draft.hasName) {
    const why = addDraft(genre, draft)
    if (why !== null) return { genres: [], error: why }
  }
  if (genres.length === 0) return { genres: [], error: 'no genres found' }
  return { genres, error: null }
}

export function stationKey(genre: string, index: number): string {
  return `${genre}/${index}`
}

// The playable stations of one genre, keys and genre filled in.
export function genreStations(catalog: Catalog, genre: string): Station[] {
  const found = catalog.genres.find(g => g.name === genre)
  if (!found) return []
  return found.stations.map((s, index) => ({
    key: stationKey(found.name, index),
    name: s.name,
    url: s.url,
    kind: s.kind,
    genre: found.name,
  }))
}

export function allStations(catalog: Catalog): Station[] {
  return catalog.genres.flatMap(g => genreStations(catalog, g.name))
}

export function stationByKey(catalog: Catalog, key: string): Station | null {
  return allStations(catalog).find(s => s.key === key) ?? null
}

export function toneOf(catalog: Catalog, genre: string | null): string {
  if (genre === null) return UNKNOWN_TONE
  const found = catalog.genres.find(g => g.name === genre)
  return found ? found.tone : UNKNOWN_TONE
}

export function fallbackStation(genre: string): Station | null {
  if (!FALLBACK_GENRES.includes(genre)) return null
  return {
    key: `${genre}/fallback`,
    name: `${genre} loop`,
    url: `assets/${genre}_fallback.mp3`,
    kind: 'file',
    genre,
  }
}

export function resolveAlias(word: string): string {
  const lower = word.trim().toLowerCase()
  return GENRE_ALIASES[lower] ?? lower
}

// Genre match first (case-insensitive, aliases applied).
export function findGenre(catalog: Catalog, query: string): string | null {
  const wanted = resolveAlias(query)
  if (!wanted) return null
  const found = catalog.genres.find(g => g.name === wanted)
  return found ? found.name : null
}

// Station match, ranked: exact name, then name ending with the query, then a
// substring; ties keep the catalog (YAML) order. Case-insensitive.
export function findStation(catalog: Catalog, query: string): Station | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  let best: { rank: number; station: Station } | null = null
  for (const station of allStations(catalog)) {
    const name = station.name.toLowerCase()
    let rank = -1
    if (name === q) rank = 0
    else if (name.endsWith(q)) rank = 1
    else if (name.includes(q)) rank = 2
    if (rank < 0) continue
    if (best === null || rank < best.rank) best = { rank, station }
  }
  return best ? best.station : null
}

function indexFor(rand: number, length: number): number {
  const i = Math.floor(rand * length)
  return Math.min(Math.max(i, 0), length - 1)
}

// A random station of one genre. Stations in `bad` (keys) are skipped, a
// YouTube station is skipped when yt-dlp is known to be missing, and
// `exclude` (the current station) is avoided unless it is the only one.
export function pickStation(
  catalog: Catalog,
  genre: string,
  options: { exclude: string | null; bad: readonly string[]; ytdlpOk: boolean | null; rand: number },
): Station | null {
  const usable = genreStations(catalog, genre).filter(
    s => (s.kind !== 'youtube' || options.ytdlpOk !== false) && !options.bad.includes(s.key),
  )
  const others = usable.filter(s => s.key !== options.exclude)
  if (others.length > 0) return others[indexFor(options.rand, others.length)] ?? null
  const same = usable.filter(s => s.key === options.exclude)
  if (same.length > 0) return same[0] ?? null
  return null
}

// A genre drawn uniformly from the catalog (shuffle).
export function pickUniformGenre(catalog: Catalog, rand: number): string | null {
  if (catalog.genres.length === 0) return null
  return catalog.genres[indexFor(rand, catalog.genres.length)]?.name ?? null
}

// A genre weighted by its station count, never the last one unless it is the
// only genre (vibe).
export function pickVibeGenre(catalog: Catalog, lastGenre: string | null, rand: number): string | null {
  let pool = catalog.genres.filter(g => g.stations.length > 0 && g.name !== lastGenre)
  if (pool.length === 0) pool = catalog.genres.filter(g => g.stations.length > 0)
  const total = pool.reduce((sum, g) => sum + g.stations.length, 0)
  if (total === 0) return null
  let target = rand * total
  for (const g of pool) {
    target -= g.stations.length
    if (target < 0) return g.name
  }
  return pool[pool.length - 1]?.name ?? null
}
