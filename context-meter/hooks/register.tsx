import { atom, read, update } from 'claude-code'
import type { ContextBreakdownDetail, EngineInterface, Register } from 'claude-code'

import type { Fill, Line } from '../types'
import { fit, formatTokens, levelColor, meterBar, percentOf, segments, toDetails } from './context'

const PANE = 'context-meter'
const fill = atom({ plugin: 'context-meter', key: 'fill' } as const, { window: 0 } as Fill)
const details = atom({ plugin: 'context-meter', key: 'details' } as const, null)
const isLoading = atom({ plugin: 'context-meter', key: 'isLoading' } as const, false)

async function refreshFill($: EngineInterface): Promise<void> {
  const { context } = await $.session.usage()
  await update($, fill, () => context)
}

async function loadDetails($: EngineInterface, detail: ContextBreakdownDetail): Promise<void> {
  await update($, isLoading, () => true)
  try {
    const { context } = await $.session.usage({ breakdown: detail })
    const { breakdown, ...rest } = context
    await update($, fill, () => rest)
    if (breakdown !== undefined) await update($, details, () => toDetails(breakdown, detail === 'full'))
  } finally {
    await update($, isLoading, () => false)
  }
}

async function isPaneOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

async function togglePane($: EngineInterface): Promise<boolean> {
  if (await isPaneOpen($)) {
    await $.ui.close({ id: PANE })
    return false
  }

  await $.ui.open({ id: PANE, title: 'Context', focus: true, closeOnEscape: true })
  void loadDetails($, 'summary')
  return true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ctx',
      description: 'Toggle the context window breakdown',
    })
    const started = await next(e)
    await refreshFill($)

    return started
  })

  on('session.measure', async ($, e, next) => {
    await update($, fill, () => e.context)
    if (e.changed.includes('context') && (await isPaneOpen($))) void loadDetails($, 'summary')

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    await refreshFill($)
    if (await isPaneOpen($)) void loadDetails($, 'summary')

    return compacted
  })

  on('command.run', { command: 'ctx' }, async $ => {
    const isOpen = await togglePane($)

    return { text: isOpen ? 'Context breakdown opened. Esc or /ctx closes it.' : 'Context breakdown closed.' }
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current = await read($, fill)
    const label =
      current.percent === undefined
        ? `ctx ${meterBar(0, 8)} --`
        : `ctx ${meterBar(current.percent, 8)} ${current.percent}%`
    const color = levelColor(current.percent)

    return (
      <Box flexDirection="row" columnGap={2}>
        {e.props.modes.length > 0 && <Text dimColor>{e.props.modes.join(' & ')}</Text>}
        <Button
          key="meter"
          plain
          label={label}
          {...(color === undefined ? { dimColor: true } : { color })}
          onPress={() => togglePane($)}
        />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current = await read($, details)
    const loading = await read($, isLoading)
    const live = await read($, fill)
    const width = Math.max(32, e.props.bodyColumns)

    if (current === null) {
      return <Text dimColor>{loading ? 'Counting the context window…' : 'No breakdown yet.'}</Text>
    }

    const used = current.categories.filter(category => category.kind === 'used').sort((a, b) => b.tokens - a.tokens)
    const deferred = current.categories.filter(category => category.kind === 'deferred')
    const free = current.categories.find(category => category.kind === 'free')?.tokens ?? 0
    const usedTotal = used.reduce((sum, category) => sum + category.tokens, 0)
    const largest = used[0]?.tokens ?? 1

    const nameWidth = Math.min(20, Math.max(8, ...used.map(category => category.name.length)))
    const barWidth = Math.max(4, width - nameWidth - 18)
    const accent = levelColor(current.percentage)

    const compactNote = !current.isAutoCompactEnabled || current.autoCompactThreshold === undefined
      ? 'auto-compact off'
      : current.autoCompactThreshold > current.totalTokens
        ? `compacts in ${formatTokens(current.autoCompactThreshold - current.totalTokens)}`
        : 'compacts next turn'

    const section = (title: string, lines: Line[]) =>
      lines.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{title}</Text>
          {lines.map(line => (
            <Box flexDirection="row" columnGap={1}>
              <Box flexShrink={0}>
                <Text>{`  ${line.name}`}</Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                {line.note !== undefined && (
                  <Text dimColor wrap="truncate-start">
                    {line.note}
                  </Text>
                )}
              </Box>
              <Box flexShrink={0}>
                <Text>{formatTokens(line.tokens).padStart(6)}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      )

    const memory = current.memoryFiles.map(file => {
      const path = file.name.replace(/^\/(Users|home)\/[^/]+/, '~')
      const cut = path.lastIndexOf('/')
      return { name: path.slice(cut + 1), tokens: file.tokens, note: path.slice(0, cut) }
    })

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
          <Text>
            <Text bold {...(accent === undefined ? {} : { color: accent })}>
              {current.percentage}%
            </Text>
            <Text>{`  ${formatTokens(current.totalTokens)}`}</Text>
            <Text dimColor>{` of ${formatTokens(current.maxTokens)}`}</Text>
          </Text>
          <Text dimColor wrap="truncate-start">
            {current.model}
            {loading ? ' · counting…' : current.isExact ? ' · exact' : ' · estimated'}
          </Text>
        </Box>

        <Text>
          {segments(current.categories, current.maxTokens, width).map(part =>
            part.kind === 'free' ? (
              <Text dimColor>{'░'.repeat(part.cells)}</Text>
            ) : (
              <Text color={part.color}>{(part.kind === 'buffer' ? '▒' : '█').repeat(part.cells)}</Text>
            ),
          )}
        </Text>
        <Text dimColor>
          {formatTokens(free)} free · {compactNote}
        </Text>

        <Box flexDirection="column" marginTop={1}>
          {used.map(category => (
            <Text>
              <Text color={category.color}>●</Text>
              {` ${fit(category.name, nameWidth)} `}
              <Text dimColor>{formatTokens(category.tokens).padStart(6)}</Text>
              {'  '}
              <Text color={category.color}>
                {'━'.repeat(Math.max(1, Math.round((category.tokens / largest) * barWidth)))}
              </Text>
              {' '.repeat(barWidth - Math.max(1, Math.round((category.tokens / largest) * barWidth)))}
              <Text dimColor>{percentOf(category.tokens, usedTotal).padStart(5)}</Text>
            </Text>
          ))}
          {deferred.length > 0 && (
            <Text dimColor wrap="truncate-end">
              {`○ ${fit('on demand', nameWidth)} `}
              {formatTokens(deferred.reduce((sum, category) => sum + category.tokens, 0)).padStart(6)}
              {`  ${deferred.map(category => category.name).join(', ')}, not in the window`}
            </Text>
          )}
        </Box>

        {live.tokens !== undefined && (
          <Box marginTop={1}>
            <Text dimColor wrap="truncate-end">
              last request {formatTokens(live.tokens)} in
              {current.lastResponse === null
                ? ''
                : ` · ${formatTokens(current.lastResponse.cacheRead)} cached · ${formatTokens(
                    current.lastResponse.output,
                  )} out`}
            </Text>
          </Box>
        )}

        {section('memory', memory)}
        {section('mcp servers', current.mcpServers)}
        {section(
          'skills',
          current.skills === undefined || current.skills.count === 0
            ? []
            : [{ name: `${current.skills.count} listed`, tokens: current.skills.tokens }],
        )}
        {section('agents', current.agents)}

        <Box marginTop={1} columnGap={1}>
          <Button key="exact" label="Count exactly" hotkey="e" onPress={() => loadDetails($, 'full')} />
          <Button key="refresh" label="Refresh" hotkey="r" onPress={() => loadDetails($, 'summary')} />
          <Button key="compact" label="Compact" hotkey="c" onPress={() => $.session.compact()} />
          <Button key="close" label="Close" hotkey="q" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
