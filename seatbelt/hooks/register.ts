import type { Register } from 'claude-code'

import { BASH_RULES, FILE_RULES, firstMatch } from './rules'

function clip(text: string, length = 60): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > length ? `${line.slice(0, length - 1)}…` : line
}

function checkFile(tool: string, path: string): { deny: string; toast: string } | undefined {
  const rule = firstMatch(FILE_RULES, path)
  if (rule === undefined) return undefined

  return {
    deny: `seatbelt: ${path} ${rule.reason}, so ${tool} is blocked. Ask the user to make this change themselves.`,
    toast: `seatbelt blocked ${tool} on ${clip(path)}`,
  }
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const rule = firstMatch(BASH_RULES, e.command)
    if (rule === undefined) return next(e)

    $.ui.toast(`seatbelt blocked ${rule.name}: ${clip(e.command)}`)
    return {
      deny: `seatbelt: blocked \`${clip(e.command, 200)}\` (${rule.name}): it ${rule.reason}. Do not retry or work around this; if the user really wants it, they can run it themselves.`,
    }
  })

  on('tool.call', { tool: 'Edit' }, ($, e, next) => {
    const blocked = checkFile('Edit', e.file_path)
    if (blocked === undefined) return next(e)
    $.ui.toast(blocked.toast)
    return { deny: blocked.deny }
  })

  on('tool.call', { tool: 'Write' }, ($, e, next) => {
    const blocked = checkFile('Write', e.file_path)
    if (blocked === undefined) return next(e)
    $.ui.toast(blocked.toast)
    return { deny: blocked.deny }
  })

  on('tool.call', { tool: 'NotebookEdit' }, ($, e, next) => {
    const blocked = checkFile('NotebookEdit', e.notebook_path)
    if (blocked === undefined) return next(e)
    $.ui.toast(blocked.toast)
    return { deny: blocked.deny }
  })
}
