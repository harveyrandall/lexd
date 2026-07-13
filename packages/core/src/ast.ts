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
  | { kind: 'union'; refs: TypeExpr[]; closed?: boolean; span?: SourceSpan }

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

export interface ErrorDecl extends AstNode {
  name: string
  description?: string
}

export type SchemaBody =
  | { kind: 'inline'; fields: Field[] }
  | { kind: 'type'; type: TypeExpr }

export interface IoBlock extends AstNode {
  kind: 'input' | 'output'
  encoding?: string
  schema?: SchemaBody
  description?: string
}

export interface ParamsBlock extends AstNode {
  kind: 'params'
  fields: Field[]
}

export interface MessageBlock extends AstNode {
  kind: 'message'
  schema: TypeExpr
  description?: string
}

export interface ErrorsBlock extends AstNode {
  kind: 'errors'
  errors: ErrorDecl[]
}

export interface PermissionEntry extends AstNode {
  resource: 'rpc' | 'repo'
  /** string props: aud; boolean: inheritAud; string[]: lxm, collection, action */
  props: Record<string, string | boolean | string[]>
}

export interface PermissionsBlock extends AstNode {
  kind: 'permissions'
  entries: PermissionEntry[]
}

export type TypeBlock =
  | ParamsBlock
  | IoBlock
  | MessageBlock
  | ErrorsBlock
  | PermissionsBlock

export interface TypeDecl extends AstNode {
  name: string
  attributes: Attribute[]
  /** object/record field body */
  fields: Field[]
  /** XRPC / permission-set sections */
  blocks: TypeBlock[]
  /** True when annotated with a primary attr */
  primary: boolean
  /** True when @token */
  isToken: boolean
  /** True when @scalar(...) */
  isScalar: boolean
}

export interface NamespaceDecl extends AstNode {
  name: string
  types: TypeDecl[]
}

export interface ImportDecl extends AstNode {
  module: string
  kind: 'named' | 'whole'
  bindings: Array<{
    local: string
    imported: string
  }>
}

export interface LexdFile extends AstNode {
  imports: ImportDecl[]
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

export const PRIMARY_ATTRS = new Set([
  'record',
  'object',
  'query',
  'procedure',
  'subscription',
  'permissionSet',
])

export const SECTION_NAMES = new Set([
  'params',
  'input',
  'output',
  'message',
  'errors',
  'permissions',
])
