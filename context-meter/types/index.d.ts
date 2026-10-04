export type Fill = { tokens?: number; window: number; percent?: number }

export type Category = { name: string; tokens: number; color: string; kind: string }

export type Line = { name: string; tokens: number; note?: string }

export type Details = {
  model: string
  totalTokens: number
  maxTokens: number
  percentage: number
  categories: Category[]
  autoCompactThreshold?: number
  isAutoCompactEnabled: boolean
  memoryFiles: Line[]
  mcpServers: Line[]
  skills?: { count: number; tokens: number }
  agents: Line[]
  lastResponse: { input: number; cacheRead: number; cacheWrite: number; output: number } | null
  isExact: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'context-meter': { fill: Fill; details: Details | null; isLoading: boolean }
  }
}
