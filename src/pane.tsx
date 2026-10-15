// The Claude Music pane: header (Clawd, deck, title, badge, volume, totals),
// genre sleeves, the stations of the current genre, transport, the mood input
// (not on mobile, which has no Input) and mood chips, then the notice line.
// It uses no Select, Svg, Raster, Image or Client, so every surface gets the
// same controls. The engine draws the pane's frame; the body is sized to
// bodyColumns, never to the viewport.

import type { ButtonProps, ElementConstructor, InputProps, RenderElement, RenderNode } from 'claude-code'
import { genreStations, toneOf } from './catalog'
import type { Table } from './clawd'
import { clawdRows, deckRows, gapColumn, volumeBar } from './clawd'
import { badgeOf, pauseLabel, pose } from './clawd-frames'
import { actMood, press, quietly } from './controller'
import type { Io } from './io'
import { noticeColor, readSnapshot } from './state'
import type { Snapshot } from './state'

export type PaneTable = Table & { Button: ElementConstructor<ButtonProps> }
export type InputConstructor = ElementConstructor<InputProps>

const MOOD_PLACEHOLDER = 'mood, e.g. rainy focus'
const HINT =
  'Pause and volume restart the stream: live radio has no position. Pick a genre or a station, or type a mood.'
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
  const sessionLine = `session ${Math.round(session.sessionMinutes)} min`
  const totalLine = `total ${Math.round(session.totalMinutes)} min · ${session.totalSessions} sessions`
  const stationCells = Math.max(MIN_STATION_CELLS, Math.min(STATION_CELLS, bodyColumns - 8))

  const headerText = (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="row">
        <Text bold color="claude">
          Claude Music
        </Text>
        <Text>{'  '}</Text>
        <Text color={badgeColor}>{`${badge.glyph} ${badge.word}`}</Text>
      </Box>
      {volumeBar(T, player)}
      <Text dimColor>{sessionLine}</Text>
      <Text dimColor>{totalLine}</Text>
    </Box>
  )
  const header = (
    <Box flexDirection="row">
      <Box flexDirection="column" width={9}>
        {clawdRows(T, p)}
      </Box>
      {gapColumn(T)}
      <Box flexDirection="column" width={7}>
        {deckRows(T, p)}
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
  const stationButtons = stations.map((station, index) => (
    <Button
      key={`st-${index}`}
      label={truncate(`${index + 1}. ${station.name}`, stationCells)}
      variant={player.station !== null && player.station.key === station.key ? 'primary' : undefined}
      onPress={() => quietly(press(io, { type: 'playStation', key: station.key }))}
    />
  ))
  const stationsLabel = player.genre !== null ? `stations · ${player.genre}` : 'stations · press a genre above'

  const controls = (
    <Box flexDirection="row" flexWrap="wrap" gap={1}>
      <Button key="c-prev" hotkey="b" label="prev b" onPress={() => quietly(press(io, { type: 'prev' }))} />
      <Button
        key="c-pause"
        hotkey="p"
        variant="primary"
        label={pauseLabel(player)}
        onPress={() => quietly(press(io, { type: 'toggle' }))}
      />
      <Button key="c-next" hotkey="n" label="next n" onPress={() => quietly(press(io, { type: 'next' }))} />
      <Button
        key="c-mute"
        hotkey="m"
        label={player.muted ? 'unmute m' : 'mute m'}
        onPress={() => quietly(press(io, { type: 'mute' }))}
      />
      <Button
        key="c-down"
        hotkey="d"
        label="vol- d"
        onPress={() => quietly(press(io, { type: 'volumeStep', delta: -10 }))}
      />
      <Button
        key="c-up"
        hotkey="u"
        label="vol+ u"
        onPress={() => quietly(press(io, { type: 'volumeStep', delta: 10 }))}
      />
      <Button key="c-stop" hotkey="s" label="stop s" onPress={() => quietly(press(io, { type: 'stop' }))} />
    </Box>
  )

  const chip = (hotkey: string, word: string, label: string) => (
    <Button key={`chip-${hotkey}`} hotkey={hotkey} label={label} onPress={() => quietly(actMood(io, word))} />
  )
  const chips = (
    <Box flexDirection="row" flexWrap="wrap" gap={1}>
      {chip('f', 'focus', 'f focus')}
      {chip('c', 'chill', 'c chill')}
      {chip('l', 'late', 'l late')}
      {chip('e', 'energy', 'e energy')}
    </Box>
  )

  const children: RenderNode[] = [
    header,
    <Text dimColor>genres</Text>,
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
        submitLabel: 'go',
        onInput: (value: string) => quietly(io.pane.update(s => ({ ...s, moodDraft: value }))),
        onSubmit: (value: string) => quietly(submitMood(io, value)),
      }),
    )
  }
  children.push(chips)
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
