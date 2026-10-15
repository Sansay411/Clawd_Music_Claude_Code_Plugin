// The band's width plan, pure. The band is Clawd (9 cells and a gap), then an
// optional deck (7 cells, a gap, the crate, a gap), then the text column. Its
// buttons are plain (`b: prev`), so each one's width is known up front.
//
// Widths: below 40 the band keeps pause only and drops the deck, as the brief
// says. From 40 to 44 the deck is dropped too: three plain buttons do not fit
// beside it. From 45 the deck is drawn and the buttons follow the tiers below.

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
export const ART_COLUMNS = 10 // Clawd (9) and one gap
export const DECK_COLUMNS = 10 // deck (7), gap, crate (1), gap
export const DECK_FROM = 45
export const PAUSE_ONLY_BELOW = 40

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
  if (width < PAUSE_ONLY_BELOW) {
    return { showDeck: false, buttons: 'pause', textColumns: Math.max(0, width - ART_COLUMNS) }
  }
  if (width < DECK_FROM) {
    return { showDeck: false, buttons: 'three', textColumns: width - ART_COLUMNS }
  }
  const textColumns = width - ART_COLUMNS - DECK_COLUMNS
  const buttons: ButtonSet = width >= 74 ? 'six' : width >= 56 ? 'four' : 'three'
  return { showDeck: true, buttons, textColumns }
}
