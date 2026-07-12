/** Source location for diagnostics. */
export interface SourceSpan {
  startOffset: number
  endOffset: number
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export interface AstNode {
  span?: SourceSpan
}

export type AttrValue = string | number | boolean | Array<string | number | boolean>

export interface Attribute extends AstNode {
  name: string
  args: AttrValue[]
}

export type TypeExpr =
  | { kind: 'primitive'; name: PrimitiveName; span?: SourceSpan }
  | { kind: 'array'; element: TypeExpr; span?: SourceSpan }
  | { kind: 'ref'; name: string; span?: SourceSpan }
  | { kind: 'union'; refs: TypeExpr[]; span?: SourceSpan }

export type PrimitiveName =
  | 'string'
  | 'integer'
  | 'boolean'
  | 'bytes'
  | 'cid-link'
  | 'blob'
  | 'unknown'

export interface Field extends AstNode {
  name: string
  optional: boolean
  type: TypeExpr
  attributes: Attribute[]
}

export interface TypeDecl extends AstNode {
  name: string
  attributes: Attribute[]
  fields: Field[]
  /** True when annotated with a primary like @record */
  primary: boolean
}

export interface NamespaceDecl extends AstNode {
  name: string
  types: TypeDecl[]
}

export interface LexdFile extends AstNode {
  namespaces: NamespaceDecl[]
  filename?: string
}

export const PRIMITIVES = new Set<string>([
  'string',
  'integer',
  'boolean',
  'bytes',
  'cid-link',
  'blob',
  'unknown',
])
