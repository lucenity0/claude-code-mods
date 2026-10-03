import type { Register, Timer, TurnUsage } from 'claude-code'

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`
}

export function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`
  return `${(count / 1_000_000).toFixed(2)}M`
}

export function summarize(durationMs: number, usage: TurnUsage | undefined): string {
  const time = `✓ ${formatDuration(durationMs)}`
  if (usage === undefined) return time
  const input =
    usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  return `${time} · ${formatTokens(input)} in · ${formatTokens(usage.output_tokens)} out`
}

export const register: Register = on => {
  let ticker: Timer | undefined

  on('turn.start', ($, e, next) => {
    ticker?.cancel()
    let seconds = 0
    $.ui.status('running 0s')
    ticker = $.clock.every(1000, () => {
      seconds += 1
      $.ui.status(`running ${formatDuration(seconds * 1000)}`)
    })

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    ticker?.cancel()
    ticker = undefined
    $.ui.status(e.isAborted ? `✗ stopped after ${formatDuration(e.durationMs)}` : summarize(e.durationMs, e.usage))

    return next(e)
  })
}
