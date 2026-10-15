// Clawd, the deck and the crate: Text only, three rows each, the same drawing
// in the band and in the pane header. Chrome uses the claude theme key. The
// eyes use the text key, the theme's foreground: it contrasts with the pane in
// both themes (black on light, white on dark). The genre tones are raw hex from
// the catalog.

import type { BoxProps, ElementConstructor, TextProps, ThemeKey } from 'claude-code'
import type { Player } from '../types'
import type { Disc, Pose } from './clawd-frames'
import { volumeCells } from './clawd-frames'

export type Table = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
}

// 'vol ██████░░░░ 60': filled cells in claude, empty ones in subtle; muted is
// an empty bar.
export function volumeBar(T: Table, player: Player) {
  const { Box, Text } = T
  const filled = volumeCells(player)
  return (
    <Box flexDirection="row">
      <Text dimColor>{'vol '}</Text>
      <Text color="claude">{'█'.repeat(filled)}</Text>
      <Text color="subtle">{'░'.repeat(10 - filled)}</Text>
      <Text>{` ${player.volume}`}</Text>
    </Box>
  )
}

// Clawd, the Claude Code mascot, drawn from half blocks (▀ ▄ █) on an 18 by 6
// pixel grid, so it is 18 cells wide and 3 rows tall and each pixel is square:
//
//   y0   ...XXXXXXXXXXXX...       head
//   y1   ...XX.XXXXXX.XX...       eyes are the two gaps (x5, x12)
//   y2   .XXXXXXXXXXXXXXXX.       arms out
//   y3   ...XXXXXXXXXXXX...       body
//   y4   ....X.X....X.X....       four legs, which step between frames A and B
//
// Half blocks, not quadrant glyphs: quadrants drew with gaps in the desktop app.
export const CLAWD_COLUMNS = 18

const EYE_X = [5, 12]
const LEG_X: Record<Pose['legs'], number[]> = { A: [4, 6, 11, 13], B: [5, 7, 10, 12] }

// Whether pixel (x, y) is clay. Open eyes are holes in y1; closed eyes fill them.
function clay(x: number, y: number, legs: Pose['legs'], eyesOpen: boolean): boolean {
  if (y === 0 || y === 3) return x >= 3 && x <= 14
  if (y === 1) return x >= 3 && x <= 14 && (!EYE_X.includes(x) || !eyesOpen)
  if (y === 2) return x >= 1 && x <= 16
  if (y === 4) return LEG_X[legs].includes(x)
  return false
}

const EYE_MARK: Partial<Record<Pose['eyes'], string>> = { squint: '^', blink: '-', asleep: '-', dead: '×' }

// One text row: two pixel rows per cell, as runs of the same glyph.
function clawdRow(T: Table, pose: Pose, row: number) {
  const { Box, Text } = T
  const eyesOpen = pose.eyes === 'open'
  const top = row * 2
  const out: ReturnType<typeof Text>[] = []
  let run = ''
  let glyph = ' '
  const flush = (key: string) => {
    if (run === '') return
    out.push(
      glyph === ' ' ? (
        <Text key={key}>{run}</Text>
      ) : (
        <Text key={key} color="claude">
          {run}
        </Text>
      ),
    )
    run = ''
  }
  for (let x = 0; x < CLAWD_COLUMNS; x++) {
    const mark = row === 0 && EYE_X.includes(x) ? EYE_MARK[pose.eyes] : undefined
    if (mark !== undefined) {
      flush(`r${x}`)
      out.push(
        <Text key={`m${x}`} backgroundColor="claude" color={pose.eyes === 'dead' ? 'error' : 'inverseText'} bold>
          {mark}
        </Text>,
      )
      glyph = ' '
      continue
    }
    const t = clay(x, top, pose.legs, eyesOpen)
    const b = clay(x, top + 1, pose.legs, eyesOpen)
    const g = t && b ? '█' : t ? '▀' : b ? '▄' : ' '
    if (g !== glyph) flush(`r${x}`)
    glyph = g
    run += g
  }
  flush('rend')
  return (
    <Box flexDirection="row" width={CLAWD_COLUMNS}>
      {out}
    </Box>
  )
}

export const EYE_COLOR: ThemeKey = 'inverseText'

export function clawdRows(T: Table, pose: Pose) {
  return [clawdRow(T, pose, 0), clawdRow(T, pose, 1), clawdRow(T, pose, 2)]
}

function discCell(T: Table, disc: Disc | null, width: number) {
  const { Box, Text } = T
  if (disc === null) {
    return (
      <Box width={width}>
        <Text>{' '.repeat(width)}</Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="row" width={width}>
      <Text>{'   '}</Text>
      <Text color={disc.tone} dimColor={disc.dim}>
        {disc.glyph}
      </Text>
      <Text>{'   '}</Text>
    </Box>
  )
}

// The deck, seven cells wide: the lifted record (or a z bubble) above the
// platter record, and the plinth below.
export function deckRows(T: Table, pose: Pose) {
  const { Box, Text } = T
  const top = pose.lift !== null ? discCell(T, pose.lift, 7) : pose.zzz !== null ? (
    <Box width={7}>
      <Text dimColor>{` ${pose.zzz}   `}</Text>
    </Box>
  ) : discCell(T, null, 7)
  const plinthColor = pose.plinth === 'error' ? 'error' : 'subtle'
  return [
    top,
    discCell(T, pose.disc, 7),
    <Box width={7}>
      <Text color={plinthColor} bold={pose.plinth === 'bold'}>
        {' ▔▔▔▔▔ '}
      </Text>
    </Box>,
  ]
}

// The crate, one cell wide, at the middle row; it takes the tone it reaches for.
export function crateColumn(T: Table, pose: Pose) {
  const { Box, Text } = T
  return (
    <Box flexDirection="column" width={1}>
      <Text>{' '}</Text>
      <Text color={pose.crateTone}>{'▤'}</Text>
      <Text>{' '}</Text>
    </Box>
  )
}

export function gapColumn(T: Table) {
  const { Box, Text } = T
  return (
    <Box flexDirection="column" width={1}>
      <Text>{' '}</Text>
      <Text>{' '}</Text>
      <Text>{' '}</Text>
    </Box>
  )
}
