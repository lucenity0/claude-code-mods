import type { Register } from 'claude-code'

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
}

export const register: Register = (on, options) => {
  const thresholdMs = Number(options.thresholdSeconds ?? 30) * 1000
  const hasSound = options.sound !== false

  on('turn.complete', ($, e, next) => {
    const isWorthADing = e.agentId === undefined && !e.isAborted && e.durationMs >= thresholdMs
    if (isWorthADing) {
      const verb = e.reason === 'answer' ? 'Done' : 'Stopped'
      $.ui.toast(`🔔 ${verb} in ${formatDuration(e.durationMs)}`)
      if (hasSound) {
        $.audio.play({ asset: 'sounds/done.wav' }).catch(() => undefined)
      }
    }

    return next(e)
  })
}
