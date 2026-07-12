import type {
  Attribute,
  AttrValue,
  Field,
  LexdFile,
  TypeDecl,
  TypeExpr,
} from './ast.js'
import type {
  CompiledLexicon,
  LexArray,
  LexFieldType,
  LexObject,
  LexPrimitive,
  LexRecord,
  LexiconDoc,
} from './lexicon.js'

export class LexdCompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LexdCompileError'
  }
}

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

function boolArg(a: Attribute | undefined, index = 0): boolean | undefined {
  const v = a?.args[index]
  return typeof v === 'boolean' ? v : undefined
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
        `Type "${t.name}" in namespace "${namespace}" is not a primary (@record) and has no preceding primary type to attach to`,
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

function resolveRefName(name: string, locals: Set<string>): string {
  if (name.startsWith('#')) return name
  if (name.includes('.')) {
    // already NSID or NSID#frag
    return name
  }
  // bare identifier → local fragment
  if (locals.has(name) || true) {
    return `#${name}`
  }
  return `#${name}`
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
): LexFieldType {
  if (expr.kind === 'array') {
    const items = typeExprToLex(expr.element, [], locals)
    const arr: LexArray = { type: 'array', items }
    applyConstraints(arr as unknown as Record<string, unknown>, attributes, true)
    return arr
  }

  if (expr.kind === 'union') {
    const refs = expr.refs.map((r) => {
      if (r.kind === 'ref') return resolveRefName(r.name, locals)
      if (r.kind === 'primitive') {
        throw new LexdCompileError(`union() members must be refs, got primitive ${r.name}`)
      }
      throw new LexdCompileError(`union() members must be refs`)
    })
    const u: LexFieldType = { type: 'union', refs }
    applyConstraints(u as unknown as Record<string, unknown>, attributes, false)
    return u
  }

  if (expr.kind === 'ref') {
    const ref: LexFieldType = {
      type: 'ref',
      ref: resolveRefName(expr.name, locals),
    }
    applyConstraints(ref as unknown as Record<string, unknown>, attributes, false)
    return ref
  }

  // primitive
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

function fieldsToObject(fields: Field[], attributes: Attribute[], locals: Set<string>): LexObject {
  const properties: Record<string, LexFieldType> = {}
  const required: string[] = []

  for (const field of fields) {
    properties[field.name] = typeExprToLex(field.type, field.attributes, locals)
    if (!field.optional) required.push(field.name)
  }

  const obj: LexObject = {
    type: 'object',
    properties,
  }
  if (required.length > 0) obj.required = required

  const description = stringArg(attr(attributes, 'description'))
  if (description !== undefined) obj.description = description

  return obj
}

function typeToObjectDef(decl: TypeDecl, locals: Set<string>): LexObject {
  return fieldsToObject(decl.fields, decl.attributes, locals)
}

function groupToDoc(group: TypeGroup): LexiconDoc {
  const locals = localDefNames(group)
  const recordAttr = attr(group.primary.attributes, 'record')
  if (!recordAttr) {
    throw new LexdCompileError(`Primary type "${group.primary.name}" is missing @record`)
  }
  const key = stringArg(recordAttr, 0)
  if (!key) {
    throw new LexdCompileError(`@record() on "${group.primary.name}" requires a string key argument`)
  }

  const id = `${group.namespace}.${group.primary.name}`
  const recordObj = fieldsToObject(group.primary.fields, [], locals)

  const record: LexRecord = {
    type: 'record',
    key,
    record: recordObj,
  }
  const typeDesc = stringArg(attr(group.primary.attributes, 'description'))
  if (typeDesc !== undefined) record.description = typeDesc

  const defs: LexiconDoc['defs'] = {
    main: record,
  }

  for (const secondary of group.secondaries) {
    if (defs[secondary.name]) {
      throw new LexdCompileError(`Duplicate def name "${secondary.name}" in ${id}`)
    }
    defs[secondary.name] = typeToObjectDef(secondary, locals)
  }

  const doc: LexiconDoc = {
    lexicon: 1,
    id,
    defs,
  }

  return doc
}

export function lower(file: LexdFile): CompiledLexicon[] {
  const out: CompiledLexicon[] = []

  for (const ns of file.namespaces) {
    if (!ns.name.includes('.')) {
      throw new LexdCompileError(
        `Namespace "${ns.name}" looks invalid; NSIDs should be dotted (e.g. app.bsky.actor)`,
      )
    }
    const groups = groupTypes(ns.name, ns.types)
    for (const group of groups) {
      const doc = groupToDoc(group)
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
