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

// Clawd is drawn as pixels, not font glyphs: every pixel is a cell with a
// background colour, so the shape is the same in every font and surface (block
// glyphs drew with gaps and bumps in the desktop app). Nine cells wide, three rows:
//   .XEXXXEX.   head with two eyes
//   XXXXXXXXX   body with the arms out
//   .X.X.X.X.   four legs, which step between frames A and B
const BODY: Record<'head' | 'body', string> = { head: '.XEXXXEX.', body: 'XXXXXXXXX' }
const LEGS: Record<Pose['legs'], string> = { A: '.X.X.X.X.', B: '..X.X.X..' }

// The eye as one cell on the clay body: dark when open, a mark when not. inverseText
// is dark on the dark theme, so it reads as an eye on orange in both themes.
const EYE_MARK: Record<Pose['eyes'], string> = { open: ' ', squint: '^', blink: '-', asleep: '-', dead: '×' }

function pixelRow(T: Table, pattern: string, eyes: Pose['eyes']) {
  const { Box, Text } = T
  const cells: ReturnType<typeof Text>[] = []
  let i = 0
  while (i < pattern.length) {
    const kind = pattern[i]
    let j = i
    while (j < pattern.length && pattern[j] === kind) j++
    const n = j - i
    if (kind === '.') {
      cells.push(<Text key={`s${i}`}>{' '.repeat(n)}</Text>)
    } else if (kind === 'E') {
      const open = eyes === 'open'
      cells.push(
        <Text
          key={`e${i}`}
          backgroundColor={open ? 'inverseText' : 'claude'}
          color={eyes === 'dead' ? 'error' : 'inverseText'}
          bold
        >
          {EYE_MARK[eyes]}
        </Text>,
      )
    } else {
      cells.push(
        <Text key={`b${i}`} backgroundColor="claude">
          {' '.repeat(n)}
        </Text>,
      )
    }
    i = j
  }
  return (
    <Box flexDirection="row" width={9}>
      {cells}
    </Box>
  )
}

export const EYE_COLOR: ThemeKey = 'inverseText'

// Clawd, nine cells wide: head with eyes, body with arms, legs.
export function clawdRows(T: Table, pose: Pose) {
  return [
    pixelRow(T, BODY.head, pose.eyes),
    pixelRow(T, BODY.body, pose.eyes),
    pixelRow(T, LEGS[pose.legs], pose.eyes),
  ]
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
