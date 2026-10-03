import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import {
  EMPTY,
  countTool,
  countTurn,
  formatDuration,
  formatTokens,
  rasterCells,
  sparkline,
} from './stats'

const PANE = 'session-dash'
const ACCENT = '#d97757'
const stats = atom({ plugin: 'session-dash', key: 'stats' } as const, EMPTY)

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'NotebookEdit'])

function pathOf(input: object): string | undefined {
  const value =
    'file_path' in input ? input.file_path : 'notebook_path' in input ? input.notebook_path : undefined
  return typeof value === 'string' ? value : undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'dash',
      description: 'Toggle the session dashboard pane',
    })

    return next(e)
  })

  on('command.run', { command: 'dash' }, async $ => {
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })
      return { text: 'Session dashboard closed.' }
    }

    await $.ui.open({ id: PANE, title: 'Session' })
    return { text: 'Session dashboard opened. /dash again to close it.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const path = FILE_TOOLS.has(e.tool) ? pathOf(e) : undefined
    await update($, stats, current =>
      countTool(current, e.tool, {
        isDenied: ran.deny !== undefined,
        isError: ran.isError === true,
        ...(path === undefined ? {} : { path }),
      }),
    )

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    await update($, stats, current =>
      countTurn(current, {
        durationMs: e.durationMs,
        isMainLoop: e.agentId === undefined,
        ...(e.usage === undefined ? {} : { usage: e.usage }),
      }),
    )

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current = await read($, stats)
    const width = Math.max(20, e.props.bodyColumns)

    const tools = Object.entries(current.toolCounts).sort((a, b) => b[1] - a[1])
    const totalCalls = tools.reduce((sum, [, count]) => sum + count, 0)
    const topCount = tools[0]?.[1] ?? 1
    const nameWidth = Math.min(14, Math.max(4, ...tools.map(([name]) => name.length)))
    const barRoom = Math.max(4, width - nameWidth - 7)

    const turns = current.turnDurations
    const totalTime = turns.reduce((sum, ms) => sum + ms, 0)
    const spark = sparkline(turns.slice(-width))

    let sparkNode = <Text dimColor>No turns yet.</Text>
    if (turns.length > 0 && e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      sparkNode = <Raster key="spark" columns={[...spark].length} rows={1} cells={rasterCells(spark, 0xd97757)} />
    } else if (turns.length > 0) {
      sparkNode = <Text color={ACCENT}>{spark}</Text>
    }

    const shortName = (name: string) =>
      name.length > nameWidth ? `${name.slice(0, nameWidth - 1)}…` : name.padEnd(nameWidth)

    return (
      <Box flexDirection="column">
        <Text bold>
          {turns.length} turns · {formatDuration(totalTime)} · {formatTokens(current.tokensIn)} in ·{' '}
          {formatTokens(current.tokensOut)} out
        </Text>
        {(current.blocked > 0 || current.errors > 0) && (
          <Text color="#c0504d">
            {current.blocked} blocked · {current.errors} errored
          </Text>
        )}

        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Tools ({totalCalls} calls)</Text>
          {tools.length === 0 && <Text dimColor>No tool calls yet.</Text>}
          {tools.slice(0, 8).map(([name, count]) => (
            <Text>
              {shortName(name)} <Text color={ACCENT}>{'█'.repeat(Math.max(1, Math.round((count / topCount) * barRoom)))}</Text>{' '}
              {count}
            </Text>
          ))}
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>
            Turn time (last {turns.length}){turns.length > 0 ? ` · max ${formatDuration(Math.max(...turns))}` : ''}
          </Text>
          {sparkNode}
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Recent files ({current.files.length})</Text>
          {current.files.length === 0 && <Text dimColor>None yet.</Text>}
          {current.files
            .slice(-8)
            .reverse()
            .map(file => (
              <Text wrap="truncate-start">{file}</Text>
            ))}
        </Box>

        <Box marginTop={1} columnGap={1}>
          <Button key="reset" label="Reset" hotkey="r" onPress={() => update($, stats, () => EMPTY)} />
          <Button key="close" label="Close" hotkey="q" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
