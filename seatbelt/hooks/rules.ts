export type Rule = {
  name: string
  reason: string
  matches: (subject: string) => boolean
}

/** Collapses `.`, `..` and repeated slashes so `/tmp/x/../../` reads as `/`. */
export function normalizePath(path: string): string {
  const isAbsolute = path.startsWith('/')
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.length > 0 && parts.at(-1) !== '..') parts.pop()
      else if (!isAbsolute) parts.push('..')
      continue
    }
    parts.push(part)
  }
  const joined = parts.join('/')
  return isAbsolute ? `/${joined}` : joined || '.'
}

/** Splits a command line into the simple commands it chains or pipes. */
function segments(command: string): string[][] {
  return command
    .split(/;|&&|\|\||\||\n/)
    .map(segment =>
      segment
        .trim()
        .split(/\s+/)
        .map(token => token.replace(/^['"]|['"]$/g, ''))
        .filter(token => token !== ''),
    )
    .map(tokens => {
      let start = 0
      while (start < tokens.length && (tokens[start] === 'sudo' || /^\w+=/.test(tokens[start] ?? ''))) {
        start += 1
      }
      return tokens.slice(start)
    })
    .filter(tokens => tokens.length > 0)
}

const HOME_SPELLINGS = /^(~|\$HOME|\$\{HOME\})(\/\*?)?$/

/** A target whose loss is the whole machine or the whole home folder. */
function isSweepingTarget(target: string): boolean {
  if (HOME_SPELLINGS.test(target)) return true
  if (!target.startsWith('/')) return false
  const normalized = normalizePath(target.replace(/\/\*$/, ''))
  return normalized.split('/').filter(Boolean).length <= 1
}

function isRecursiveRemoveOfRoot(command: string): boolean {
  return segments(command).some(tokens => {
    if (!/(^|\/)rm$/.test(tokens[0] ?? '')) return false
    const args = tokens.slice(1)
    const isRecursive = args.some(
      arg => arg === '--recursive' || (/^-[^-]/.test(arg) && /[rR]/.test(arg)),
    )
    return isRecursive && args.filter(arg => !arg.startsWith('-')).some(isSweepingTarget)
  })
}

function isForcePushToMain(command: string): boolean {
  return segments(command).some(tokens => {
    if (tokens[0] !== 'git' || tokens[1] !== 'push') return false
    const args = tokens.slice(2)
    const isForced = args.some(arg => arg === '-f' || arg.startsWith('--force') || /^-[^-]*f/.test(arg))
    const refs = args.filter(arg => !arg.startsWith('-'))
    const hitsMain = refs.some(ref => /^\+?(main|master)$|:(main|master)$|^\+(main|master)/.test(ref))
    return hitsMain && (isForced || refs.some(ref => ref.startsWith('+')))
  })
}

export const BASH_RULES: readonly Rule[] = [
  {
    name: 'rm -rf on / or ~',
    reason: 'recursively deletes the filesystem root, a top-level folder or your home folder',
    matches: isRecursiveRemoveOfRoot,
  },
  {
    name: 'force-push to main',
    reason: 'rewrites the history of main/master for everyone',
    matches: isForcePushToMain,
  },
  {
    name: 'curl | sh',
    reason: 'pipes a script from the internet straight into a shell',
    matches: command => /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(command),
  },
  {
    name: 'mkfs',
    reason: 'formats a disk',
    matches: command => /(^|[\s;&|])mkfs(\.\w+)?\b/.test(command),
  },
  {
    name: 'dd to a device',
    reason: 'writes raw bytes over a disk device',
    matches: command => /\bdd\b[^;&|]*\bof=\/dev\//.test(command),
  },
  {
    name: 'chmod -R 777',
    reason: 'makes a whole tree world-writable',
    matches: command =>
      segments(command).some(
        tokens =>
          tokens[0] === 'chmod' &&
          tokens.some(t => /^-[^-]*R/.test(t) || t === '--recursive') &&
          tokens.some(t => /^0?777$/.test(t)),
      ),
  },
  {
    name: 'fork bomb',
    reason: 'spawns processes until the machine falls over',
    matches: command => /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(command),
  },
]

export const FILE_RULES: readonly Rule[] = [
  {
    name: '.env files',
    reason: 'holds secrets (.env.example, .env.sample and .env.template are fine)',
    matches: path => /(^|\/)\.env(\.(?!example$|sample$|template$)[^/]+)?$/.test(path),
  },
  {
    name: 'private keys',
    reason: 'is a private key or certificate',
    matches: path => /\.(pem|key|p12|pfx)$/.test(path) || /(^|\/)id_(rsa|ed25519|ecdsa|dsa)[^/]*$/.test(path),
  },
  {
    name: '~/.ssh',
    reason: 'is inside your SSH folder',
    matches: path => /(^|\/)\.ssh\//.test(path),
  },
]

export function firstMatch(rules: readonly Rule[], subject: string): Rule | undefined {
  return rules.find(rule => rule.matches(subject))
}
