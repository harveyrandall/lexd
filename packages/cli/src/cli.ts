#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Command } from 'commander'
import { glob } from 'glob'
import chokidar from 'chokidar'
import {
  compileFiles,
  emitJson,
  nestedOutputPath,
  type CompiledLexicon,
} from '@lexd/core'

const program = new Command()

program
  .name('lexd')
  .description('Compile AT Proto Lexicon DSL (.lexd) to lexicon JSON')
  .version('0.1.0')

program
  .command('compile')
  .argument('<patterns...>', 'Glob patterns for .lexd files')
  .option('-o, --out <dir>', 'Output directory', 'lexicons')
  .option('--layout <layout>', 'Output layout: flat | nested', 'flat')
  .option('-w, --watch', 'Watch for changes and recompile', false)
  .action(async (patterns: string[], opts: { out: string; layout: string; watch: boolean }) => {
    if (opts.layout !== 'flat' && opts.layout !== 'nested') {
      console.error(`Invalid --layout "${opts.layout}" (use flat or nested)`)
      process.exitCode = 1
      return
    }

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

program.parse()
