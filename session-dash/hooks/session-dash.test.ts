import { expect, test } from 'claude-code/testing'

import { EMPTY, countTool, sparkline } from './stats'

const PANE = {
  plugin: 'session-dash',
  component: 'Pane',
  requestId: 'session-dash',
  props: { title: 'Session', isFocused: false, bodyColumns: 48, placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('counts tools and remembers files most-recent last', () => {
  let stats = countTool(EMPTY, 'Read', { isDenied: false, isError: false, path: '/a.ts' })
  stats = countTool(stats, 'Edit', { isDenied: false, isError: false, path: '/b.ts' })
  stats = countTool(stats, 'Read', { isDenied: false, isError: false, path: '/a.ts' })
  stats = countTool(stats, 'Bash', { isDenied: true, isError: false })
  expect(stats.toolCounts).toEqual({ Read: 2, Edit: 1, Bash: 1 })
  expect(stats.files).toEqual(['/b.ts', '/a.ts'])
  expect(stats.blocked).toBe(1)
})

test('sparkline scales to the largest value', () => {
  expect(sparkline([0, 50, 100])).toBe('▁▄█')
})

test('the pane shows what the session did, on terminal and desktop', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))

  await $.tool.call({ tool: 'Read', file_path: '/repo/src/index.ts' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/README.md' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.turn.complete({ answer: '', durationMs: 12_000, isAborted: false, reason: 'answer', turnId: 'a' })
  await $.turn.complete({ answer: '', durationMs: 30_000, isAborted: false, reason: 'answer', turnId: 'b' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /2 turns · 42s/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Tools \(3 calls\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '/repo/README.md' })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'reset' })
  expect(await ui.find({ type: 'Text', text: /0 turns/ })).toBeDefined()
  await ui.unmount()
})

test('/dash opens the pane', async ($, on) => {
  const opened: string[] = []
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })

  const ran = await $.command.run({
    command: 'dash',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })
  expect(opened).toEqual(['session-dash'])
  expect(ran.text).toContain('opened')
})
