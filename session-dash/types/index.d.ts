export type DashStats = {
  toolCounts: Record<string, number>
  blocked: number
  errors: number
  files: string[]
  tokensIn: number
  tokensOut: number
  turnDurations: number[]
}

declare module 'claude-code' {
  interface PluginState {
    'session-dash': { stats: DashStats }
  }
}
