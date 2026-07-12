import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLexd } from './parser.js'
import { lower } from './lower.js'
import { emitJson, lexdOutputPath, nestedOutputPath } from './emit.js'
import { ModuleRegistry } from './registry.js'
import type { CompiledLexicon, LexiconDoc } from './lexicon.js'
import type { LexdFile } from './ast.js'

export type {
  LexdFile,
  SourceSpan,
  TypeDecl,
  Field,
  ImportDecl,
  TypeExpr,
  Attribute,
  NamespaceDecl,
  TypeBlock,
  PrimitiveName,
} from './ast.js'
export {
  PRIMITIVES,
  PRIMARY_ATTRS,
  SECTION_NAMES,
} from './ast.js'

/** Known constraint / meta attribute names for editor completion. */
export const CONSTRAINT_ATTRS = [
  'description',
  'format',
  'maxLength',
  'minLength',
  'maxGraphemes',
  'minGraphemes',
  'minimum',
  'maximum',
  'maxSize',
  'accept',
  'default',
  'const',
  'enum',
  'knownValues',
  'nullable',
  'title',
  'detail',
  'token',
  'scalar',
] as const

export type { CompiledLexicon, LexiconDoc } from './lexicon.js'
export { LexdSyntaxError } from './parser.js'
export { LexdCompileError } from './errors.js'
export { emitJson, nestedOutputPath, lexdOutputPath } from './emit.js'
export { decompile, decompileFile } from './decompile.js'
export { planLexCodegen, tryAtprotoLexCodegen } from './codegen.js'
export type { LexCodegenOptions, LexCodegenArtifact, LexCodegenPlan } from './codegen.js'
export { validateLexiconDoc, validateLexiconDocs } from './validate.js'
export { parseLexd } from './parser.js'
export { lower } from './lower.js'
export { ModuleRegistry, buildImportMap } from './registry.js'
export type { ModuleExport } from './registry.js'

const require = createRequire(import.meta.url)

const STDLIB_PACKAGES = ['@lexd/stdlib-atproto', '@lexd/stdlib-standard'] as const

function walkLexdFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walkLexdFiles(p, out)
    else if (name.endsWith('.lexd')) out.push(p)
  }
  return out
}

/** Locate bundled stdlib .lexd files via package exports / package root. */
export function discoverStdlibLexdFiles(
  fromDir: string = process.cwd(),
  extraRoots: string[] = [],
): string[] {
  const coreDir = dirname(fileURLToPath(import.meta.url))
  const searchPaths = [
    fromDir,
    coreDir,
    join(coreDir, '..'),
    join(coreDir, '../..'),
  ]
  const found: string[] = []
  for (const pkg of STDLIB_PACKAGES) {
    try {
      const pkgJson = require.resolve(`${pkg}/package.json`, { paths: searchPaths })
      const root = dirname(pkgJson)
      const pkgMeta = JSON.parse(readFileSync(pkgJson, 'utf8')) as { lexd?: string }
      const srcDir = pkgMeta.lexd ? join(root, pkgMeta.lexd) : join(root, 'src')
      found.push(...walkLexdFiles(srcDir))
    } catch {
      // package not installed — skip
    }
  }
  for (const root of extraRoots) {
    found.push(...walkLexdFiles(root))
  }
  return [...new Set(found)].sort()
}

export interface CompileOptions {
  /** Extra .lexd paths to register for imports (e.g. stdlib) without requiring them in the result set filter */
  dependencyPaths?: string[]
  /**
   * When true (default for compileFiles), also discover @lexd/stdlib-* packages.
   */
  includeStdlib?: boolean
  /** Working directory for stdlib resolution */
  cwd?: string
}

function parsePath(path: string): LexdFile {
  return parseLexd(readFileSync(path, 'utf8'), path)
}

/**
 * Compile source text. For imports to resolve, pass a registry already
 * populated via compileProject / compileFiles, or only use local defs.
 */
export function compile(
  source: string,
  filename?: string,
  registry?: ModuleRegistry,
): CompiledLexicon[] {
  const ast = parseLexd(source, filename)
  const reg = registry ?? new ModuleRegistry()
  if (!registry) reg.registerFile(ast)
  return lower(ast, reg)
}

/** Multi-file compile with shared registry and optional stdlib. */
export function compileFiles(
  paths: string[],
  options: CompileOptions = {},
): CompiledLexicon[] {
  const cwd = options.cwd ?? process.cwd()
  const includeStdlib = options.includeStdlib !== false
  const depPaths = [
    ...(options.dependencyPaths ?? []),
    ...(includeStdlib ? discoverStdlibLexdFiles(cwd) : []),
  ]

  const uniquePaths = [...new Set([...depPaths, ...paths])].sort()
  const files = uniquePaths.map(parsePath)

  const registry = new ModuleRegistry()
  for (const f of files) registry.registerFile(f)

  const pathSet = new Set(paths.map((p) => p))
  const results: CompiledLexicon[] = []
  for (const f of files) {
    // Always lower for side-effect-free output; filter to requested paths
    // but still emit stdlib if it was explicitly in paths
    const compiled = lower(f, registry)
    if (!f.filename || pathSet.has(f.filename)) {
      results.push(...compiled)
    }
  }
  return results
}

/**
 * Compile a project: all source paths plus stdlib deps registered;
 * returns every lexicon from the source paths (not silent stdlib unless listed).
 */
export function compileProject(
  sourcePaths: string[],
  options: CompileOptions = {},
): CompiledLexicon[] {
  return compileFiles(sourcePaths, options)
}

export function parse(source: string, filename?: string): LexdFile {
  return parseLexd(source, filename)
}

export function compileToMap(source: string, filename?: string): Map<string, LexiconDoc> {
  const map = new Map<string, LexiconDoc>()
  for (const item of compile(source, filename)) {
    map.set(item.id, item.doc)
  }
  return map
}

export function docsEqual(a: LexiconDoc, b: LexiconDoc): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Helper for tests / tooling that need the package directory. */
export function corePackageDir(): string {
  return dirname(fileURLToPath(import.meta.url))
}
