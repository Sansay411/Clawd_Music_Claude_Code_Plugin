// The band's width plan: which buttons and art show at each width, and that the
// chosen buttons always fit the text column beside the art.

import { expect, test } from 'claude-code/testing'
import { bandPlan, PLAIN_CELLS, setCells } from '../src/layout'

test('below 40 columns the band keeps pause only and drops the deck', async () => {
  for (let width = 20; width < 40; width++) {
    const plan = bandPlan(width)
    expect(plan.showDeck).toBe(false)
    expect(plan.buttons).toBe('pause')
  }
})

test('from 40 to 44 the deck is dropped and three buttons show', async () => {
  for (let width = 40; width < 45; width++) {
    const plan = bandPlan(width)
    expect(plan.showDeck).toBe(false)
    expect(plan.buttons).toBe('three')
  }
})

test('from 45 the deck shows, and the button tiers follow the brief at 56 and 74', async () => {
  expect(bandPlan(45)).toEqual({ showDeck: true, buttons: 'three', textColumns: 25 })
  expect(bandPlan(55).buttons).toBe('three')
  expect(bandPlan(56).buttons).toBe('four')
  expect(bandPlan(73).buttons).toBe('four')
  expect(bandPlan(74).buttons).toBe('six')
  expect(bandPlan(74).showDeck).toBe(true)
})

test('every width from 20 to 200 has room: the chosen buttons fit beside the art', async () => {
  const misfits: number[] = []
  for (let width = 20; width <= 200; width++) {
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
