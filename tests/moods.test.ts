// Mood keywords: which genre a text scores, the tie rule, and no-match.

import { expect, test } from 'claude-code/testing'
import { pickMoodGenre, scoreMood } from '../src/moods'

test('a focus word scores lofi on top', async () => {
  const scores = scoreMood('focus')
  expect(scores.lofi).toBe(3)
  expect(scores.ambient).toBe(2)
  expect(pickMoodGenre('focus', null, 0)).toEqual({ genre: 'lofi', matched: true })
})

test('two moods add their weights together', async () => {
  // focus (lofi 3) and rain (lofi 2) add up on lofi.
  expect(scoreMood('rainy focus').lofi).toBe(5)
  expect(pickMoodGenre('rainy focus', null, 0.5).genre).toBe('lofi')
})

test('Russian words match too: сон points at ambient', async () => {
  expect(pickMoodGenre('сон', null, 0)).toEqual({ genre: 'ambient', matched: true })
})

test('the chip words each have a genre', async () => {
  expect(pickMoodGenre('chill', null, 0).genre).toBe('ambient')
  expect(pickMoodGenre('late', null, 0).genre).toBe('synthwave')
  expect(pickMoodGenre('energy', null, 0).genre).toBe('electronic')
})

test('a tie is picked at random, and the last genre is avoided when another tie exists', async () => {
  // piano scores classical 3, jazz scores 3 as well.
  expect(scoreMood('piano jazz').classical).toBe(3)
  expect(scoreMood('piano jazz').jazz).toBe(3)
  expect(pickMoodGenre('piano jazz', 'classical', 0).genre).toBe('jazz')
  expect(pickMoodGenre('piano jazz', null, 0).genre).toBe('classical')
})

test('no keyword gives no genre, so the caller picks a vibe', async () => {
  expect(pickMoodGenre('xyzzy', null, 0)).toEqual({ genre: null, matched: false })
  expect(pickMoodGenre('   ', null, 0.9)).toEqual({ genre: null, matched: false })
})
