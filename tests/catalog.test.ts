// The station catalog: genres and their stations, the YouTube rule, the ranked
// station search, and the picks that never repeat the last genre.

import { expect, test } from 'claude-code/testing'
import {
  allStations,
  fallbackStation,
  findGenre,
  findStation,
  initialCatalog,
  kindOf,
  parseSources,
  pickStation,
  pickUniformGenre,
  pickVibeGenre,
  stationByKey,
  toneOf,
} from '../src/catalog'
import { CATALOG_DATA } from '../src/catalog-data'
import { SOURCES_TEXT } from './sources-fixture'

const catalog = initialCatalog()

test('the catalog has the eight genres in file order, with their tones', async () => {
  expect(catalog.genres.map(g => g.name)).toEqual([
    'lofi',
    'jazz',
    'classical',
    'ambient',
    'electronic',
    'synthwave',
    'lounge',
    'indie',
  ])
  expect(toneOf(catalog, 'lofi')).toBe('#C9899B')
  expect(toneOf(catalog, 'indie')).toBe('#8DB05A')
  expect(toneOf(catalog, 'unknown-genre')).toBe('subtle')
  expect(catalog.error).toBeNull()
})

test('the catalog holds 31 stations: 25 direct streams and 6 YouTube pages', async () => {
  const all = allStations(catalog)
  expect(all.length).toBe(31)
  expect(all.filter(s => s.kind === 'youtube').length).toBe(6)
  expect(all.filter(s => s.kind === 'direct').length).toBe(25)
})

test('every station kind matches the URL rule', async () => {
  for (const station of allStations(catalog)) {
    expect(kindOf(station.url)).toBe(station.kind)
  }
})

test('kindOf: watch, youtu.be and live pages are YouTube; other URLs are direct', async () => {
  expect(kindOf('https://www.youtube.com/watch?v=abc')).toBe('youtube')
  expect(kindOf('https://youtu.be/abc')).toBe('youtube')
  expect(kindOf('https://www.youtube.com/live/abc')).toBe('youtube')
  expect(kindOf('http://ice2.somafm.com/groovesalad-128-mp3')).toBe('direct')
})

test('station keys are genre slash index, and lookup by key works', async () => {
  const first = stationByKey(catalog, 'lofi/0')
  expect(first?.name).toBe('Lofi Girl')
  expect(first?.genre).toBe('lofi')
  expect(stationByKey(catalog, 'lofi/9')).toBeNull()
})

test('a genre match wins, with the edm alias for electronic', async () => {
  expect(findGenre(catalog, 'LoFi')).toBe('lofi')
  expect(findGenre(catalog, 'edm')).toBe('electronic')
  expect(findGenre(catalog, 'polka')).toBeNull()
})

test('a station search ranks exact, then ending, then substring, in file order', async () => {
  expect(findStation(catalog, 'lofi girl')?.name).toBe('Lofi Girl')
  // "groove salad" ends the ambient station's name; the Classic one does not end with it.
  expect(findStation(catalog, 'groove salad')?.name).toBe('SomaFM - Groove Salad')
  // A substring shared by many stations gives the first one in file order.
  expect(findStation(catalog, 'soma')?.name).toBe('SomaFM - Fluid')
  expect(findStation(catalog, 'no such station')).toBeNull()
})

test('pickStation skips bad stations and YouTube when yt-dlp is missing', async () => {
  const picked = pickStation(catalog, 'lofi', { exclude: null, bad: [], ytdlpOk: false, rand: 0 })
  expect(picked).toBeNull()
  const skipBad = pickStation(catalog, 'jazz', { exclude: null, bad: ['jazz/0'], ytdlpOk: true, rand: 0 })
  expect(skipBad?.key).toBe('jazz/1')
})

test('pickStation avoids the excluded station unless it is the only one', async () => {
  const other = pickStation(catalog, 'jazz', { exclude: 'jazz/0', bad: [], ytdlpOk: true, rand: 0 })
  expect(other?.key).toBe('jazz/1')
  const onlyOne = pickStation(catalog, 'synthwave', {
    exclude: 'synthwave/0',
    bad: ['synthwave/1', 'synthwave/2'],
    ytdlpOk: true,
    rand: 0,
  })
  expect(onlyOne?.key).toBe('synthwave/0')
})

test('the vibe pick never repeats the last genre, and is weighted by station count', async () => {
  for (const rand of [0, 0.3, 0.6, 0.99]) {
    expect(pickVibeGenre(catalog, 'electronic', rand)).not.toBe('electronic')
  }
  // Weights: lofi 2, jazz 4, classical 3, ambient 7, electronic 6, synthwave 3, lounge 2, indie 4 (31 total).
  expect(pickVibeGenre(catalog, null, 0)).toBe('lofi')
  expect(pickVibeGenre(catalog, null, 0.99)).toBe('indie')
})

test('a uniform genre pick covers the whole list', async () => {
  expect(pickUniformGenre(catalog, 0)).toBe('lofi')
  expect(pickUniformGenre(catalog, 0.999)).toBe('indie')
})

test('no local loops ship with the repo, so no genre has a file fallback', async () => {
  expect(fallbackStation('lofi')).toBeNull()
  expect(fallbackStation('synthwave')).toBeNull()
})

// The file's text (a copy kept in tests/sources-fixture.ts) must parse to the
// built-in copy, genre for genre and station for station.
test('config/sources.yml parses to the built-in catalog, genre for genre and station for station', async () => {
  const parsed = parseSources(SOURCES_TEXT)
  expect(parsed.error).toBeNull()
  expect(parsed.genres.map(g => g.name)).toEqual(CATALOG_DATA.map(g => g.name))
  for (let i = 0; i < CATALOG_DATA.length; i++) {
    const want = CATALOG_DATA[i]
    const got = parsed.genres[i]
    expect(got?.tone).toBe(want?.tone)
    expect(got?.stations).toEqual(want?.stations ?? [])
  }
  expect(parsed.genres.flatMap(g => g.stations).length).toBe(31)
})

test('a parsed file skips commented stations and keeps the file order', async () => {
  const names = parseSources(SOURCES_TEXT).genres.flatMap(g => g.stations.map(s => s.name))
  expect(names.includes('SomaFM - Vaporwaves')).toBe(false)
  expect(names.indexOf('Lofi Girl')).toBe(0)
  expect(names.indexOf('SomaFM - Groove Salad')).toBeLessThan(names.indexOf('Nightwave Plaza'))
})

test('a station with no url is a parse error, and no genre loads from the file', async () => {
  const parsed = parseSources('lofi:\n  stations:\n    - name: Nothing\n    - name: Other\n      url: http://x.example/a\n')
  expect(parsed.genres).toEqual([])
  expect(parsed.error).toBe('line 3: station "Nothing" has no url')
})

test('a line at an indent the file does not use is an error with its line number', async () => {
  const parsed = parseSources('lofi:\n  stations:\n     - name: X\n')
  expect(parsed.genres).toEqual([])
  expect(parsed.error).toBe('line 3: unexpected indentation')
})

test('a file with no genres is an error, not an empty catalog', async () => {
  expect(parseSources('# only a comment\n\n').error).toBe('no genres found')
  expect(parseSources('').genres).toEqual([])
})

test('quotes come off names and urls, a youtu.be page is youtube, an unknown genre is subtle', async () => {
  const parsed = parseSources('edm:\n  stations:\n    - name: "Live Page"\n      url: \'https://youtu.be/abc\'\n      description: a: b\n')
  expect(parsed.error).toBeNull()
  expect(parsed.genres).toEqual([
    {
      name: 'edm',
      tone: 'subtle',
      stations: [{ name: 'Live Page', url: 'https://youtu.be/abc', kind: 'youtube' }],
    },
  ])
})

test('text before the first genre is an error', async () => {
  expect(parseSources('  stations:\n').error).toBe('line 1: a line before the first genre')
})
