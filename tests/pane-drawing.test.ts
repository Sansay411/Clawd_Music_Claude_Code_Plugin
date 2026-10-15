// The pane's drawing, mounted through the engine on each surface it names: the
// header's two stat lines on every surface, and the mood input where the surface
// has one (mobile has none). The tree is checked against each surface's element
// table, so a prop a surface refuses fails here, not in a session.

import { expect, test } from 'claude-code/testing'

const PANE_PROPS = {
  title: 'Claude Music',
  isFocused: true,
  bodyColumns: 60,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
} as const

test('the pane header shows the title and the station line, and the mood input, on terminal and desktop', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'clawd-music',
      surface,
      component: 'Pane',
      requestId: 'claude-music',
      props: PANE_PROPS,
    })
    expect(await ui.find({ type: 'Text', text: 'pick a genre below' })).toBeDefined()
    expect(await ui.find({ type: 'Input', key: 'mood' })).toBeDefined()
    await ui.unmount()
  }
})

test('the mobile pane draws the same header and no mood input', async $ => {
  const ui = await $.ui.mount({
    plugin: 'clawd-music',
    surface: 'mobile',
    component: 'Pane',
    requestId: 'claude-music',
    props: PANE_PROPS,
  })
  expect(await ui.find({ type: 'Text', text: 'pick a genre below' })).toBeDefined()
  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  await ui.unmount()
})
