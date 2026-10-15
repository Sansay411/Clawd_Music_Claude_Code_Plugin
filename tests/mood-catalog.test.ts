// A mood picks only genres the catalog still lists: a genre removed from the
// config is never named, and the caller falls back to a vibe.

import { expect, test } from 'claude-code/testing'
import { pickMoodGenre } from '../src/moods'

test('with the catalog names, a mood never picks a genre the config dropped', () => {
  expect(pickMoodGenre('focus', null, 0, ['jazz', 'ambient']).genre).not.toBe('lofi')
  expect(pickMoodGenre('focus', null, 0, ['lofi', 'jazz']).genre).toBe('lofi')
  expect(pickMoodGenre('xyzzy', null, 0, ['lofi'])).toEqual({ genre: null, matched: false })
})
