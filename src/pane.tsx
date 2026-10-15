// The Claude Music pane: header (Clawd, deck, title, badge, volume, totals),
// genre sleeves, the stations of the current genre, transport, the mood input
// (not on mobile, which has no Input) and mood chips, then the notice line.
// It uses no Select, Svg, Raster, Image or Client, so every surface gets the
// same controls. The engine draws the pane's frame; the body is sized to
// bodyColumns, never to the viewport.

import type { ButtonProps, ElementConstructor, InputProps, RenderElement, RenderNode } from 'claude-code'
import { genreStations, toneOf } from './catalog'
import type { Table } from './clawd'
import { CLAWD_COLUMNS, clawdRows, gapColumn, volumeBar } from './clawd'
import { badgeOf, pauseWord, pose } from './clawd-frames'
import { actMood, press, quietly } from './controller'
import type { Io } from './io'
import { noticeColor, readSnapshot } from './state'
import type { Snapshot } from './state'

export type PaneTable = Table & { Button: ElementConstructor<ButtonProps> }
export type InputConstructor = ElementConstructor<InputProps>

const MOOD_PLACEHOLDER = 'mood, e.g. rainy focus'
const HINT = 'Press a genre, or type a mood. Esc closes; the music keeps playing.'
const STATION_CELLS = 40
const MIN_STATION_CELLS = 16

function truncate(text: string, cells: number): string {
  return text.length > cells ? `${text.slice(0, cells - 1)}…` : text
}

async function submitMood(io: Io, value: string): Promise<void> {
  try {
    await io.pane.update(s => ({ ...s, moodDraft: '' }))
    await actMood(io, value)
  } catch {
    // a failed mood pick leaves the notice as it was
  }
}

export async function paneTree(
  io: Io,
  T: PaneTable,
  input: InputConstructor | null,
  bodyColumns: number,
): Promise<RenderElement> {
  const snap = await readSnapshot(io)
  return buildPane(io, T, input, snap, bodyColumns)
}

function buildPane(
  io: Io,
  T: PaneTable,
  input: InputConstructor | null,
  snap: Snapshot,
  bodyColumns: number,
): RenderElement {
  const { Box, Text, Button } = T
  const { player, anim, catalog, session, pane } = snap
  const p = pose({
    player,
    anim,
    tick: anim.tick,
    glyphSet: session.glyphSet,
    toneOf: g => toneOf(catalog, g),
  })
  const badge = badgeOf(player, anim, anim.tick)
  const badgeColor =
    player.status === 'playing'
      ? 'success'
      : player.status === 'paused'
        ? 'warning'
        : player.status === 'error'
          ? 'error'
          : 'subtle'
  const stationCells = Math.max(MIN_STATION_CELLS, Math.min(STATION_CELLS, bodyColumns - 8))
  const stationName = player.station !== null ? player.station.name : 'pick a genre below'

  // Minimal header: Clawd, then three short lines.
  const headerText = (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="row">
        <Text bold color="claude">
          Claude Music
        </Text>
        <Text>{'  '}</Text>
        <Text color={badgeColor}>{`${badge.glyph} ${badge.word}`}</Text>
      </Box>
      <Text wrap="truncate-end">{stationName}</Text>
      {volumeBar(T, player)}
    </Box>
  )
  const header = (
    <Box flexDirection="row">
      <Box flexDirection="column" width={CLAWD_COLUMNS}>
        {clawdRows(T, p)}
      </Box>
      {gapColumn(T)}
      {headerText}
    </Box>
  )

  // The genre buttons are plain: a plain button draws its key before its label
  // (`1: lofi (2)`). A bracketed button does not show its hotkey in the terminal,
  // so a digit kept only as a hotkey would be invisible there. The label carries
  // no digit, so the key shows once. The tone dot is a Text beside the Button, not
  // inside it: a Button paints its own label style, which could override a child's
  // colour. The dot is filled for the genre that plays and hollow for the rest.
  const sleeves = catalog.genres.map((g, index) => (
    <Box key={`gs-${g.name}`} flexDirection="row">
      <Text color={g.tone} bold={player.genre === g.name}>
        {player.genre === g.name ? '● ' : '○ '}
      </Text>
      <Button
        key={`g-${g.name}`}
        plain
        hotkey={index < 8 ? String(index + 1) : undefined}
        label={`${g.name} (${g.stations.length})`}
        onPress={() => quietly(press(io, { type: 'playGenre', genre: g.name }))}
      />
    </Box>
  ))

  const stations = player.genre !== null ? genreStations(catalog, player.genre) : []
  const stationButtons = stations.map((station, index) => {
    const current = player.station !== null && player.station.key === station.key
    return (
      <Button
        key={`st-${index}`}
        plain
        label={truncate(`${current ? '▸' : ' '} ${station.name}`, stationCells)}
        onPress={() => quietly(press(io, { type: 'playStation', key: station.key }))}
      />
    )
  })
  const stationsLabel = player.genre !== null ? `stations · ${player.genre}` : 'stations'

  const ctl = (key: string, hotkey: string, label: string, action: Parameters<typeof press>[1]) => (
    <Button key={`c-${key}`} plain hotkey={hotkey} label={label} onPress={() => quietly(press(io, action))} />
  )
  const controls = (
    <Box flexDirection="row" flexWrap="wrap" gap={1}>
      {ctl('prev', 'b', 'prev', { type: 'prev' })}
      {ctl('pause', 'p', pauseWord(player), { type: 'toggle' })}
      {ctl('next', 'n', 'next', { type: 'next' })}
      {ctl('mute', 'm', player.muted ? 'unmute' : 'mute', { type: 'mute' })}
      {ctl('down', 'd', 'vol-', { type: 'volumeStep', delta: -10 })}
      {ctl('up', 'u', 'vol+', { type: 'volumeStep', delta: 10 })}
      {ctl('stop', 's', 'stop', { type: 'stop' })}
    </Box>
  )

  const children: RenderNode[] = [
    header,
    <Box flexDirection="row" flexWrap="wrap" gap={1}>
      {sleeves}
    </Box>,
    <Text dimColor>{stationsLabel}</Text>,
    <Box flexDirection="column">{stationButtons}</Box>,
    controls,
  ]
  if (input !== null) {
    children.push(
      input({
        key: 'mood',
        value: pane.moodDraft,
        placeholder: MOOD_PLACEHOLDER,
        onInput: (value: string) => quietly(io.pane.update(s => ({ ...s, moodDraft: value }))),
        onSubmit: (value: string) => quietly(submitMood(io, value)),
      }),
    )
  }
  // A catalog that did not parse is the notice until it is fixed. Orange only on a
  // surface that cannot play (see noticeColor); elsewhere the text keeps its colour.
  const notice = catalog.error !== null ? `config/sources.yml: ${catalog.error}` : pane.notice
  children.push(
    <Text color={noticeColor(session.surface, notice)} dimColor={notice === null}>
      {notice ?? HINT}
    </Text>,
  )
  return <Box flexDirection="column">{children}</Box>
}
