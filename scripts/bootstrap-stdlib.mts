#!/usr/bin/env node
/**
 * Fetch upstream lexicon JSON from bluesky-social/atproto and write .lexd stdlib sources.
 *
 * Usage: pnpm stdlib:bootstrap
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decompile, lastSegment, toPascalCase, type LexiconDoc } from '../packages/core/src/decompile.ts'
import { lexdOutputPath } from '../packages/core/src/emit.ts'
import { STDLIB_MODULE_PREFIXES } from '../packages/core/src/stdlib-imports.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const stdlibRoot = join(repoRoot, 'packages/stdlib-atproto')
const manifestPath = join(stdlibRoot, 'manifest.json')
const srcDir = join(stdlibRoot, 'src')

interface Manifest {
  source: { baseUrl: string }
  lexicons: string[]
}

async function fetchLexicon(baseUrl: string, relPath: string): Promise<LexiconDoc> {
  const url = `${baseUrl}/${relPath}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as LexiconDoc
}

function collectMainImports(docs: LexiconDoc[]): Record<string, string> {
  const imports: Record<string, string> = {}
  for (const doc of docs) {
    if (doc.defs.main) {
      imports[doc.id] = toPascalCase(lastSegment(doc.id))
    }
  }
  return imports
}

function renderImportsFile(imports: Record<string, string>): string {
  const entries = Object.entries(imports)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, name]) => `  '${id}': '${name}',`)
    .join('\n')

  const prefixLines = STDLIB_MODULE_PREFIXES.map((p) => `  '${p}',`).join('\n')

  return `/**
 * Preferred import bindings and module prefixes for decompiler output.
 * Updated by \`pnpm stdlib:bootstrap\` when syncing from upstream lexicons.
 */
export const STDLIB_MAIN_IMPORTS: Record<string, string> = {
${entries}
}

/** NSID prefixes for modules that should be imported rather than fully qualified. */
export const STDLIB_MODULE_PREFIXES = [
${prefixLines}
] as const
`
}

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
  const { baseUrl } = manifest.source
  mkdirSync(srcDir, { recursive: true })

  const docs: LexiconDoc[] = await Promise.all(
    manifest.lexicons.map(async (rel) => {
      const doc = await fetchLexicon(baseUrl, rel)
      if (doc.lexicon !== 1 || !doc.id) {
        throw new Error(`Invalid lexicon in ${rel}`)
      }
      return doc
    }),
  )

  for (const doc of docs) {
    const source = decompile(doc)
    const dest = join(srcDir, lexdOutputPath(doc.id, 'flat'))
    writeFileSync(dest, source, 'utf8')
    console.log(`wrote ${dest}`)
  }

  const imports = collectMainImports(docs)
  const importsPath = join(repoRoot, 'packages/core/src/stdlib-imports.ts')
  writeFileSync(importsPath, renderImportsFile(imports), 'utf8')
  console.log(`updated ${importsPath}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
