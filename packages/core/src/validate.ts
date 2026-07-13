import type { LexiconDoc, LexUserType } from './lexicon.js'

const VALID_PRIMARY_TYPES = new Set([
  'record',
  'query',
  'procedure',
  'subscription',
  'object',
  'token',
  'permission-set',
])

const NSID_RE = /^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+){2,}$/

/** Validate a compiled lexicon document; returns human-readable errors. */
export function validateLexiconDoc(doc: LexiconDoc): string[] {
  const errors: string[] = []
  const label = doc.id || '(unknown)'

  if (doc.lexicon !== 1) {
    errors.push(`"${label}": lexicon version must be 1`)
  }
  if (!doc.id || !NSID_RE.test(doc.id)) {
    errors.push(`"${label}": id is not a valid NSID`)
  }
  if (!doc.defs || Object.keys(doc.defs).length === 0) {
    errors.push(`"${label}": defs must not be empty`)
  }
  for (const [name, def] of Object.entries(doc.defs ?? {})) {
    errors.push(...validateDef(doc.id || label, name, def))
  }
  return errors
}

function validateDef(id: string, name: string, def: LexUserType): string[] {
  const errors: string[] = []
  if (!def || typeof def !== 'object' || !('type' in def)) {
    errors.push(`"${id}#${name}": def missing type`)
    return errors
  }
  if (name === 'main' && !VALID_PRIMARY_TYPES.has(def.type)) {
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
