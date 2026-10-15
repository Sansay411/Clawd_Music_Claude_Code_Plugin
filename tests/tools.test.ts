// The host-tool rules: where.exe output, taskkill's exit codes, a yt-dlp
// start failure against a timeout, and the minutes a child ran.

import { expect, test } from 'claude-code/testing'
import { isStartFailure, killSucceeded, minutesBetween, parseWhereOutput } from '../src/tools'

test('where output: the first line is the path only when it is an absolute .exe', async () => {
  expect(parseWhereOutput('C:\\Program Files\\ffmpeg\\bin\\ffplay.exe\r\nD:\\other\\ffplay.exe\r\n')).toBe(
    'C:\\Program Files\\ffmpeg\\bin\\ffplay.exe',
  )
  expect(parseWhereOutput('ffplay.exe\r\n')).toBeNull()
  expect(parseWhereOutput('C:\\tools\\ffplay.bat\r\n')).toBeNull()
  expect(parseWhereOutput('')).toBeNull()
  expect(parseWhereOutput('\r\n  \r\n')).toBeNull()
})

test('taskkill: 0 and 128 both mean no ffplay is left running; any other code is a failure', async () => {
  expect(killSucceeded(0)).toBe(true)
  expect(killSucceeded(128)).toBe(true)
  expect(killSucceeded(1)).toBe(false)
  expect(killSucceeded(-1)).toBe(false)
})

test('a yt-dlp rejection is a start failure only when it came well inside the timeout', async () => {
  expect(isStartFailure(120, 25000)).toBe(true)
  expect(isStartFailure(23900, 25000)).toBe(true)
  expect(isStartFailure(24500, 25000)).toBe(false)
  expect(isStartFailure(25000, 25000)).toBe(false)
})

test('minutes: a child counts from its start to now; a zero start or a backwards clock counts nothing', async () => {
  expect(minutesBetween(1000, 1000 + 90000)).toBe(1.5)
  expect(minutesBetween(0, 90000)).toBe(0)
  expect(minutesBetween(5000, 4000)).toBe(0)
  expect(minutesBetween(5000, 5000)).toBe(0)
})
