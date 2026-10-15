// The band: Clawd on a deck above the prompt, three rows. Returns null when
// the prompt should stay clean (the player never played this session and the
// catalog loaded). Its buttons are plain (`b: prev`), which keeps the three
// rows within the width the layout plan (layout.ts) allows.

import type { ButtonProps, ElementConstructor, RenderElement, RenderInput } from 'claude-code'
import { toneOf } from './catalog'
import type { Table } from './clawd'
import { CLAWD_COLUMNS, clawdRows, crateColumn, deckRows, gapColumn, volumeBar } from './clawd'
import { pauseLabel, pauseWord, pose, statusWord } from './clawd-frames'
import { press, quietly } from './controller'
import type { Io } from './io'
import type { ButtonSet } from './layout'
import { bandPlan } from './layout'
import { readSnapshot } from './state'

export type BandTable = Table & { Button: ElementConstructor<ButtonProps> }

export async function bandTree(
  io: Io,
  T: BandTable,
  e: RenderInput<'AbovePrompt'>,
): Promise<RenderElement | null> {
  const snap = await readSnapshot(io)
  const { player, anim, session, catalog } = snap
  if (player.status === 'stopped' && player.station === null && catalog.error === null) return null

  const { Box, Text, Button } = T
  const width = e.props.bodyColumns
  const rows = e.props.maxRows
  const name = player.station !== null ? player.station.name : catalog.error !== null ? 'Claude Music' : 'no station'
  const genre = player.genre ?? ''

  if (rows < 3) {
    return (
      <Box flexDirection="row" gap={1}>
        <Text bold wrap="truncate-end">
          {name}
        </Text>
        <Button
          key="bp-pause"
          hotkey="p"
          variant="primary"
          label={pauseLabel(player)}
          onPress={() => quietly(press(io, { type: 'toggle' }))}
        />
      </Box>
    )
  }

  const plan = bandPlan(width)
  const p = pose({
    player,
    anim,
    tick: anim.tick,
    glyphSet: session.glyphSet,
    toneOf: g => toneOf(catalog, g),
  })

  const parts: RenderElement[] = []
  parts.push(
    <Box flexDirection="column" width={CLAWD_COLUMNS}>
      {clawdRows(T, p)}
    </Box>,
  )
  parts.push(gapColumn(T))
  if (plan.showDeck) {
    parts.push(
      <Box flexDirection="column" width={7}>
        {deckRows(T, p)}
      </Box>,
    )
    parts.push(gapColumn(T))
    parts.push(crateColumn(T, p))
    parts.push(gapColumn(T))
  }

  const titleRow = (
    <Box flexDirection="row">
      <Box flexShrink={1}>
        <Text bold wrap="truncate-end">
          {name}
        </Text>
      </Box>
      <Text dimColor>{genre !== '' ? ` · ${genre}` : ''}</Text>
    </Box>
  )

  // With no station and a catalog error, the error is the status.
  const isError = player.status === 'error' || (catalog.error !== null && player.station === null)
  const statusText =
    catalog.error !== null && player.station === null
      ? `sources: ${catalog.error}`
      : statusWord(player, anim, anim.tick)
  const meterRow = (
    <Box flexDirection="row">
      <Box flexShrink={1}>
        <Text color={isError ? 'error' : undefined} wrap="truncate-end">
          {statusText}
        </Text>
      </Box>
      <Text>{'  '}</Text>
      {volumeBar(T, player)}
    </Box>
  )

  const prev = <Button key="bp-prev" hotkey="b" plain label="prev" onPress={() => quietly(press(io, { type: 'prev' }))} />
  const pauseButton = (
    <Button
      key="bp-pause"
      hotkey="p"
      plain
      variant="primary"
      label={pauseWord(player)}
      onPress={() => quietly(press(io, { type: 'toggle' }))}
    />
  )
  const next = <Button key="bp-next" hotkey="n" plain label="next" onPress={() => quietly(press(io, { type: 'next' }))} />
  const mute = (
    <Button
      key="bp-mute"
      hotkey="m"
      plain
      label={player.muted ? 'unmute' : 'mute'}
      onPress={() => quietly(press(io, { type: 'mute' }))}
    />
  )
  const down = (
    <Button
      key="bp-down"
      hotkey="d"
      plain
      label="vol-"
      onPress={() => quietly(press(io, { type: 'volumeStep', delta: -10 }))}
    />
  )
  const up = (
    <Button
      key="bp-up"
      hotkey="u"
      plain
      label="vol+"
      onPress={() => quietly(press(io, { type: 'volumeStep', delta: 10 }))}
    />
  )
  const buttons: Record<ButtonSet, RenderElement[]> = {
    pause: [pauseButton],
    three: [prev, pauseButton, next],
    four: [prev, pauseButton, next, mute],
    six: [prev, pauseButton, next, mute, down, up],
  }

  const buttonRow = (
    <Box flexDirection="row" gap={1}>
      {buttons[plan.buttons]}
    </Box>
  )

  parts.push(
    <Box flexDirection="column" flexGrow={1}>
      {titleRow}
      {meterRow}
      {buttonRow}
    </Box>,
  )

  return <Box flexDirection="row">{parts}</Box>
}
