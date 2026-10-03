import { expect, mock, test } from 'claude-code/testing'

import { formatDuration, formatTokens } from './register'

test('formats durations and token counts', () => {
  expect(formatDuration(4_400)).toBe('4s')
  expect(formatDuration(125_000)).toBe('2m05s')
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(12_345)).toBe('12.3k')
})

test('ticks while the turn runs, then shows the summary', async ($, on) => {
  const clock = mock.clock(on)
  const statuses: (string | undefined)[] = []
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await clock.advance(3000)
  expect(statuses.at(-1)).toBe('running 3s')

  await $.turn.complete({
    answer: 'done',
    durationMs: 41_000,
    isAborted: false,
    reason: 'answer',
    turnId: 't1',
    usage: {
      model: 'claude-opus-5-5',
      input_tokens: 300,
      cache_read_input_tokens: 12_000,
      cache_creation_input_tokens: 0,
      output_tokens: 1_800,
    },
  })
  expect(statuses.at(-1)).toBe('✓ 41s · 12.3k in · 1.8k out')

  await clock.advance(5000)
  expect(statuses.at(-1)).toBe('✓ 41s · 12.3k in · 1.8k out')
})

test('ignores subagent turns', async ($, on) => {
  const statuses: (string | undefined)[] = []
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('turn.complete', () => ({ text: '' }))

  await $.turn.complete({
    answer: '',
    durationMs: 5_000,
    isAborted: false,
    reason: 'answer',
    turnId: 't2',
    agentId: 'sub-1',
  })
  expect(statuses).toEqual([])
})
