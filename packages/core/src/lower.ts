import type {
  Attribute,
  AttrValue,
  Field,
  IoBlock,
  LexdFile,
  PermissionEntry,
  SchemaBody,
  TypeBlock,
  TypeDecl,
  TypeExpr,
} from './ast.js'
import type {
  CompiledLexicon,
  LexArray,
  LexFieldType,
  LexObject,
  LexParams,
  LexPermission,
  LexPermissionSet,
  LexPrimitive,
  LexProcedure,
  LexQuery,
  LexRecord,
  LexSubscription,
  LexToken,
  LexUnion,
  LexUserType,
  LexXrpcBody,
  LexXrpcError,
  LexiconDoc,
} from './lexicon.js'
import { LexdCompileError } from './errors.js'
import { ModuleRegistry, buildImportMap } from './registry.js'

export { LexdCompileError } from './errors.js'

interface TypeGroup {
  primary: TypeDecl
  secondaries: TypeDecl[]
  namespace: string
}

function attr(attrs: Attribute[], name: string): Attribute | undefined {
  return attrs.find((a) => a.name === name)
}

function stringArg(a: Attribute | undefined, index = 0): string | undefined {
  const v = a?.args[index]
  return typeof v === 'string' ? v : undefined
}

function numberArg(a: Attribute | undefined, index = 0): number | undefined {
  const v = a?.args[index]
  return typeof v === 'number' ? v : undefined
}

function arrayArg(a: Attribute | undefined, index = 0): AttrValue[] | undefined {
  const v = a?.args[index]
  return Array.isArray(v) ? v : undefined
}

function groupTypes(namespace: string, types: TypeDecl[]): TypeGroup[] {
  const groups: TypeGroup[] = []
  let current: TypeGroup | undefined

  for (const t of types) {
    if (t.primary) {
      current = { primary: t, secondaries: [], namespace }
      groups.push(current)
    } else if (current) {
      current.secondaries.push(t)
    } else {
      throw new LexdCompileError(
        `Type "${t.name}" in namespace "${namespace}" is not a primary and has no preceding primary type to attach to`,
      )
    }
  }

  return groups
}

function localDefNames(group: TypeGroup): Set<string> {
  const names = new Set<string>()
  names.add(group.primary.name)
  for (const s of group.secondaries) names.add(s.name)
  return names
}

function resolveRefName(
  name: string,
  locals: Set<string>,
  imports: Map<string, string>,
): string {
  if (name.startsWith('#')) return name
  if (name.includes('.')) return name
  const fromImport = imports.get(name)
  if (fromImport) return fromImport
  if (locals.has(name)) return `#${name}`
  throw new LexdCompileError(`Unknown type "${name}" (not a local def or import)`)
}

function applyConstraints(
  target: Record<string, unknown>,
  attributes: Attribute[],
  forArray: boolean,
): void {
  const description = stringArg(attr(attributes, 'description'))
  if (description !== undefined) target.description = description

  if (forArray) {
    const maxLength = numberArg(attr(attributes, 'maxLength'))
    const minLength = numberArg(attr(attributes, 'minLength'))
    if (maxLength !== undefined) target.maxLength = maxLength
    if (minLength !== undefined) target.minLength = minLength
    return
  }

  const format = stringArg(attr(attributes, 'format'))
  if (format !== undefined) target.format = format

  const maxLength = numberArg(attr(attributes, 'maxLength'))
  if (maxLength !== undefined) target.maxLength = maxLength

  const minLength = numberArg(attr(attributes, 'minLength'))
  if (minLength !== undefined) target.minLength = minLength

  const maxGraphemes = numberArg(attr(attributes, 'maxGraphemes'))
  if (maxGraphemes !== undefined) target.maxGraphemes = maxGraphemes

  const minGraphemes = numberArg(attr(attributes, 'minGraphemes'))
  if (minGraphemes !== undefined) target.minGraphemes = minGraphemes

  const minimum = numberArg(attr(attributes, 'minimum'))
  if (minimum !== undefined) target.minimum = minimum

  const maximum = numberArg(attr(attributes, 'maximum'))
  if (maximum !== undefined) target.maximum = maximum

  const maxSize = numberArg(attr(attributes, 'maxSize'))
  if (maxSize !== undefined) target.maxSize = maxSize

  const accept = attr(attributes, 'accept')
  if (accept) {
    const arr = arrayArg(accept, 0)
    if (arr) target.accept = arr.map(String)
    else if (accept.args.length > 0) target.accept = accept.args.map(String)
  }

  const def = attr(attributes, 'default')
  if (def && def.args[0] !== undefined) target.default = def.args[0]

  const cst = attr(attributes, 'const')
  if (cst && cst.args[0] !== undefined) target.const = cst.args[0]

  const enumAttr = attr(attributes, 'enum')
  if (enumAttr) {
    const arr = arrayArg(enumAttr, 0)
    if (arr) target.enum = arr
    else if (enumAttr.args.length > 0) target.enum = enumAttr.args
  }

  const known = attr(attributes, 'knownValues')
  if (known) {
    const arr = arrayArg(known, 0)
    if (arr) target.knownValues = arr.map(String)
    else target.knownValues = known.args.map(String)
  }
}

function typeExprToLex(
  expr: TypeExpr,
  attributes: Attribute[],
  locals: Set<string>,
  imports: Map<string, string>,
): LexFieldType {
  if (expr.kind === 'array') {
    const items = typeExprToLex(expr.element, [], locals, imports)
    const arr: LexArray = { type: 'array', items }
    applyConstraints(arr as unknown as Record<string, unknown>, attributes, true)
    return arr
  }

  if (expr.kind === 'union') {
    const refs = expr.refs.map((r) => {
      if (r.kind === 'ref') return resolveRefName(r.name, locals, imports)
      if (r.kind === 'primitive') {
        throw new LexdCompileError(`union() members must be refs, got primitive ${r.name}`)
      }
      throw new LexdCompileError(`union() members must be refs`)
    })
    const u: LexUnion = { type: 'union', refs }
    if (expr.closed) u.closed = true
    applyConstraints(u as unknown as Record<string, unknown>, attributes, false)
    return u
  }

  if (expr.kind === 'ref') {
    const ref: LexFieldType = {
      type: 'ref',
      ref: resolveRefName(expr.name, locals, imports),
    }
    applyConstraints(ref as unknown as Record<string, unknown>, attributes, false)
    return ref
  }

  const name = expr.name
  if (name === 'bytes') {
    const out: LexFieldType = { type: 'bytes' }
    applyConstraints(out as unknown as Record<string, unknown>, attributes, false)
    return out
  }
  if (name === 'cid-link') {
    const out: LexFieldType = { type: 'cid-link' }
    applyConstraints(out as unknown as Record<string, unknown>, attributes, false)
    return out
  }
  if (name === 'blob') {
    const out: LexFieldType = { type: 'blob' }
    applyConstraints(out as unknown as Record<string, unknown>, attributes, false)
    return out
  }
  if (name === 'unknown') {
    const out: LexFieldType = { type: 'unknown' }
    applyConstraints(out as unknown as Record<string, unknown>, attributes, false)
    return out
  }

  const prim: LexPrimitive = {
    type: name as 'string' | 'integer' | 'boolean',
  }
  applyConstraints(prim as unknown as Record<string, unknown>, attributes, false)
  return prim
}

function fieldsToObject(
  fields: Field[],
  attributes: Attribute[],
  locals: Set<string>,
  imports: Map<string, string>,
): LexObject {
  const properties: Record<string, LexFieldType> = {}
  const required: string[] = []
  const nullable: string[] = []

  for (const field of fields) {
    properties[field.name] = typeExprToLex(field.type, field.attributes, locals, imports)
    if (!field.optional) required.push(field.name)
    if (attr(field.attributes, 'nullable')) nullable.push(field.name)
  }

  const obj: LexObject = {
    type: 'object',
    properties,
  }
  if (required.length > 0) obj.required = required
  if (nullable.length > 0) obj.nullable = nullable

  const description = stringArg(attr(attributes, 'description'))
  if (description !== undefined) obj.description = description

  return obj
}

function fieldsToParams(
  fields: Field[],
  locals: Set<string>,
  imports: Map<string, string>,
): LexParams {
  const properties: Record<string, LexFieldType> = {}
  const required: string[] = []
  for (const field of fields) {
    properties[field.name] = typeExprToLex(field.type, field.attributes, locals, imports)
    if (!field.optional) required.push(field.name)
  }
  const params: LexParams = { type: 'params', properties }
  if (required.length > 0) params.required = required
  return params
}

function schemaBodyToLex(
  schema: SchemaBody,
  locals: Set<string>,
  imports: Map<string, string>,
): LexFieldType {
  if (schema.kind === 'inline') {
    return fieldsToObject(schema.fields, [], locals, imports)
  }
  return typeExprToLex(schema.type, [], locals, imports)
}

function ioBlockToLex(
  block: IoBlock,
  locals: Set<string>,
  imports: Map<string, string>,
): LexXrpcBody {
  if (!block.encoding) {
    throw new LexdCompileError(`${block.kind} block requires encoding: "..."`)
  }
  const body: LexXrpcBody = { encoding: block.encoding }
  if (block.schema) {
    body.schema = schemaBodyToLex(block.schema, locals, imports)
  }
  if (block.description) body.description = block.description
  return body
}

function findBlock<T extends TypeBlock['kind']>(
  blocks: TypeBlock[],
  kind: T,
): Extract<TypeBlock, { kind: T }> | undefined {
  return blocks.find((b) => b.kind === kind) as Extract<TypeBlock, { kind: T }> | undefined
}

function errorsFromBlocks(blocks: TypeBlock[]): LexXrpcError[] | undefined {
  const b = findBlock(blocks, 'errors')
  if (!b || b.errors.length === 0) return undefined
  return b.errors.map((e) => {
    const err: LexXrpcError = { name: e.name }
    if (e.description) err.description = e.description
    return err
  })
}

function permissionEntryToLex(entry: PermissionEntry): LexPermission {
  const perm: LexPermission = {
    type: 'permission',
    resource: entry.resource,
  }
  for (const [k, v] of Object.entries(entry.props)) {
    perm[k] = v
  }
  return perm
}

function typeToNamedDef(
  decl: TypeDecl,
  locals: Set<string>,
  imports: Map<string, string>,
): LexUserType {
  if (decl.isToken) {
    const tok: LexToken = { type: 'token' }
    const description = stringArg(attr(decl.attributes, 'description'))
    if (description !== undefined) tok.description = description
    return tok
  }
  return fieldsToObject(decl.fields, decl.attributes, locals, imports)
}

function primaryToMain(
  decl: TypeDecl,
  locals: Set<string>,
  imports: Map<string, string>,
): LexUserType {
  const description = stringArg(attr(decl.attributes, 'description'))

  if (attr(decl.attributes, 'record')) {
    const key = stringArg(attr(decl.attributes, 'record'), 0)
    if (!key) {
      throw new LexdCompileError(`@record() on "${decl.name}" requires a string key argument`)
    }
    const record: LexRecord = {
      type: 'record',
      key,
      record: fieldsToObject(decl.fields, [], locals, imports),
    }
    if (description !== undefined) record.description = description
    return record
  }

  if (attr(decl.attributes, 'object')) {
    return fieldsToObject(
      decl.fields,
      decl.attributes.filter((a) => a.name !== 'object'),
      locals,
      imports,
    )
  }

  if (attr(decl.attributes, 'query')) {
    const q: LexQuery = { type: 'query' }
    if (description !== undefined) q.description = description
    const params = findBlock(decl.blocks, 'params')
    if (params) q.parameters = fieldsToParams(params.fields, locals, imports)
    const output = findBlock(decl.blocks, 'output')
    if (output) q.output = ioBlockToLex(output, locals, imports)
    const errors = errorsFromBlocks(decl.blocks)
    if (errors) q.errors = errors
    return q
  }

  if (attr(decl.attributes, 'procedure')) {
    const p: LexProcedure = { type: 'procedure' }
    if (description !== undefined) p.description = description
    const params = findBlock(decl.blocks, 'params')
    if (params) p.parameters = fieldsToParams(params.fields, locals, imports)
    const input = findBlock(decl.blocks, 'input')
    if (input) p.input = ioBlockToLex(input, locals, imports)
    const output = findBlock(decl.blocks, 'output')
    if (output) p.output = ioBlockToLex(output, locals, imports)
    const errors = errorsFromBlocks(decl.blocks)
    if (errors) p.errors = errors
    return p
  }

  if (attr(decl.attributes, 'subscription')) {
    const message = findBlock(decl.blocks, 'message')
    if (!message) {
      throw new LexdCompileError(`@subscription "${decl.name}" requires a message { schema: ... } block`)
    }
    const schema = typeExprToLex(message.schema, [], locals, imports)
    if (schema.type !== 'union' && schema.type !== 'ref') {
      throw new LexdCompileError(`subscription message schema must be a union or ref`)
    }
    const sub: LexSubscription = {
      type: 'subscription',
      message: { schema },
    }
    if (description !== undefined) sub.description = description
    const params = findBlock(decl.blocks, 'params')
    if (params) sub.parameters = fieldsToParams(params.fields, locals, imports)
    const errors = errorsFromBlocks(decl.blocks)
    if (errors) sub.errors = errors
    return sub
  }

  if (attr(decl.attributes, 'permissionSet')) {
    const perms = findBlock(decl.blocks, 'permissions')
    if (!perms || perms.entries.length === 0) {
      throw new LexdCompileError(`@permissionSet "${decl.name}" requires a permissions { ... } block`)
    }
    const set: LexPermissionSet = {
      type: 'permission-set',
      permissions: perms.entries.map(permissionEntryToLex),
    }
    const title = stringArg(attr(decl.attributes, 'title'))
    const detail = stringArg(attr(decl.attributes, 'detail'))
    if (title !== undefined) set.title = title
    if (detail !== undefined) set.detail = detail
    if (description !== undefined) set.description = description
    const errors = errorsFromBlocks(decl.blocks)
    if (errors) set.errors = errors
    return set
  }

  throw new LexdCompileError(
    `Primary type "${decl.name}" needs @record, @object, @query, @procedure, @subscription, or @permissionSet`,
  )
}

function groupToDoc(group: TypeGroup, imports: Map<string, string>): LexiconDoc {
  const locals = localDefNames(group)
  const id = `${group.namespace}.${group.primary.name}`
  const defs: LexiconDoc['defs'] = {
    main: primaryToMain(group.primary, locals, imports),
  }

  for (const secondary of group.secondaries) {
    if (defs[secondary.name]) {
      throw new LexdCompileError(`Duplicate def name "${secondary.name}" in ${id}`)
    }
    defs[secondary.name] = typeToNamedDef(secondary, locals, imports)
  }

  return { lexicon: 1, id, defs }
}

function defsModuleToDoc(
  namespace: string,
  types: TypeDecl[],
  imports: Map<string, string>,
): LexiconDoc {
  const locals = new Set(types.map((t) => t.name))
  const defs: LexiconDoc['defs'] = {}
  for (const t of types) {
    if (defs[t.name]) {
      throw new LexdCompileError(`Duplicate def name "${t.name}" in ${namespace}`)
    }
    defs[t.name] = typeToNamedDef(t, locals, imports)
  }
  return { lexicon: 1, id: namespace, defs }
}

export function lower(
  file: LexdFile,
  registry: ModuleRegistry = new ModuleRegistry(),
): CompiledLexicon[] {
  registry.registerFile(file)
  const imports = buildImportMap(file, registry)
  const out: CompiledLexicon[] = []

  for (const ns of file.namespaces) {
    if (!ns.name.includes('.')) {
      throw new LexdCompileError(
        `Namespace "${ns.name}" looks invalid; NSIDs should be dotted (e.g. app.bsky.actor)`,
      )
    }

    const hasPrimary = ns.types.some((t) => t.primary)
    if (!hasPrimary) {
      if (ns.types.length === 0) {
        throw new LexdCompileError(`Namespace "${ns.name}" has no types`)
      }
      const doc = defsModuleToDoc(ns.name, ns.types, imports)
      out.push({
        id: doc.id,
        filename: `${doc.id}.json`,
        doc,
        sourceFile: file.filename,
      })
      continue
    }

    const groups = groupTypes(ns.name, ns.types)
    for (const group of groups) {
      const doc = groupToDoc(group, imports)
      out.push({
        id: doc.id,
        filename: `${doc.id}.json`,
        doc,
        sourceFile: file.filename,
      })
    }
  }

  return out
}
