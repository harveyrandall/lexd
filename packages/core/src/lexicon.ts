/** Subset of AT Proto Lexicon JSON types used by the emitter. */

export interface LexiconDoc {
  lexicon: 1
  id: string
  description?: string
  defs: Record<string, LexUserType>
}

export type LexUserType =
  | LexRecord
  | LexObject
  | LexToken
  | LexPrimitive
  | LexArray
  | LexBlob
  | LexRef
  | LexUnion
  | LexUnknown

export interface LexRecord {
  type: 'record'
  description?: string
  key: string
  record: LexObject
}

export interface LexObject {
  type: 'object'
  description?: string
  required?: string[]
  properties: Record<string, LexFieldType>
  nullable?: string[]
}

export type LexFieldType =
  | LexPrimitive
  | LexArray
  | LexObject
  | LexRef
  | LexUnion
  | LexBlob
  | LexUnknown
  | LexCidLink
  | LexBytes

export interface LexPrimitive {
  type: 'string' | 'integer' | 'boolean'
  description?: string
  format?: string
  maxLength?: number
  minLength?: number
  maxGraphemes?: number
  minGraphemes?: number
  knownValues?: string[]
  enum?: Array<string | number>
  default?: string | number | boolean
  const?: string | number | boolean
  minimum?: number
  maximum?: number
}

export interface LexBytes {
  type: 'bytes'
  description?: string
  minLength?: number
  maxLength?: number
}

export interface LexCidLink {
  type: 'cid-link'
  description?: string
}

export interface LexBlob {
  type: 'blob'
  description?: string
  accept?: string[]
  maxSize?: number
}

export interface LexArray {
  type: 'array'
  description?: string
  items: LexFieldType
  minLength?: number
  maxLength?: number
}

export interface LexRef {
  type: 'ref'
  description?: string
  ref: string
}

export interface LexUnion {
  type: 'union'
  description?: string
  refs: string[]
  closed?: boolean
}

export interface LexUnknown {
  type: 'unknown'
  description?: string
}

export interface LexToken {
  type: 'token'
  description?: string
}

export interface CompiledLexicon {
  /** Lexicon NSID */
  id: string
  /** Suggested output filename (flat layout) */
  filename: string
  doc: LexiconDoc
  /** Source file that produced this doc */
  sourceFile?: string
}
