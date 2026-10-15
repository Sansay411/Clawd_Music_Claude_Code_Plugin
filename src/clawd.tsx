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

// The eyes sit on the clay body (backgroundColor claude), so inverseText, dark
// on the dark theme, reads as two dark eyes on orange in both themes.
export const EYE_COLOR: ThemeKey = 'inverseText'

const EYES: Record<Pose['eyes'], string> = {
  open: '▪ ▪',
  squint: '^ ^',
  blink: '- -',
  asleep: '‿ ‿',
  dead: '× ×',
}

const LEGS: Record<Pose['legs'], string> = {
  A: '  ▘▘ ▝▘  ',
  B: '  ▝▘ ▘▝  ',
}

// Clawd, nine cells wide: head, eyes, body, legs.
export function clawdRows(T: Table, pose: Pose) {
  const { Box, Text } = T
  const isDead = pose.eyes === 'dead'
  return [
    <Box flexDirection="row" width={9}>
      <Text color="claude">{' ▐▛'}</Text>
      <Text color={isDead ? 'error' : EYE_COLOR} backgroundColor="claude" bold>
        {EYES[pose.eyes]}
      </Text>
      <Text color="claude">{'▜▌ '}</Text>
    </Box>,
    <Box width={9}>
      <Text color="claude">{'▝▜█████▛▘'}</Text>
    </Box>,
    <Box width={9}>
      <Text color="claude">{LEGS[pose.legs]}</Text>
    </Box>,
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
