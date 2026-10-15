// The band's width plan: which buttons and art show at each width, and that the
// chosen buttons always fit the text column beside the art.

import { expect, test } from 'claude-code/testing'
import { bandPlan, PLAIN_CELLS, setCells } from '../src/layout'

test('below 44 columns the band keeps pause only', async () => {
  for (let width = 20; width < 44; width++) {
    const plan = bandPlan(width)
    expect(plan.showDeck).toBe(false)
    expect(plan.buttons).toBe('pause')
  }
})

test('the button tiers follow the width: three from 44, four from 54, six from 70', async () => {
  expect(bandPlan(44)).toEqual({ showDeck: false, buttons: 'three', textColumns: 25 })
  expect(bandPlan(53).buttons).toBe('three')
  expect(bandPlan(54).buttons).toBe('four')
  expect(bandPlan(69).buttons).toBe('four')
  expect(bandPlan(70).buttons).toBe('six')
})

test('the deck shows from 80 columns', async () => {
  expect(bandPlan(79).showDeck).toBe(false)
  expect(bandPlan(80)).toEqual({ showDeck: true, buttons: 'six', textColumns: 51 })
})

test('every width from 28 to 200 has room: the chosen buttons fit beside the art', async () => {
  const misfits: number[] = []
  for (let width = 28; width <= 200; width++) {
    const plan = bandPlan(width)
    if (setCells(plan.buttons) > plan.textColumns) misfits.push(width)
  }
  expect(misfits).toEqual([])
})

test('the plain button widths add up to the sets the plan assumes', async () => {
  expect(PLAIN_CELLS.prev).toBe(7)
  expect(setCells('pause')).toBe(PLAIN_CELLS.pause)
  expect(setCells('three')).toBe(25)
  expect(setCells('four')).toBe(35)
  expect(setCells('six')).toBe(51)
})
