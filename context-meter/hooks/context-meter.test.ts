import { expect, test } from 'claude-code/testing'
import type { SessionContextBreakdown } from 'claude-code'

import { formatTokens, meterBar, percentOf, segments, toDetails } from './context'

const FOOTER = {
  plugin: 'context-meter',
  component: 'SessionMode',
  requestId: 'mode',
  props: { modes: [] as string[] },
} as const

const BREAKDOWN: SessionContextBreakdown = {
  categories: [
    { name: 'System prompt', tokens: 3_000, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 81_000, color: 'purple', isDeferred: false, kind: 'used' },
    { name: 'MCP tools (deferred)', tokens: 93_000, color: 'inactive', isDeferred: true, kind: 'deferred' },
    { name: 'Free space', tokens: 83_000, color: 'promptBorder', isDeferred: false, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
  ],
  totalTokens: 84_000,
  maxTokens: 200_000,
  rawMaxTokens: 200_000,
  autocompactSource: 'model-default',
  percentage: 42,
  gridRows: [
    [
      { color: 'purple', isFilled: true, categoryName: 'Messages', tokens: 81_000, percentage: 41, squareFullness: 1 },
      { color: 'promptBorder', isFilled: false, categoryName: 'Free space', tokens: 83_000, percentage: 42, squareFullness: 0 },
    ],
  ],
  model: 'claude-opus-5-5',
  memoryFiles: [{ path: '/repo/CLAUDE.md', type: 'Project', tokens: 900 }],
  mcpTools: [
    { name: 'mcp__linear__a', serverName: 'linear', tokens: 400, isLoaded: true },
    { name: 'mcp__linear__b', serverName: 'linear', tokens: 600, isLoaded: true },
  ],
  agents: [],
  autoCompactThreshold: 167_000,
  isAutoCompactEnabled: true,
  apiUsage: { input_tokens: 10, cache_read_input_tokens: 80_000, cache_creation_input_tokens: 4_000, output_tokens: 1_200 },
}

test('formats the meter', () => {
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(1_234)).toBe('1.2k')
  expect(formatTokens(84_000)).toBe('84k')
  expect(formatTokens(1_000_000)).toBe('1M')
  expect(meterBar(42, 8)).toBe('▰▰▰▱▱▱▱▱')
  expect(percentOf(324, 103_000)).toBe('<1%')
})

test('folds the breakdown into what the pane draws', () => {
  const details = toDetails(BREAKDOWN, false)
  expect(details.mcpServers).toEqual([{ name: 'linear', tokens: 1_000, note: '2 tools' }])
  expect(details.categories.map(category => category.name)).toContain('MCP tools')
  expect(details.lastResponse?.cacheRead).toBe(80_000)
})

test('the bar always fills its width and keeps tiny parts visible', () => {
  const details = toDetails(BREAKDOWN, false)
  for (const width of [10, 40, 77]) {
    const parts = segments(details.categories, details.maxTokens, width)
    expect(parts.reduce((sum, part) => sum + part.cells, 0)).toBe(width)
    expect(parts.map(part => part.kind)).toEqual(['used', 'used', 'free', 'buffer'])
  }
})

test('the footer shows the fill and a press opens the breakdown', async ($, on) => {
  const opened: string[] = []
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 84_000, window: 200_000, percent: 42, breakdown: BREAKDOWN },
      rateLimits: [],
    },
  }))

  await $.session.measure({ context: { tokens: 84_000, window: 200_000, percent: 42 }, rateLimits: [], changed: ['context'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...FOOTER, surface })
    expect(await ui.find({ type: 'Button', key: 'meter', text: 'ctx ▰▰▰▱▱▱▱▱ 42%' })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  await ui.press({ key: 'meter' })
  expect(opened).toEqual(['context-meter'])
  await ui.unmount()

  const pane = await $.ui.mount({
    plugin: 'context-meter',
    component: 'Pane',
    requestId: 'context-meter',
    surface: 'terminal',
    props: { title: 'Context', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  expect(await pane.find({ type: 'Text', text: '42%' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /on demand +93k {2}MCP tools, not in the window/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /83k free · compacts in 83k/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'linear' })).toBeDefined()
  await pane.unmount()
})
