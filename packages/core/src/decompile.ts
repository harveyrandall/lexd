import { readFileSync } from 'node:fs'
import { STDLIB_MAIN_IMPORTS, STDLIB_MODULE_PREFIXES } from './stdlib-imports.js'
import type {
  LexFieldType,
  LexObject,
  LexParams,
  LexPermission,
  LexPermissionSet,
  LexProcedure,
  LexQuery,
  LexRecord,
  LexSubscription,
  LexToken,
  LexPrimitive,
  LexUserType,
  LexXrpcBody,
  LexXrpcError,
  LexiconDoc,
} from './lexicon.js'

const INDENT = '  '

/** Constraint / field attribute emission order (stable). */
const FIELD_ATTR_ORDER = [
  'description',
  'format',
  'maxGraphemes',
  'minGraphemes',
  'maxLength',
  'minLength',
  'minimum',
  'maximum',
  'maxSize',
  'accept',
  'default',
  'const',
  'enum',
  'knownValues',
] as const

interface ImportNeed {
  from: string
  name: string
  fragment?: string
}

interface DecompileCtx {
  id: string
  locals: Set<string>
  imports: Map<string, ImportNeed>
  refBindings: Map<string, string>
  /** Inline object fields hoisted to named secondary types (stable insertion order). */
  hoisted: Map<string, LexObject>
  inlineCounter: number
}

export function lastSegment(nsid: string): string {
  const i = nsid.lastIndexOf('.')
  return i >= 0 ? nsid.slice(i + 1) : nsid
}

function parentNamespace(nsid: string): string {
  const i = nsid.lastIndexOf('.')
  if (i < 0) throw new Error(`Invalid lexicon id "${nsid}"`)
  return nsid.slice(0, i)
}

export function toPascalCase(segment: string): string {
  if (!segment) return segment
  return segment.charAt(0).toUpperCase() + segment.slice(1)
}

function preferImportForRef(ref: string): boolean {
  if (ref.startsWith('#')) return false
  if (!ref.includes('.')) return false
  const base = ref.includes('#') ? ref.slice(0, ref.indexOf('#')) : ref
  if (STDLIB_MAIN_IMPORTS[base]) return true
  return STDLIB_MODULE_PREFIXES.some((prefix) => base.startsWith(prefix))
}

function uniqueLocalName(base: string, ctx: DecompileCtx): string {
  let name = base
  let n = 2
  while (ctx.locals.has(name) || ctx.hoisted.has(name) || ctx.imports.has(name)) {
    name = `${base}${n}`
    n += 1
  }
  return name
}

function hoistInlineObject(obj: LexObject, suggestedName: string, ctx: DecompileCtx): string {
  const base = toPascalCase(suggestedName) || 'Inline'
  const name = uniqueLocalName(base, ctx)
  ctx.hoisted.set(name, obj)
  ctx.locals.add(name)
  return name
}

function bindingForExternalRef(ref: string, ctx: DecompileCtx): string {
  const existing = ctx.refBindings.get(ref)
  if (existing) return existing

  let from: string
  let fragment: string | undefined
  let preferred: string

  if (ref.includes('#')) {
    const hash = ref.indexOf('#')
    from = ref.slice(0, hash)
    fragment = ref.slice(hash + 1)
    preferred = fragment
  } else {
    from = ref
    preferred = STDLIB_MAIN_IMPORTS[from] ?? toPascalCase(lastSegment(from))
  }

  let name = preferred
  let n = 2
  while (ctx.imports.has(name) || ctx.locals.has(name)) {
    name = `${preferred}${n}`
    n += 1
  }

  ctx.imports.set(name, { from, name, fragment })
  ctx.refBindings.set(ref, name)
  return name
}

function formatAttrValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatAttrValue(v)).join(', ')}]`
  }
  return JSON.stringify(value)
}

function emitAttr(name: string, value: unknown): string {
  if (
    (name === 'knownValues' || name === 'enum' || name === 'accept') &&
    Array.isArray(value)
  ) {
    return `@${name}(${value.map((v) => formatAttrValue(v)).join(', ')})`
  }
  return `@${name}(${formatAttrValue(value)})`
}

function collectFieldAttrs(
  field: LexFieldType,
  opts: { nullable?: boolean; forArray?: boolean } = {},
): string[] {
  const attrs: string[] = []
  const rec = field as unknown as Record<string, unknown>

  for (const key of FIELD_ATTR_ORDER) {
    if (opts.forArray && key !== 'description' && key !== 'maxLength' && key !== 'minLength') {
      continue
    }
    const v = rec[key]
    if (v === undefined) continue
    attrs.push(emitAttr(key, v))
  }

  if (opts.nullable) attrs.push('@nullable')
  return attrs
}

function emitAttrsPrefix(attrs: string[]): string {
  if (attrs.length === 0) return ''
  return `${attrs.join(' ')} `
}

function resolveRefExpr(ref: string, ctx: DecompileCtx): string {
  if (ref.startsWith('#')) {
    const local = ref.slice(1)
    if (ctx.locals.has(local)) return local
    return ref
  }
  if (!ref.includes('.')) {
    return ref
  }
  if (preferImportForRef(ref)) {
    return bindingForExternalRef(ref, ctx)
  }
  return ref
}

function emitTypeExpr(field: LexFieldType, ctx: DecompileCtx): string {
  switch (field.type) {
    case 'string':
    case 'integer':
    case 'boolean':
    case 'bytes':
    case 'cid-link':
    case 'blob':
    case 'unknown':
      return field.type
    case 'ref':
      return resolveRefExpr(field.ref, ctx)
    case 'array':
      return `${emitTypeExpr(field.items, ctx)}[]`
    case 'union': {
      const refs = field.refs.map((r) => {
        if (r.startsWith('#')) {
          const local = r.slice(1)
          return ctx.locals.has(local) ? `#${local}` : r
        }
        if (preferImportForRef(r)) return bindingForExternalRef(r, ctx)
        return r
      })
      const inner = `union(${refs.join(', ')})`
      return field.closed ? `closed ${inner}` : inner
    }
    case 'object': {
      ctx.inlineCounter += 1
      return hoistInlineObject(field, `Inline${ctx.inlineCounter}`, ctx)
    }
    default:
      return 'unknown'
  }
}

function emitFieldLine(
  name: string,
  field: LexFieldType,
  optional: boolean,
  nullable: boolean,
  ctx: DecompileCtx,
  indent: string,
): string {
  const opt = optional ? '?' : ''
  if (field.type === 'array') {
    const attrs = collectFieldAttrs(field, { nullable, forArray: true })
    return `${indent}${emitAttrsPrefix(attrs)}${name}${opt}: ${emitTypeExpr(field, ctx)}`
  }
  if (field.type === 'object') {
    const typeName = hoistInlineObject(field, name, ctx)
    const attrs = collectFieldAttrs(field, { nullable })
    return `${indent}${emitAttrsPrefix(attrs)}${name}${opt}: ${typeName}`
  }
  const attrs = collectFieldAttrs(field, { nullable })
  return `${indent}${emitAttrsPrefix(attrs)}${name}${opt}: ${emitTypeExpr(field, ctx)}`
}

function emitObjectFields(
  obj: LexObject | LexParams,
  ctx: DecompileCtx,
  indent: string,
): string[] {
  const required = new Set(obj.required ?? [])
  const nullable = new Set('nullable' in obj && obj.nullable ? obj.nullable : [])
  const lines: string[] = []
  for (const [name, field] of Object.entries(obj.properties)) {
    lines.push(
      emitFieldLine(name, field, !required.has(name), nullable.has(name), ctx, indent),
    )
  }
  return lines
}

function emitErrorsBlock(errors: LexXrpcError[], indent: string): string[] {
  const lines = [`${indent}errors {`]
  for (const err of errors) {
    if (err.description) {
      lines.push(`${indent}${INDENT}${err.name}: ${JSON.stringify(err.description)}`)
    } else {
      lines.push(`${indent}${INDENT}${err.name}`)
    }
  }
  lines.push(`${indent}}`)
  return lines
}

function emitSchemaBody(schema: LexFieldType, ctx: DecompileCtx, indent: string): string[] {
  if (schema.type === 'object') {
    const lines = [`${indent}schema {`]
    lines.push(...emitObjectFields(schema, ctx, indent + INDENT))
    lines.push(`${indent}}`)
    return lines
  }
  return [`${indent}schema: ${emitTypeExpr(schema, ctx)}`]
}

function emitIoBlock(
  kind: 'input' | 'output',
  body: LexXrpcBody,
  ctx: DecompileCtx,
  indent: string,
): string[] {
  const lines = [`${indent}${kind} {`]
  const inner = indent + INDENT
  if (body.description) {
    lines.push(`${inner}@description(${JSON.stringify(body.description)})`)
  }
  lines.push(`${inner}encoding: ${JSON.stringify(body.encoding)}`)
  if (body.schema) {
    lines.push(...emitSchemaBody(body.schema, ctx, inner))
  }
  lines.push(`${indent}}`)
  return lines
}

function emitParamsBlock(params: LexParams, ctx: DecompileCtx, indent: string): string[] {
  const lines = [`${indent}params {`]
  lines.push(...emitObjectFields(params, ctx, indent + INDENT))
  lines.push(`${indent}}`)
  return lines
}

function emitPermissionValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return `[${value.map((v) => emitPermissionValue(v)).join(', ')}]`
  }
  return JSON.stringify(value)
}

function emitPermissionsBlock(perms: LexPermission[], indent: string): string[] {
  const lines = [`${indent}permissions {`]
  for (const perm of perms) {
    lines.push(`${indent}${INDENT}${perm.resource} {`)
    for (const [key, value] of Object.entries(perm)) {
      if (key === 'type' || key === 'resource') continue
      lines.push(`${indent}${INDENT}${INDENT}${key}: ${emitPermissionValue(value)}`)
    }
    lines.push(`${indent}${INDENT}}`)
  }
  lines.push(`${indent}}`)
  return lines
}

function emitNamedObjectType(
  name: string,
  obj: LexObject,
  ctx: DecompileCtx,
  indent: string,
  typeAttrs: string[] = [],
): string[] {
  const lines: string[] = []
  for (const a of typeAttrs) lines.push(`${indent}${a}`)
  lines.push(`${indent}type ${name} {`)
  lines.push(...emitObjectFields(obj, ctx, indent + INDENT))
  lines.push(`${indent}}`)
  return lines
}

function emitTokenType(name: string, tok: LexToken, indent: string): string[] {
  const lines: string[] = [`${indent}@token`]
  if (tok.description) {
    lines.push(`${indent}@description(${JSON.stringify(tok.description)})`)
  }
  lines.push(`${indent}type ${name} {}`)
  return lines
}

function emitScalarType(name: string, prim: LexPrimitive, indent: string): string[] {
  const lines: string[] = [`${indent}@scalar(${JSON.stringify(prim.type)})`]
  const attrs = collectFieldAttrs(prim, {})
  for (const a of attrs) lines.push(`${indent}${a}`)
  lines.push(`${indent}type ${name} {}`)
  return lines
}

function emitSecondaryDef(
  name: string,
  def: LexUserType,
  ctx: DecompileCtx,
  indent: string,
): string[] {
  if (def.type === 'token') return emitTokenType(name, def, indent)
  if (def.type === 'string' || def.type === 'integer' || def.type === 'boolean') {
    return emitScalarType(name, def, indent)
  }
  if (def.type === 'object') {
    const typeAttrs: string[] = []
    if (def.description) {
      typeAttrs.push(`@description(${JSON.stringify(def.description)})`)
    }
    return emitNamedObjectType(name, def, ctx, indent, typeAttrs)
  }
  throw new Error(
    `Cannot decompile named def "${name}" in "${ctx.id}": unsupported type "${def.type}"`,
  )
}

function emitRecordMain(
  typeName: string,
  record: LexRecord,
  ctx: DecompileCtx,
  indent: string,
): string[] {
  const lines: string[] = [`${indent}@record(${JSON.stringify(record.key)})`]
  if (record.description) {
    lines.push(`${indent}@description(${JSON.stringify(record.description)})`)
  }
  lines.push(`${indent}type ${typeName} {`)
  lines.push(...emitObjectFields(record.record, ctx, indent + INDENT))
  lines.push(`${indent}}`)
  return lines
}

function emitObjectMain(
  typeName: string,
  obj: LexObject,
  ctx: DecompileCtx,
  indent: string,
): string[] {
  const typeAttrs = ['@object']
  if (obj.description) {
    typeAttrs.push(`@description(${JSON.stringify(obj.description)})`)
  }
  return emitNamedObjectType(typeName, obj, ctx, indent, typeAttrs)
}

function emitQueryMain(
  typeName: string,
  query: LexQuery,
  ctx: DecompileCtx,
  indent: string,
): string[] {
  const lines: string[] = [`${indent}@query`]
  if (query.description) {
    lines.push(`${indent}@description(${JSON.stringify(query.description)})`)
  }
  lines.push(`${indent}type ${typeName} {`)
  const inner = indent + INDENT
  if (query.parameters) lines.push(...emitParamsBlock(query.parameters, ctx, inner))
  if (query.output) lines.push(...emitIoBlock('output', query.output, ctx, inner))
  if (query.errors?.length) lines.push(...emitErrorsBlock(query.errors, inner))
  lines.push(`${indent}}`)
  return lines
}

function emitProcedureMain(
  typeName: string,
  proc: LexProcedure,
  ctx: DecompileCtx,
  indent: string,
): string[] {
  const lines: string[] = [`${indent}@procedure`]
  if (proc.description) {
    lines.push(`${indent}@description(${JSON.stringify(proc.description)})`)
  }
  lines.push(`${indent}type ${typeName} {`)
  const inner = indent + INDENT
  if (proc.parameters) lines.push(...emitParamsBlock(proc.parameters, ctx, inner))
  if (proc.input) lines.push(...emitIoBlock('input', proc.input, ctx, inner))
  if (proc.output) lines.push(...emitIoBlock('output', proc.output, ctx, inner))
  if (proc.errors?.length) lines.push(...emitErrorsBlock(proc.errors, inner))
  lines.push(`${indent}}`)
  return lines
}

function emitSubscriptionMain(
  typeName: string,
  sub: LexSubscription,
  ctx: DecompileCtx,
  indent: string,
): string[] {
  const lines: string[] = [`${indent}@subscription`]
  if (sub.description) {
    lines.push(`${indent}@description(${JSON.stringify(sub.description)})`)
  }
  lines.push(`${indent}type ${typeName} {`)
  const inner = indent + INDENT
  if (sub.parameters) lines.push(...emitParamsBlock(sub.parameters, ctx, inner))
  lines.push(`${inner}message {`)
  if (sub.message.description) {
    lines.push(
      `${inner}${INDENT}@description(${JSON.stringify(sub.message.description)})`,
    )
  }
  lines.push(`${inner}${INDENT}schema: ${emitTypeExpr(sub.message.schema, ctx)}`)
  lines.push(`${inner}}`)
  if (sub.errors?.length) lines.push(...emitErrorsBlock(sub.errors, inner))
  lines.push(`${indent}}`)
  return lines
}

function emitPermissionSetMain(
  typeName: string,
  set: LexPermissionSet,
  indent: string,
): string[] {
  const lines: string[] = [`${indent}@permissionSet`]
  if (set.description) {
    lines.push(`${indent}@description(${JSON.stringify(set.description)})`)
  }
  if (set.title) lines.push(`${indent}@title(${JSON.stringify(set.title)})`)
  if (set.detail) lines.push(`${indent}@detail(${JSON.stringify(set.detail)})`)
  lines.push(`${indent}type ${typeName} {`)
  lines.push(...emitPermissionsBlock(set.permissions, indent + INDENT))
  if (set.errors?.length) {
    lines.push(...emitErrorsBlock(set.errors, indent + INDENT))
  }
  lines.push(`${indent}}`)
  return lines
}

function emitPrimaryMain(
  typeName: string,
  main: LexUserType,
  ctx: DecompileCtx,
  indent: string,
): string[] {
  switch (main.type) {
    case 'record':
      return emitRecordMain(typeName, main, ctx, indent)
    case 'object':
      return emitObjectMain(typeName, main, ctx, indent)
    case 'query':
      return emitQueryMain(typeName, main, ctx, indent)
    case 'procedure':
      return emitProcedureMain(typeName, main, ctx, indent)
    case 'subscription':
      return emitSubscriptionMain(typeName, main, ctx, indent)
    case 'permission-set':
      return emitPermissionSetMain(typeName, main, indent)
    case 'token':
      return emitTokenType(typeName, main, indent)
    default:
      throw new Error(
        `Cannot decompile lexicon "${ctx.id}": unsupported main type "${(main as LexUserType).type}"`,
      )
  }
}

function emitImportLines(imports: Map<string, ImportNeed>): string[] {
  const list = [...imports.values()].sort((a, b) => {
    const c = a.from.localeCompare(b.from)
    if (c !== 0) return c
    return a.name.localeCompare(b.name)
  })
  const lines: string[] = []
  for (const imp of list) {
    if (imp.fragment) {
      if (imp.name === imp.fragment) {
        lines.push(`import { ${imp.fragment} } from ${JSON.stringify(imp.from)}`)
      } else {
        lines.push(
          `import { ${imp.fragment} as ${imp.name} } from ${JSON.stringify(imp.from)}`,
        )
      }
    } else {
      lines.push(`import { ${imp.name} } from ${JSON.stringify(imp.from)}`)
    }
  }
  return lines
}

function collectLocalNames(doc: LexiconDoc): Set<string> {
  const locals = new Set<string>()
  for (const name of Object.keys(doc.defs)) {
    if (name === 'main') {
      locals.add(lastSegment(doc.id))
    } else {
      locals.add(name)
    }
  }
  return locals
}

/**
 * Decompile a Lexicon JSON document to `.lexd` source.
 * Formatting is deterministic (2-space indent, stable attribute order).
 */
export function decompile(doc: LexiconDoc): string {
  if (doc.lexicon !== 1) {
    throw new Error(`Unsupported lexicon version: ${String(doc.lexicon)}`)
  }
  if (!doc.id) {
    throw new Error('Lexicon document missing id')
  }

  const locals = collectLocalNames(doc)
  const ctx: DecompileCtx = {
    id: doc.id,
    locals,
    imports: new Map(),
    refBindings: new Map(),
    hoisted: new Map(),
    inlineCounter: 0,
  }

  const bodyLines: string[] = []
  const indent = INDENT
  const hasMain = doc.defs.main !== undefined

  if (hasMain) {
    const typeName = lastSegment(doc.id)
    const ns = parentNamespace(doc.id)
    const main = doc.defs.main!

    const primaryLines = emitPrimaryMain(typeName, main, ctx, indent)
    const orderedSecondaries = Object.keys(doc.defs).filter((k) => k !== 'main')

    bodyLines.push(`namespace ${ns} {`)
    bodyLines.push(...primaryLines)
    for (const name of orderedSecondaries) {
      bodyLines.push('')
      bodyLines.push(...emitSecondaryDef(name, doc.defs[name]!, ctx, indent))
    }
    // Map iteration visits entries in insertion order, including nested hoists added mid-loop.
    for (const [hoistName, obj] of ctx.hoisted) {
      bodyLines.push('')
      bodyLines.push(...emitNamedObjectType(hoistName, obj, ctx, indent))
    }
    bodyLines.push('}')
  } else {
    bodyLines.push(`namespace ${doc.id} {`)
    const names = Object.keys(doc.defs)
    names.forEach((name, i) => {
      if (i > 0) bodyLines.push('')
      bodyLines.push(...emitSecondaryDef(name, doc.defs[name]!, ctx, indent))
    })
    // Map iteration visits entries in insertion order, including nested hoists added mid-loop.
    for (const [hoistName, obj] of ctx.hoisted) {
      bodyLines.push('')
      bodyLines.push(...emitNamedObjectType(hoistName, obj, ctx, indent))
    }
    bodyLines.push('}')
  }

  const importLines = emitImportLines(ctx.imports)
  const parts: string[] = []
  if (importLines.length > 0) {
    parts.push(importLines.join('\n'))
    parts.push('')
  }
  parts.push(bodyLines.join('\n'))
  parts.push('')
  return parts.join('\n')
}

/** Read a lexicon JSON file and decompile to `.lexd` source. */
export function decompileFile(path: string): string {
  const raw = readFileSync(path, 'utf8')
  const doc = JSON.parse(raw) as LexiconDoc
  return decompile(doc)
}
