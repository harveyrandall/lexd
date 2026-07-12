import type { LexiconDoc } from './lexicon.js'

/** Stable pretty-printed JSON for lexicon documents. */
export function emitJson(doc: LexiconDoc, pretty = true): string {
  if (!pretty) return JSON.stringify(doc)
  return `${JSON.stringify(doc, null, 2)}\n`
}

export function nestedOutputPath(id: string): string {
  return `${id.replaceAll('.', '/')}.json`
}
