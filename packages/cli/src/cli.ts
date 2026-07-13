#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Command, Option } from 'commander'
import { glob } from 'glob'
import chokidar from 'chokidar'
import {
  compileFiles,
  decompile,
  emitJson,
  lexdOutputPath,
  nestedOutputPath,
  type CompiledLexicon,
  type LexiconDoc,
} from '@lexd/core'

const program = new Command()

const layoutOption = new Option('--layout <layout>', 'Output layout: flat | nested')
  .choices(['flat', 'nested'])
  .default('flat')

program
  .name('lexd')
  .description('Compile AT Proto Lexicon DSL (.lexd) to lexicon JSON')
  .version('0.1.0')

program
  .command('compile')
  .argument('<patterns...>', 'Glob patterns for .lexd files')
  .option('-o, --out <dir>', 'Output directory', 'lexicons')
  .addOption(layoutOption)
  .option('-w, --watch', 'Watch for changes and recompile', false)
  .action(async (patterns: string[], opts: { out: string; layout: 'flat' | 'nested'; watch: boolean }) => {
    const run = async () => {
      const files = (
        await Promise.all(patterns.map((p) => glob(p, { nodir: true, absolute: true })))
      )
        .flat()
        .filter((f) => f.endsWith('.lexd'))
        .sort()

      if (files.length === 0) {
        console.error('No .lexd files matched')
        process.exitCode = 1
        return
      }

      let compiled: CompiledLexicon[]
      try {
        compiled = compileFiles(files)
      } catch (err) {
        console.error(err instanceof Error ? err.message : err)
        process.exitCode = 1
        return
      }

      const outDir = resolve(opts.out)
      mkdirSync(outDir, { recursive: true })

      for (const item of compiled) {
        const rel =
          opts.layout === 'nested' ? nestedOutputPath(item.id) : item.filename
        const dest = join(outDir, rel)
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, emitJson(item.doc), 'utf8')
        console.log(`wrote ${dest}`)
      }
    }

    await run()

    if (opts.watch) {
      const watcher = chokidar.watch(patterns, { ignoreInitial: true })
      const rebuild = async () => {
        console.log('change detected, recompiling…')
        await run()
      }
      watcher.on('add', rebuild)
      watcher.on('change', rebuild)
      watcher.on('unlink', rebuild)
      console.log('watching for changes…')
    }
  })

async function collectJsonFiles(target: string): Promise<string[]> {
  const abs = resolve(target)
  if (!existsSync(abs)) {
    throw new Error(`Path not found: ${target}`)
  }
  const st = statSync(abs)
  if (st.isFile()) {
    if (!abs.endsWith('.json')) {
      throw new Error(`Expected a .json file: ${target}`)
    }
    return [abs]
  }
  if (!st.isDirectory()) {
    throw new Error(`Not a file or directory: ${target}`)
  }
  return glob('**/*.json', { cwd: abs, absolute: true, nodir: true }).then((files) =>
    files.sort(),
  )
}

program
  .command('decompile')
  .argument('<file|dir>', 'Lexicon JSON file or directory of JSON files')
  .option('-o, --out <dir>', 'Output directory for .lexd files', 'lexd-out')
  .addOption(new Option('--layout <layout>', 'Output layout: flat | nested').choices(['flat', 'nested']).default('flat'))
  .action(async (target: string, opts: { out: string; layout: 'flat' | 'nested' }) => {
    let files: string[]
    try {
      files = await collectJsonFiles(target)
    } catch (err) {
      console.error(err instanceof Error ? err.message : err)
      process.exitCode = 1
      return
    }

    if (files.length === 0) {
      console.error('No .json files found')
      process.exitCode = 1
      return
    }

    const outDir = resolve(opts.out)
    const layout = opts.layout as 'flat' | 'nested'
    mkdirSync(outDir, { recursive: true })

    for (const file of files) {
      let doc: LexiconDoc
      try {
        doc = JSON.parse(readFileSync(file, 'utf8')) as LexiconDoc
      } catch (err) {
        console.error(`Failed to parse ${file}: ${err instanceof Error ? err.message : err}`)
        process.exitCode = 1
        continue
      }

      if (!doc?.id || doc.lexicon !== 1) {
        console.error(`Skipping ${file}: not a lexicon document (need lexicon:1 and id)`)
        continue
      }

      let source: string
      try {
        source = decompile(doc)
      } catch (err) {
        console.error(`Failed to decompile ${file}: ${err instanceof Error ? err.message : err}`)
        process.exitCode = 1
        continue
      }

      const rel = lexdOutputPath(doc.id, layout)
      const dest = join(outDir, rel)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, source, 'utf8')
      console.log(`wrote ${dest}`)
    }
  })

program.parse()
