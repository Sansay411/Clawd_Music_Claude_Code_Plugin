// Prefs: a damaged or partial store value falls back field by field, and the
// reset keeps the totals and the tool paths.

import { expect, test } from 'claude-code/testing'
import { DEFAULT_PREFS, mergePrefs, resetPrefs } from '../src/prefs'

test('an empty store gives the defaults', async () => {
  expect(mergePrefs(undefined)).toEqual(DEFAULT_PREFS)
  expect(mergePrefs('garbage')).toEqual(DEFAULT_PREFS)
})

test('a partly damaged store keeps the good fields and defaults the rest', async () => {
  const merged = mergePrefs({
    volume: 250,
    muted: 'yes',
    lastGenre: 'jazz',
    lastStationByGenre: { jazz: 'jazz/1', lofi: 7 },
    glyphSet: 'ascii',
    totals: { sessions: 3.7, minutes: 12.5 },
  })
  expect(merged.volume).toBe(100)
  expect(merged.muted).toBe(false)
  expect(merged.lastGenre).toBe('jazz')
  expect(merged.lastStationByGenre).toEqual({ jazz: 'jazz/1' })
  expect(merged.glyphSet).toBe('ascii')
  expect(merged.totals).toEqual({ sessions: 3, minutes: 12.5 })
})

test('reset puts volume, mute and the last station back, and keeps totals and paths', async () => {
  const previous = {
    ...DEFAULT_PREFS,
    volume: 80,
    muted: true,
    lastGenre: 'indie',
    lastStationByGenre: { indie: 'indie/2' },
    ffplayPath: 'C:/ffplay.exe',
    totals: { sessions: 4, minutes: 90 },
  }
  const reset = resetPrefs(previous)
  expect(reset.volume).toBe(30)
  expect(reset.muted).toBe(false)
  expect(reset.lastGenre).toBeNull()
  expect(reset.lastStationByGenre).toEqual({})
  expect(reset.ffplayPath).toBe('C:/ffplay.exe')
  expect(reset.totals).toEqual({ sessions: 4, minutes: 90 })
})
