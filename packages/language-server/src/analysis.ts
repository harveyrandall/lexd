import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CONSTRAINT_ATTRS,
  LexdCompileError,
  LexdSyntaxError,
  ModuleRegistry,
  PRIMITIVES,
  PRIMARY_ATTRS,
  SECTION_NAMES,
  buildImportMap,
  discoverStdlibLexdFiles,
  lower,
  parseLexd,
  type Attribute,
  type Field,
  type ImportDecl,
  type LexdFile,
  type SourceSpan,
  type TypeDecl,
  type TypeExpr,
} from '@lexd/core'

export interface DiagnosticInfo {
  message: string
  severity: 'error' | 'warning'
  span?: SourceSpan
}

export interface SymbolLocation {
  uri: string
  span: SourceSpan
  detail?: string
}

export interface AnalyzedDocument {
  uri: string
  path: string
  text: string
  ast: LexdFile | null
  diagnostics: DiagnosticInfo[]
  /** Local type name → declaration (last wins). */
  localTypes: Map<string, TypeDecl>
  /** Import local binding → module/imported metadata. */
  imports: Map<string, { module: string; imported: string; decl: ImportDecl }>
  /** Resolved import local → lexicon ref when registry is available. */
  importRefs: Map<string, string>
}

export interface WorkspaceIndex {
  /** Module NSID → source file path + type decls for defs. */
  modules: Map<string, { path: string; types: Map<string, TypeDecl>; file: LexdFile }>
  registry: ModuleRegistry
}

function walkLexdFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue
    const p = join(dir, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) walkLexdFiles(p, out)
    else if (name.endsWith('.lexd')) out.push(p)
  }
  return out
}

export function uriToPath(uri: string): string {
  if (uri.startsWith('file://')) {
    return fileURLToPath(uri)
  }
  return uri
}

export function pathToUri(path: string): string {
  if (path.startsWith('file://')) return path
  // Ensure absolute file URI
  const abs = path.startsWith('/') ? path : join(process.cwd(), path)
  return `file://${abs}`
}

function registerModulesFromFile(
  file: LexdFile,
  path: string,
  modules: Map<string, { path: string; types: Map<string, TypeDecl>; file: LexdFile }>,
): void {
  for (const ns of file.namespaces) {
    const primaries = ns.types.filter((t) => t.primary)
    if (primaries.length === 0) {
      const types = new Map(ns.types.map((t) => [t.name, t]))
      modules.set(ns.name, { path, types, file })
      continue
    }
    let currentId: string | undefined
    let currentTypes = new Map<string, TypeDecl>()
    for (const t of ns.types) {
      if (t.primary) {
        currentId = `${ns.name}.${t.name}`
        currentTypes = new Map([['main', t]])
        modules.set(currentId, { path, types: currentTypes, file })
      } else if (currentId) {
        currentTypes.set(t.name, t)
      }
    }
  }
}

/** Build NSID → path index from workspace roots + stdlib. */
export function buildWorkspaceIndex(workspaceFolders: string[]): WorkspaceIndex {
  const modules = new Map<string, { path: string; types: Map<string, TypeDecl>; file: LexdFile }>()
  const registry = new ModuleRegistry()
  const roots = workspaceFolders.length > 0 ? workspaceFolders : [process.cwd()]
  const paths = new Set<string>()

  for (const root of roots) {
    for (const p of discoverStdlibLexdFiles(root)) paths.add(p)
    for (const rel of ['examples', 'packages', 'src', 'lexd']) {
      const dir = join(root, rel)
      if (existsSync(dir)) {
        for (const p of walkLexdFiles(dir)) paths.add(p)
      }
    }
  }

  for (const path of [...paths].sort()) {
    try {
      const source = readFileSync(path, 'utf8')
      const file = parseLexd(source, path)
      registry.registerFile(file)
      registerModulesFromFile(file, path, modules)
    } catch {
      // skip unparseable files in the index
    }
  }

  return { modules, registry }
}

export function analyzeDocument(
  uri: string,
  text: string,
  workspace?: WorkspaceIndex,
): AnalyzedDocument {
  const path = uriToPath(uri)
  const diagnostics: DiagnosticInfo[] = []
  let ast: LexdFile | null = null
  const localTypes = new Map<string, TypeDecl>()
  const imports = new Map<string, { module: string; imported: string; decl: ImportDecl }>()
  const importRefs = new Map<string, string>()

  try {
    ast = parseLexd(text, path)
  } catch (err) {
    if (err instanceof LexdSyntaxError) {
      diagnostics.push({
        message: err.message,
        severity: 'error',
        span: err.span,
      })
      return { uri, path, text, ast: null, diagnostics, localTypes, imports, importRefs }
    }
    diagnostics.push({
      message: err instanceof Error ? err.message : String(err),
      severity: 'error',
    })
    return { uri, path, text, ast: null, diagnostics, localTypes, imports, importRefs }
  }

  for (const ns of ast.namespaces) {
    for (const t of ns.types) localTypes.set(t.name, t)
  }
  for (const imp of ast.imports) {
    for (const b of imp.bindings) {
      imports.set(b.local, {
        module: imp.module,
        imported: imp.kind === 'whole' ? 'main' : b.imported,
        decl: imp,
      })
    }
  }

  const registry = workspace?.registry ?? new ModuleRegistry()
  if (!workspace) {
    registry.registerFile(ast)
    // Best-effort stdlib for single-file analysis
    try {
      const cwd = dirname(path)
      for (const p of discoverStdlibLexdFiles(cwd)) {
        try {
          registry.registerFile(parseLexd(readFileSync(p, 'utf8'), p))
        } catch {
          /* skip */
        }
      }
    } catch {
      /* skip */
    }
  } else {
    // Ensure current (possibly unsaved) file is registered on top of workspace
    registry.registerFile(ast)
  }

  try {
    const refs = buildImportMap(ast, registry)
    for (const [k, v] of refs) importRefs.set(k, v)
    lower(ast, registry)
  } catch (err) {
    if (err instanceof LexdCompileError || err instanceof LexdSyntaxError) {
      diagnostics.push({
        message: err.message,
        severity: 'error',
        span: err instanceof LexdSyntaxError ? err.span : undefined,
      })
    } else {
      diagnostics.push({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }

  return { uri, path, text, ast, diagnostics, localTypes, imports, importRefs }
}

export function formatTypeExpr(type: TypeExpr): string {
  switch (type.kind) {
    case 'primitive':
      return type.name
    case 'array':
      return `${formatTypeExpr(type.element)}[]`
    case 'ref':
      return type.name
    case 'union': {
      const closed = type.closed ? 'closed ' : ''
      return `${closed}union(${type.refs.map(formatTypeExpr).join(', ')})`
    }
  }
}

export function formatAttributes(attrs: Attribute[]): string {
  if (attrs.length === 0) return ''
  return attrs
    .map((a) => {
      if (a.args.length === 0) return `@${a.name}`
      const args = a.args.map((v) => JSON.stringify(v)).join(', ')
      return `@${a.name}(${args})`
    })
    .join(' ')
}

export function offsetAt(text: string, line: number, character: number): number {
  const lines = text.split('\n')
  let offset = 0
  for (let i = 0; i < line && i < lines.length; i++) {
    offset += (lines[i]?.length ?? 0) + 1
  }
  return offset + character
}

export function positionAt(text: string, offset: number): { line: number; character: number } {
  let line = 0
  let character = 0
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++
      character = 0
    } else {
      character++
    }
  }
  return { line, character }
}

export function spanContains(span: SourceSpan, offset: number): boolean {
  return offset >= span.startOffset && offset <= span.endOffset
}

export function wordAt(text: string, offset: number): { word: string; start: number; end: number } {
  let start = offset
  let end = offset
  while (start > 0 && /[A-Za-z0-9_#.-]/.test(text[start - 1]!)) start--
  while (end < text.length && /[A-Za-z0-9_#.-]/.test(text[end]!)) end++
  return { word: text.slice(start, end), start, end }
}

function findTypeExprAt(type: TypeExpr, offset: number): TypeExpr | null {
  if (type.span && spanContains(type.span, offset)) {
    if (type.kind === 'array') {
      const inner = findTypeExprAt(type.element, offset)
      return inner ?? type
    }
    if (type.kind === 'union') {
      for (const r of type.refs) {
        const hit = findTypeExprAt(r, offset)
        if (hit) return hit
      }
    }
    return type
  }
  if (type.kind === 'array') return findTypeExprAt(type.element, offset)
  if (type.kind === 'union') {
    for (const r of type.refs) {
      const hit = findTypeExprAt(r, offset)
      if (hit) return hit
    }
  }
  return null
}

export interface HoverTarget {
  kind: 'field' | 'type' | 'import' | 'attribute'
  markdown: string
}

export function hoverAt(doc: AnalyzedDocument, offset: number): HoverTarget | null {
  if (!doc.ast) return null

  for (const ns of doc.ast.namespaces) {
    for (const t of ns.types) {
      if (t.span && spanContains(t.span, offset)) {
        const attrs = formatAttributes(t.attributes)
        const kind = t.primary
          ? t.attributes.find((a) => PRIMARY_ATTRS.has(a.name))?.name ?? 'primary'
          : t.isToken
            ? 'token'
            : 'def'
        return {
          kind: 'type',
          markdown: [
            `\`\`\`lexd\ntype ${t.name}\n\`\`\``,
            `**${kind}** in \`${ns.name}\`${attrs ? `\n\n${attrs}` : ''}`,
          ].join('\n\n'),
        }
      }
      for (const f of t.fields) {
        if (f.span && spanContains(f.span, offset)) {
          return {
            kind: 'field',
            markdown: fieldHover(f, doc),
          }
        }
        const te = findTypeExprAt(f.type, offset)
        if (te) return typeExprHover(te, doc)
        for (const a of f.attributes) {
          if (a.span && spanContains(a.span, offset)) {
            return {
              kind: 'attribute',
              markdown: `\`\`\`lexd\n@${a.name}\n\`\`\`\n\nConstraint / meta attribute.`,
            }
          }
        }
      }
      for (const a of t.attributes) {
        if (a.span && spanContains(a.span, offset)) {
          return {
            kind: 'attribute',
            markdown: `\`\`\`lexd\n@${a.name}\n\`\`\`\n\n${PRIMARY_ATTRS.has(a.name) ? 'Primary type attribute.' : 'Type attribute.'}`,
          }
        }
      }
    }
  }

  const { word } = wordAt(doc.text, offset)
  if (!word) return null
  if (doc.localTypes.has(word)) {
    const t = doc.localTypes.get(word)!
    return {
      kind: 'type',
      markdown: `\`\`\`lexd\ntype ${t.name}\n\`\`\`\n\nLocal type definition.`,
    }
  }
  if (doc.imports.has(word)) {
    const imp = doc.imports.get(word)!
    const ref = doc.importRefs.get(word)
    return {
      kind: 'import',
      markdown: [
        `\`\`\`lexd\nimport { ${word} } from "${imp.module}"\n\`\`\``,
        ref ? `Resolved as \`${ref}\`.` : `Imported from \`${imp.module}\`.`,
      ].join('\n\n'),
    }
  }
  return null
}

function fieldHover(f: Field, doc: AnalyzedDocument): string {
  const attrs = formatAttributes(f.attributes)
  const typeStr = formatTypeExpr(f.type)
  const opt = f.optional ? '?' : ''
  let extra = ''
  if (f.type.kind === 'ref') {
    const name = f.type.name
    if (doc.localTypes.has(name)) extra = `\n\nLocal def \`#${name}\`.`
    else if (doc.importRefs.has(name)) extra = `\n\nImport → \`${doc.importRefs.get(name)}\`.`
  }
  return [`\`\`\`lexd\n${attrs ? attrs + ' ' : ''}${f.name}${opt}: ${typeStr}\n\`\`\``, extra]
    .filter(Boolean)
    .join('')
}

function typeExprHover(te: TypeExpr, doc: AnalyzedDocument): HoverTarget {
  if (te.kind === 'primitive') {
    return {
      kind: 'type',
      markdown: `\`\`\`lexd\n${te.name}\n\`\`\`\n\nPrimitive type.`,
    }
  }
  if (te.kind === 'ref') {
    const name = te.name
    if (doc.localTypes.has(name)) {
      return {
        kind: 'type',
        markdown: `\`\`\`lexd\ntype ${name}\n\`\`\`\n\nLocal type reference (\`#${name}\`).`,
      }
    }
    if (doc.imports.has(name)) {
      const ref = doc.importRefs.get(name)
      return {
        kind: 'import',
        markdown: `\`\`\`lexd\n${name}\n\`\`\`\n\nImported symbol${ref ? ` → \`${ref}\`` : ''}.`,
      }
    }
    return {
      kind: 'type',
      markdown: `\`\`\`lexd\n${name}\n\`\`\`\n\nType reference.`,
    }
  }
  return {
    kind: 'type',
    markdown: `\`\`\`lexd\n${formatTypeExpr(te)}\n\`\`\``,
  }
}

export function definitionAt(
  doc: AnalyzedDocument,
  offset: number,
  workspace?: WorkspaceIndex,
): SymbolLocation | null {
  if (!doc.ast) return null

  // Prefer type-expr refs under the cursor
  for (const ns of doc.ast.namespaces) {
    for (const t of ns.types) {
      for (const f of t.fields) {
        const te = findTypeExprAt(f.type, offset)
        if (te?.kind === 'ref') {
          return resolveRefDefinition(te.name, doc, workspace)
        }
      }
      // Also walk schema type exprs in blocks
      for (const block of t.blocks) {
        if (block.kind === 'input' || block.kind === 'output') {
          if (block.schema?.kind === 'type') {
            const te = findTypeExprAt(block.schema.type, offset)
            if (te?.kind === 'ref') return resolveRefDefinition(te.name, doc, workspace)
          }
          if (block.schema?.kind === 'inline') {
            for (const f of block.schema.fields) {
              const te = findTypeExprAt(f.type, offset)
              if (te?.kind === 'ref') return resolveRefDefinition(te.name, doc, workspace)
            }
          }
        }
        if (block.kind === 'message') {
          const te = findTypeExprAt(block.schema, offset)
          if (te?.kind === 'ref') return resolveRefDefinition(te.name, doc, workspace)
        }
        if (block.kind === 'params') {
          for (const f of block.fields) {
            const te = findTypeExprAt(f.type, offset)
            if (te?.kind === 'ref') return resolveRefDefinition(te.name, doc, workspace)
          }
        }
      }
    }
  }

  const { word } = wordAt(doc.text, offset)
  if (!word) return null
  return resolveRefDefinition(word, doc, workspace)
}

function resolveRefDefinition(
  name: string,
  doc: AnalyzedDocument,
  workspace?: WorkspaceIndex,
): SymbolLocation | null {
  const bare = name.startsWith('#') ? name.slice(1) : name

  // Local type
  const local = doc.localTypes.get(bare) ?? doc.localTypes.get(name)
  if (local?.span) {
    return {
      uri: doc.uri,
      span: local.span,
      detail: `Local type ${local.name}`,
    }
  }

  // Import binding → module
  const imp = doc.imports.get(bare) ?? doc.imports.get(name)
  if (imp && workspace) {
    const mod = workspace.modules.get(imp.module)
    if (mod) {
      const key = imp.imported === 'main' ? 'main' : imp.imported
      const type =
        mod.types.get(key) ??
        (imp.imported === 'main'
          ? [...mod.types.values()].find((t) => t.primary)
          : mod.types.get(imp.imported))
      if (type?.span) {
        return {
          uri: pathToUri(mod.path),
          span: type.span,
          detail: `${imp.module}${key === 'main' ? '' : '#' + key}`,
        }
      }
      // Fall back to file start / namespace
      for (const ns of mod.file.namespaces) {
        if (ns.span) {
          return { uri: pathToUri(mod.path), span: ns.span, detail: imp.module }
        }
      }
    }
  }

  // Absolute NSID#frag
  if (name.includes('.')) {
    const [modId, frag] = name.split('#') as [string, string | undefined]
    const mod = workspace?.modules.get(modId)
    if (mod) {
      const type = frag ? mod.types.get(frag) : mod.types.get('main')
      if (type?.span) {
        return { uri: pathToUri(mod.path), span: type.span, detail: name }
      }
    }
  }

  return null
}

export interface CompletionItemInfo {
  label: string
  kind: 'keyword' | 'type' | 'property' | 'snippet' | 'text'
  detail?: string
  insertText?: string
}

export function completionsAt(doc: AnalyzedDocument, offset: number): CompletionItemInfo[] {
  const before = doc.text.slice(Math.max(0, offset - 80), offset)
  const items: CompletionItemInfo[] = []

  // Attribute completion after @
  const atMatch = /@([A-Za-z0-9_]*)$/.exec(before)
  if (atMatch) {
    for (const name of PRIMARY_ATTRS) {
      items.push({
        label: `@${name}`,
        kind: 'keyword',
        detail: 'Primary type attribute',
        insertText: name,
      })
    }
    for (const name of CONSTRAINT_ATTRS) {
      items.push({
        label: `@${name}`,
        kind: 'property',
        detail: 'Constraint / meta attribute',
        insertText: name,
      })
    }
    return items
  }

  // Type position: after ':' (with optional whitespace)
  const typePos = /:\s*([A-Za-z0-9_#.-]*)$/.exec(before)
  // Also after union( or array-ish contexts
  const unionPos = /(?:union\s*\(|\[\s*)([A-Za-z0-9_#.-]*)$/.exec(before)
  if (typePos || unionPos) {
    for (const p of PRIMITIVES) {
      items.push({ label: p, kind: 'type', detail: 'Primitive' })
    }
    for (const name of doc.localTypes.keys()) {
      items.push({ label: name, kind: 'type', detail: 'Local type' })
    }
    for (const name of doc.imports.keys()) {
      items.push({
        label: name,
        kind: 'type',
        detail: doc.importRefs.get(name) ?? 'Import',
      })
    }
    items.push({ label: 'union', kind: 'keyword', detail: 'Union type', insertText: 'union($0)' })
    return items
  }

  // Section keywords inside type bodies (heuristic: after newline / brace)
  const sectionPos = /(?:^|[\n{])\s*([a-z]*)$/m.exec(before)
  if (sectionPos) {
    for (const name of SECTION_NAMES) {
      items.push({
        label: name,
        kind: 'keyword',
        detail: 'Section',
        insertText: `${name} {\n\t$0\n}`,
      })
    }
  }

  // Top-level keywords
  if (/(?:^|\n)\s*([a-z]*)$/.test(before)) {
    for (const kw of ['namespace', 'import', 'type', 'from', 'as']) {
      items.push({ label: kw, kind: 'keyword' })
    }
  }

  // Always offer in-scope symbols as a fallback when prefix looks like an identifier
  const idPrefix = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(before)
  if (idPrefix && items.length === 0) {
    for (const name of doc.localTypes.keys()) {
      items.push({ label: name, kind: 'type', detail: 'Local type' })
    }
    for (const name of doc.imports.keys()) {
      items.push({ label: name, kind: 'type', detail: 'Import' })
    }
    for (const p of PRIMITIVES) {
      items.push({ label: p, kind: 'type', detail: 'Primitive' })
    }
  }

  return items
}

export { CONSTRAINT_ATTRS, PRIMITIVES, PRIMARY_ATTRS, SECTION_NAMES }
