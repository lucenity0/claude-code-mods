import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

function record(on: On) {
  const toasts: string[] = []
  const sounds: unknown[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('audio.play', (_, e) => {
    sounds.push(e.clip)
    return { value: undefined }
  })
  on('turn.complete', () => ({ text: '' }))
  return { toasts, sounds }
}

const turn = (durationMs: number, extra: { agentId?: string; isAborted?: boolean } = {}) => ({
  answer: 'ok',
  durationMs,
  isAborted: extra.isAborted ?? false,
  reason: extra.isAborted ? ('aborted' as const) : ('answer' as const),
  turnId: 't',
  ...(extra.agentId === undefined ? {} : { agentId: extra.agentId }),
})

test('dings for a long turn', async ($, on) => {
  const { toasts, sounds } = record(on)
  await $.turn.complete(turn(47_000))
  expect(toasts).toEqual(['Done in 47s'])
  expect(sounds).toEqual([{ asset: 'sounds/done.wav' }])
})

test('stays quiet for short, aborted and subagent turns', async ($, on) => {
  const { toasts, sounds } = record(on)
  await $.turn.complete(turn(5_000))
  await $.turn.complete(turn(90_000, { isAborted: true }))
  await $.turn.complete(turn(90_000, { agentId: 'sub' }))
  expect(toasts).toEqual([])
  expect(sounds).toEqual([])
})

test('honours the configured threshold and mute', { options: { thresholdSeconds: 5, sound: false } }, async ($, on) => {
  const { toasts, sounds } = record(on)
  await $.turn.complete(turn(6_000))
  expect(toasts).toEqual(['Done in 6s'])
  expect(sounds).toEqual([])
})
