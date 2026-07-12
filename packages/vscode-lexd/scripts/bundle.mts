#!/usr/bin/env node
/**
 * Bundle the language server + core into a self-contained VSIX payload.
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(here, '..')
const repoRoot = join(pkgRoot, '../..')

async function main(): Promise<void> {
  const serverEntry = join(repoRoot, 'packages/language-server/dist/server.js')
  const serverOut = join(pkgRoot, 'dist/server.bundle.js')
  const extensionOut = join(pkgRoot, 'dist/extension.js')

  await esbuild.build({
    entryPoints: [serverEntry],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: serverOut,
    banner: { js: '#!/usr/bin/env node' },
    logLevel: 'info',
  })

  await esbuild.build({
    entryPoints: [join(pkgRoot, 'src/extension.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: extensionOut,
    external: ['vscode'],
    logLevel: 'info',
  })

  const stdlibRoot = join(pkgRoot, 'stdlib')
  rmSync(stdlibRoot, { recursive: true, force: true })
  mkdirSync(join(stdlibRoot, 'atproto'), { recursive: true })
  mkdirSync(join(stdlibRoot, 'standard'), { recursive: true })
  cpSync(
    join(repoRoot, 'packages/stdlib-atproto/src'),
    join(stdlibRoot, 'atproto'),
    { recursive: true },
  )
  cpSync(
    join(repoRoot, 'packages/stdlib-standard/src'),
    join(stdlibRoot, 'standard'),
    { recursive: true },
  )
  cpSync(join(repoRoot, 'LICENSE'), join(pkgRoot, 'LICENSE'))

  console.log('bundled extension, language server, and stdlib for VSIX')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
