#!/usr/bin/env node
/**
 * Release vscode-lexd to the VS Code Marketplace.
 *
 * Runs build → test → package:vsix → vsce publish (with --no-dependencies for pnpm monorepos).
 *
 * Usage (from repo root):
 *   pnpm release:vscode              # patch bump (default)
 *   pnpm release:vscode minor
 *   pnpm release:vscode 0.1.2        # explicit version
 *
 * Or from packages/vscode-lexd:
 *   pnpm release
 *   pnpm release:patch
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const vscodeLexdRoot = join(repoRoot, 'packages/vscode-lexd')

const SEMVER_EXPLICIT = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/

function isValidTarget(target: string): boolean {
  return SEMVER_EXPLICIT.test(target) || target === 'patch' || target === 'minor' || target === 'major'
}

function run(label: string, cmd: string, args: string[], cwd = repoRoot): void {
  console.log(`\n▶ ${label}\n`)
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const target = process.argv[2] ?? 'patch'

if (!isValidTarget(target)) {
  console.error(
    `Unknown release target: ${target}\nUse patch, minor, major, or an explicit semver (e.g. 0.1.2).`,
  )
  process.exit(1)
}

run('build', 'pnpm', ['build'])
run('test', 'pnpm', ['test'])
run('package:vsix', 'pnpm', ['package:vsix'])

if (SEMVER_EXPLICIT.test(target)) {
  run(
    `publish ${target}`,
    'pnpm',
    ['exec', 'vsce', 'publish', target, '--no-dependencies'],
    vscodeLexdRoot,
  )
} else if (target === 'patch' || target === 'minor' || target === 'major') {
  run(`publish ${target}`, 'pnpm', ['run', `vscode:publish:${target}`], vscodeLexdRoot)
}

console.log('\n✓ vscode-lexd release complete')
