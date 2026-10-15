// The notice line's colour: orange only on a surface that cannot play. Pure, with
// no engine: the words come from noPlayText, the colour from noticeColor.

import { expect, test } from 'claude-code/testing'
import { noPlayText, noticeColor } from '../src/state'

test('a notice on mobile, where nothing plays, is orange', () => {
  expect(noticeColor('mobile', noPlayText({ canPlay: false, surface: 'mobile' }))).toBe('warning')
  expect(noticeColor('mobile', 'config/sources.yml: bad line')).toBe('warning')
})

test('a notice on a surface that plays keeps the text colour', () => {
  expect(noticeColor('terminal', noPlayText({ canPlay: false, surface: 'terminal' }))).toBe(undefined)
  expect(noticeColor('desktop', 'Could not stop ffplay yet; retrying.')).toBe(undefined)
  expect(noticeColor('vscode', 'ffplay did not stop; press p to try again.')).toBe(undefined)
  expect(noticeColor('terminal', noPlayText({ canPlay: undefined, surface: 'terminal' }))).toBe(undefined)
})

test('no notice has no colour, on any surface', () => {
  expect(noticeColor('mobile', null)).toBe(undefined)
  expect(noticeColor('terminal', null)).toBe(undefined)
})
