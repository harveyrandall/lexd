import type { LexiconDoc, LexUserType } from './lexicon.js'

/** Validate a compiled lexicon document; returns human-readable errors. */
export function validateLexiconDoc(doc: LexiconDoc): string[] {
  const errors: string[] = []
  if (doc.lexicon !== 1) {
    errors.push(`"${doc.id ?? '?'}": lexicon version must be 1`)
  }
  if (!doc.id || !doc.id.includes('.')) {
    errors.push('lexicon document requires a dotted NSID id')
  }
  if (!doc.defs || Object.keys(doc.defs).length === 0) {
    errors.push(`"${doc.id}": defs must not be empty`)
  }
  for (const [name, def] of Object.entries(doc.defs ?? {})) {
    errors.push(...validateDef(doc.id, name, def))
  }
  return errors
}

function validateDef(id: string, name: string, def: LexUserType): string[] {
  const errors: string[] = []
  if (!def || typeof def !== 'object' || !('type' in def)) {
    errors.push(`"${id}#${name}": def missing type`)
    return errors
  }
  if (name === 'main' && ['string', 'integer', 'boolean', 'array'].includes(def.type)) {
    errors.push(`"${id}#main": primary def cannot be type "${def.type}"`)
  }
  return errors
}

export function validateLexiconDocs(docs: LexiconDoc[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const doc of docs) {
    if (seen.has(doc.id)) {
      errors.push(`duplicate lexicon id "${doc.id}"`)
    }
    seen.add(doc.id)
    errors.push(...validateLexiconDoc(doc))
  }
  return errors
}
