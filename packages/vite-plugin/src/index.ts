import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { globSync } from 'glob'
import {
  compile,
  emitJson,
  nestedOutputPath,
  type CompiledLexicon,
} from '@lexd/core'

export interface LexdVitePluginOptions {
  /** Glob for .lexd sources (relative to project root). Default: all .lexd files */
  include?: string | string[]
  /** Directory to write lexicon JSON. Default: `lexicons` */
  outDir?: string
  /** Output path layout. Default: `flat` */
  layout?: 'flat' | 'nested'
  /**
   * When true, importing a .lexd file resolves to the compiled LexiconDoc
   * (as a JSON ESM module). Default: true
   */
  virtual?: boolean
}

function matchPatterns(root: string, include: string | string[]): string[] {
  const patterns = Array.isArray(include) ? include : [include]
  return patterns
    .flatMap((p) => {
      // Resolve non-glob prefix so patterns like ../examples/*.lexd work
      const absolute = p.startsWith('/') ? p : resolve(root, p)
      return globSync(absolute, { nodir: true, absolute: true })
    })
    .filter((f) => f.endsWith('.lexd'))
    .sort()
}

function writeCompiled(items: CompiledLexicon[], outDir: string, layout: 'flat' | 'nested') {
  mkdirSync(outDir, { recursive: true })
  for (const item of items) {
    const rel = layout === 'nested' ? nestedOutputPath(item.id) : item.filename
    const dest = join(outDir, rel)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, emitJson(item.doc), 'utf8')
  }
}

function compilePath(file: string): CompiledLexicon[] {
  const source = readFileSync(file, 'utf8')
  return compile(source, file)
}

export function lexdPlugin(options: LexdVitePluginOptions = {}): Plugin {
  const include = options.include ?? '**/*.lexd'
  const layout = options.layout ?? 'flat'
  const virtual = options.virtual ?? true
  let root = process.cwd()
  let outDir = resolve(root, options.outDir ?? 'lexicons')

  const compileAll = () => {
    const files = matchPatterns(root, include)
    const items = files.flatMap((f) => compilePath(f))
    writeCompiled(items, outDir, layout)
    return items
  }

  return {
    name: 'vite-plugin-lexd',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
      outDir = resolve(root, options.outDir ?? 'lexicons')
    },
    buildStart() {
      try {
        compileAll()
      } catch (err) {
        this.error(err instanceof Error ? err.message : String(err))
      }
    },
    configureServer(server) {
      const watchGlobs = Array.isArray(include) ? include : [include]
      server.watcher.add(watchGlobs.map((g) => resolve(root, g)))

      const onChange = (file: string) => {
        if (!file.endsWith('.lexd')) return
        try {
          compileAll()
          const virtualId = `\0lexd:${file}`
          const mod = server.moduleGraph.getModuleById(virtualId)
          if (mod) server.moduleGraph.invalidateModule(mod)
          for (const m of server.moduleGraph.getModulesByFile(file) ?? []) {
            server.moduleGraph.invalidateModule(m)
          }
          server.ws.send({ type: 'full-reload' })
        } catch (err) {
          server.config.logger.error(
            `[lexd] ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }

      server.watcher.on('add', onChange)
      server.watcher.on('change', onChange)
      server.watcher.on('unlink', onChange)
    },
    resolveId(id, importer) {
      if (!virtual) return null
      const clean = id.startsWith('\0lexd:') ? id.slice('\0lexd:'.length) : id
      if (!clean.endsWith('.lexd')) return null
      if (id.startsWith('\0lexd:')) return id
      const resolved = clean.startsWith('/')
        ? clean
        : importer
          ? resolve(dirname(importer), clean)
          : resolve(root, clean)
      return `\0lexd:${resolved}`
    },
    load(id) {
      if (!virtual || !id.startsWith('\0lexd:')) return null
      const file = id.slice('\0lexd:'.length)
      const items = compilePath(file)
      const payload = items.length === 1 ? items[0]!.doc : items.map((i) => i.doc)
      return `export default ${JSON.stringify(payload)}`
    },
  }
}

export default lexdPlugin
