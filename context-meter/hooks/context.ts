import type { SessionContextBreakdown } from 'claude-code'

import type { Category, Details, Line } from '../types'

export type Segment = { color: string; cells: number; kind: string }

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`
  if (tokens >= 10_000) return `${Math.round(tokens / 1000)}k`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return String(tokens)
}

export function meterBar(percent: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

// Theme keys, so the meter follows light and dark themes.
export function levelColor(percent: number | undefined): string | undefined {
  if (percent === undefined) return undefined
  if (percent >= 80) return 'error'
  if (percent >= 60) return 'warning'
  return undefined
}

export function percentOf(tokens: number, of: number): string {
  if (of <= 0 || tokens <= 0) return '0%'
  const value = (tokens / of) * 100
  return value < 1 ? '<1%' : `${Math.round(value)}%`
}

export function fit(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width)
}

// The window as one row of cells: each used category in its colour, then the
// free space, then the compaction buffer at the end. Every non-empty part
// keeps at least one cell, and the cells always add up to `width`.
export function segments(categories: Category[], window: number, width: number): Segment[] {
  const cellsFor = (tokens: number) => (tokens > 0 ? Math.max(1, Math.round((tokens / window) * width)) : 0)
  const used = categories
    .filter(category => category.kind === 'used')
    .sort((a, b) => b.tokens - a.tokens)
    .map(category => ({ color: category.color, cells: cellsFor(category.tokens), kind: 'used' }))
  const bufferTokens = categories.find(category => category.kind === 'buffer')?.tokens ?? 0
  const buffer = { color: 'inactive', cells: cellsFor(bufferTokens), kind: 'buffer' }

  let over = used.reduce((sum, part) => sum + part.cells, 0) + buffer.cells - width
  while (over > 0) {
    const largest = used.reduce((a, b) => (b.cells > a.cells ? b : a), used[0] ?? buffer)
    if (largest.cells <= 1) break
    largest.cells -= 1
    over -= 1
  }

  const free = Math.max(0, -over)
  return [...used, { color: 'inactive', cells: free, kind: 'free' }, buffer].filter(part => part.cells > 0)
}

function top(lines: Line[], count: number): Line[] {
  return [...lines].sort((a, b) => b.tokens - a.tokens).slice(0, count)
}

export function toDetails(breakdown: SessionContextBreakdown, isExact: boolean): Details {
  const servers = new Map<string, { tokens: number; tools: number }>()
  for (const tool of breakdown.mcpTools) {
    const server = servers.get(tool.serverName) ?? { tokens: 0, tools: 0 }
    servers.set(tool.serverName, { tokens: server.tokens + tool.tokens, tools: server.tools + 1 })
  }

  const usage = breakdown.apiUsage

  return {
    model: breakdown.model,
    totalTokens: breakdown.totalTokens,
    maxTokens: breakdown.rawMaxTokens,
    percentage: breakdown.percentage,
    categories: breakdown.categories
      .filter(category => category.tokens > 0 || category.kind === 'free')
      .map(({ name, tokens, color, kind }) => ({ name: name.replace(/\s*\(deferred\)$/, ''), tokens, color, kind })),
    ...(breakdown.autoCompactThreshold === undefined
      ? {}
      : { autoCompactThreshold: breakdown.autoCompactThreshold }),
    isAutoCompactEnabled: breakdown.isAutoCompactEnabled,
    memoryFiles: top(
      breakdown.memoryFiles.map(file => ({ name: file.path, tokens: file.tokens, note: file.type })),
      6,
    ),
    mcpServers: top(
      [...servers].map(([name, server]) => ({
        name,
        tokens: server.tokens,
        note: `${server.tools} ${server.tools === 1 ? 'tool' : 'tools'}`,
      })),
      6,
    ),
    ...(breakdown.skills === undefined
      ? {}
      : { skills: { count: breakdown.skills.includedSkills, tokens: breakdown.skills.tokens } }),
    agents: top(breakdown.agents.map(agent => ({ name: agent.agentType, tokens: agent.tokens })), 6),
    lastResponse:
      usage === null
        ? null
        : {
            input: usage.input_tokens,
            cacheRead: usage.cache_read_input_tokens,
            cacheWrite: usage.cache_creation_input_tokens,
            output: usage.output_tokens,
          },
    isExact,
  }
}
