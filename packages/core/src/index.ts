import { readFileSync } from 'node:fs'
import { parseLexd } from './parser.js'
import { lower } from './lower.js'
import { emitJson, nestedOutputPath } from './emit.js'
import type { CompiledLexicon, LexiconDoc } from './lexicon.js'
import type { LexdFile } from './ast.js'

export type { LexdFile } from './ast.js'
export type { CompiledLexicon, LexiconDoc } from './lexicon.js'
export { LexdSyntaxError } from './parser.js'
export { LexdCompileError } from './lower.js'
export { emitJson, nestedOutputPath } from './emit.js'
export { parseLexd } from './parser.js'
export { lower } from './lower.js'

/** Compile a .lexd source string into one or more lexicon documents. */
export function compile(source: string, filename?: string): CompiledLexicon[] {
  const ast = parseLexd(source, filename)
  return lower(ast)
}

/** Compile multiple .lexd files from disk. */
export function compileFiles(paths: string[]): CompiledLexicon[] {
  const results: CompiledLexicon[] = []
  for (const path of paths) {
    const source = readFileSync(path, 'utf8')
    results.push(...compile(source, path))
  }
  return results
}

/** Parse only (no lowering). */
export function parse(source: string, filename?: string): LexdFile {
  return parseLexd(source, filename)
}

/** Map of lexicon id → doc for convenience. */
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
