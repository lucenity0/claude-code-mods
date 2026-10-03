import type { TurnUsage } from 'claude-code'

import type { DashStats } from '../types'

export const EMPTY: DashStats = {
  toolCounts: {},
  blocked: 0,
  errors: 0,
  files: [],
  tokensIn: 0,
  tokensOut: 0,
  turnDurations: [],
}

const MAX_FILES = 50
const MAX_TURNS = 30

export function countTool(
  stats: DashStats,
  tool: string,
  outcome: { isDenied: boolean; isError: boolean; path?: string },
): DashStats {
  const files =
    outcome.path === undefined || outcome.isDenied
      ? stats.files
      : [...stats.files.filter(file => file !== outcome.path), outcome.path].slice(-MAX_FILES)

  return {
    ...stats,
    toolCounts: { ...stats.toolCounts, [tool]: (stats.toolCounts[tool] ?? 0) + 1 },
    blocked: stats.blocked + (outcome.isDenied ? 1 : 0),
    errors: stats.errors + (outcome.isError ? 1 : 0),
    files,
  }
}

export function countTurn(
  stats: DashStats,
  turn: { durationMs: number; usage?: TurnUsage; isMainLoop: boolean },
): DashStats {
  const usage = turn.usage
  return {
    ...stats,
    tokensIn:
      stats.tokensIn +
      (usage === undefined
        ? 0
        : usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens),
    tokensOut: stats.tokensOut + (usage?.output_tokens ?? 0),
    turnDurations: turn.isMainLoop
      ? [...stats.turnDurations, turn.durationMs].slice(-MAX_TURNS)
      : stats.turnDurations,
  }
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
}

export function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`
  return `${(count / 1_000_000).toFixed(2)}M`
}

const SPARKS = '▁▂▃▄▅▆▇█'

/** One spark glyph per value, scaled to the largest. */
export function sparkline(values: readonly number[]): string {
  const max = Math.max(1, ...values)
  return values
    .map(value => SPARKS[Math.min(SPARKS.length - 1, Math.floor((value / max) * (SPARKS.length - 1)))] ?? ' ')
    .join('')
}

const DEFAULT_COLOR = 0x01000000

/** Packs a one-row Raster: each glyph in `color` over the terminal's own background. */
export function rasterCells(glyphs: string, color: number): string {
  const chars = [...glyphs]
  const words = new Uint32Array(chars.length * 3)
  chars.forEach((char, index) => {
    words[index * 3] = char.codePointAt(0) ?? 0x20
    words[index * 3 + 1] = color
    words[index * 3 + 2] = DEFAULT_COLOR
  })
  const bytes = new Uint8Array(words.buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
