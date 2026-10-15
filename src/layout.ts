// The band's width plan, pure. The band is Clawd (18 cells and a gap), then an
// optional deck (7 cells, a gap, the crate, a gap), then the text column. Its
// buttons are plain (`b: prev`), so each one's width is known up front.
//
// Widths: below 44 the band keeps pause only; 44 to 53 shows three buttons, 54 to
// 69 four, from 70 six; from 80 the deck is drawn too.

export type ButtonSet = 'pause' | 'three' | 'four' | 'six'

export type BandPlan = {
  showDeck: boolean
  buttons: ButtonSet
  // Cells left for the text column, after Clawd, the deck and the gaps.
  textColumns: number
}

// Cells each plain button takes in its widest state: `hotkey: label`.
export const PLAIN_CELLS = {
  prev: 'b: prev'.length,
  pause: 'p: resume'.length,
  next: 'n: next'.length,
  mute: 'm: unmute'.length,
  down: 'd: vol-'.length,
  up: 'u: vol+'.length,
} as const

export const BUTTON_GAP = 1
export const ART_COLUMNS = 19 // Clawd (18) and one gap
export const DECK_COLUMNS = 10 // deck (7), gap, crate (1), gap
export const DECK_FROM = 80
export const PAUSE_ONLY_BELOW = 44

export function setCells(set: ButtonSet): number {
  const names: Array<keyof typeof PLAIN_CELLS> =
    set === 'pause'
      ? ['pause']
      : set === 'three'
        ? ['prev', 'pause', 'next']
        : set === 'four'
          ? ['prev', 'pause', 'next', 'mute']
          : ['prev', 'pause', 'next', 'mute', 'down', 'up']
  const cells = names.reduce((sum, name) => sum + PLAIN_CELLS[name], 0)
  return cells + BUTTON_GAP * (names.length - 1)
}

export function bandPlan(width: number): BandPlan {
  const buttons: ButtonSet = width < PAUSE_ONLY_BELOW ? 'pause' : width < 54 ? 'three' : width < 70 ? 'four' : 'six'
  const showDeck = width >= DECK_FROM
  const textColumns = Math.max(0, width - ART_COLUMNS - (showDeck ? DECK_COLUMNS : 0))
  return { showDeck, buttons, textColumns }
}
