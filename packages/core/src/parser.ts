import {
  CstParser,
  type IToken,
  type CstNode,
} from 'chevrotain'
import {
  allTokens,
  NamespaceKw,
  ImportKw,
  FromKw,
  AsKw,
  TypeKw,
  UnionKw,
  ClosedKw,
  ParamsKw,
  InputKw,
  OutputKw,
  MessageKw,
  ErrorsKw,
  EncodingKw,
  SchemaKw,
  PermissionsKw,
  LCurly,
  RCurly,
  LParen,
  RParen,
  LBracket,
  RBracket,
  Colon,
  Comma,
  Question,
  At,
  Hash,
  Dot,
  Identifier,
  StringLiteral,
  NumberLiteral,
  BooleanLiteral,
  lexdLexer,
} from './lexer.js'
import type {
  Attribute,
  AttrValue,
  ErrorDecl,
  Field,
  ImportDecl,
  IoBlock,
  LexdFile,
  MessageBlock,
  NamespaceDecl,
  PermissionEntry,
  PermissionsBlock,
  PrimitiveName,
  SchemaBody,
  SourceSpan,
  TypeBlock,
  TypeDecl,
  TypeExpr,
} from './ast.js'
import { PRIMITIVES, PRIMARY_ATTRS } from './ast.js'

class LexdParser extends CstParser {
  constructor() {
    super(allTokens, { recoveryEnabled: false })
    this.performSelfAnalysis()
  }

  public file = this.RULE('file', () => {
    this.MANY(() => this.SUBRULE(this.importDecl))
    this.MANY2(() => this.SUBRULE(this.namespaceDecl))
  })

  private importDecl = this.RULE('importDecl', () => {
    this.CONSUME(ImportKw)
    this.OR([
      {
        ALT: () => {
          this.CONSUME(LCurly)
          this.SUBRULE(this.importBinding)
          this.MANY(() => {
            this.CONSUME(Comma)
            this.SUBRULE2(this.importBinding)
          })
          this.CONSUME(RCurly)
          this.CONSUME(FromKw)
          this.CONSUME(StringLiteral)
        },
      },
      {
        ALT: () => {
          this.SUBRULE(this.nsid)
          this.OPTION(() => {
            this.CONSUME(AsKw)
            this.CONSUME(Identifier)
          })
        },
      },
    ])
  })

  private importBinding = this.RULE('importBinding', () => {
    this.CONSUME(Identifier)
    this.OPTION(() => {
      this.CONSUME(AsKw)
      this.CONSUME2(Identifier)
    })
  })

  private namespaceDecl = this.RULE('namespaceDecl', () => {
    this.CONSUME(NamespaceKw)
    this.SUBRULE(this.nsid)
    this.CONSUME(LCurly)
    this.MANY(() => this.SUBRULE(this.typeDecl))
    this.CONSUME(RCurly)
  })

  private nsid = this.RULE('nsid', () => {
    this.CONSUME(Identifier)
    this.MANY(() => {
      this.CONSUME(Dot)
      this.CONSUME2(Identifier)
    })
  })

  private typeDecl = this.RULE('typeDecl', () => {
    this.MANY(() => this.SUBRULE(this.attribute))
    this.CONSUME(TypeKw)
    this.CONSUME(Identifier)
    this.CONSUME(LCurly)
    this.MANY2(() => this.SUBRULE(this.typeMember))
    this.CONSUME(RCurly)
  })

  private typeMember = this.RULE('typeMember', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.field) },
      {
        ALT: () => this.SUBRULE(this.paramsBlock),
        GATE: () => this.laSectionBlock(ParamsKw),
      },
      {
        ALT: () => this.SUBRULE(this.inputBlock),
        GATE: () => this.laSectionBlock(InputKw),
      },
      {
        ALT: () => this.SUBRULE(this.outputBlock),
        GATE: () => this.laSectionBlock(OutputKw),
      },
      {
        ALT: () => this.SUBRULE(this.messageBlock),
        GATE: () => this.laSectionBlock(MessageKw),
      },
      {
        ALT: () => this.SUBRULE(this.errorsBlock),
        GATE: () => this.laSectionBlock(ErrorsKw),
      },
      {
        ALT: () => this.SUBRULE(this.permissionsBlock),
        GATE: () => this.laSectionBlock(PermissionsKw),
      },
    ])
  })

  /** Section keywords are also valid field names; only treat them as blocks when followed by `{`. */
  private laSectionBlock = (kw: typeof ParamsKw): boolean => {
    return this.LA(1)?.tokenType === kw && this.LA(2)?.tokenType === LCurly
  }

  private paramsBlock = this.RULE('paramsBlock', () => {
    this.CONSUME(ParamsKw)
    this.CONSUME(LCurly)
    this.MANY(() => this.SUBRULE(this.field))
    this.CONSUME(RCurly)
  })

  private inputBlock = this.RULE('inputBlock', () => {
    this.CONSUME(InputKw)
    this.CONSUME(LCurly)
    this.MANY(() => this.SUBRULE(this.ioMember))
    this.CONSUME(RCurly)
  })

  private outputBlock = this.RULE('outputBlock', () => {
    this.CONSUME(OutputKw)
    this.CONSUME(LCurly)
    this.MANY(() => this.SUBRULE(this.ioMember))
    this.CONSUME(RCurly)
  })

  private ioMember = this.RULE('ioMember', () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(EncodingKw)
          this.CONSUME(Colon)
          this.CONSUME(StringLiteral)
        },
      },
      {
        ALT: () => {
          this.CONSUME(SchemaKw)
          this.OR2([
            {
              ALT: () => {
                this.CONSUME2(Colon)
                this.SUBRULE(this.typeExpr)
              },
            },
            {
              ALT: () => {
                this.CONSUME(LCurly)
                this.MANY(() => this.SUBRULE(this.field))
                this.CONSUME(RCurly)
              },
            },
          ])
        },
      },
    ])
  })

  private messageBlock = this.RULE('messageBlock', () => {
    this.CONSUME(MessageKw)
    this.CONSUME(LCurly)
    this.CONSUME(SchemaKw)
    this.CONSUME(Colon)
    this.SUBRULE(this.typeExpr)
    this.CONSUME(RCurly)
  })

  private errorsBlock = this.RULE('errorsBlock', () => {
    this.CONSUME(ErrorsKw)
    this.CONSUME(LCurly)
    this.OPTION(() => {
      this.SUBRULE(this.errorItem)
      this.MANY(() => {
        this.OPTION2(() => this.CONSUME(Comma))
        this.SUBRULE2(this.errorItem)
      })
    })
    this.CONSUME(RCurly)
  })

  private errorItem = this.RULE('errorItem', () => {
    this.CONSUME(Identifier)
    this.OPTION(() => {
      this.CONSUME(Colon)
      this.CONSUME(StringLiteral)
    })
  })

  private permissionsBlock = this.RULE('permissionsBlock', () => {
    this.CONSUME(PermissionsKw)
    this.CONSUME(LCurly)
    this.MANY(() => this.SUBRULE(this.permissionEntry))
    this.CONSUME(RCurly)
  })

  private permissionEntry = this.RULE('permissionEntry', () => {
    this.CONSUME(Identifier)
    this.CONSUME(LCurly)
    this.MANY(() => this.SUBRULE(this.permissionProp))
    this.CONSUME(RCurly)
  })

  private permissionProp = this.RULE('permissionProp', () => {
    this.CONSUME(Identifier)
    this.CONSUME(Colon)
    this.OR([
      { ALT: () => this.CONSUME(StringLiteral) },
      { ALT: () => this.CONSUME(BooleanLiteral) },
      {
        ALT: () => {
          this.CONSUME(LBracket)
          this.OPTION(() => {
            this.CONSUME2(StringLiteral)
            this.MANY(() => {
              this.CONSUME(Comma)
              this.CONSUME3(StringLiteral)
            })
          })
          this.CONSUME(RBracket)
        },
      },
    ])
  })

  private attribute = this.RULE('attribute', () => {
    this.CONSUME(At)
    this.CONSUME(Identifier)
    this.OPTION(() => {
      this.CONSUME(LParen)
      this.OPTION2(() => {
        this.SUBRULE(this.attrArg)
        this.MANY(() => {
          this.CONSUME(Comma)
          this.SUBRULE2(this.attrArg)
        })
      })
      this.CONSUME(RParen)
    })
  })

  private attrArg = this.RULE('attrArg', () => {
    this.OR([
      { ALT: () => this.CONSUME(StringLiteral) },
      { ALT: () => this.CONSUME(NumberLiteral) },
      { ALT: () => this.CONSUME(BooleanLiteral) },
      {
        ALT: () => {
          this.CONSUME(LBracket)
          this.OPTION(() => {
            this.SUBRULE(this.attrArg)
            this.MANY(() => {
              this.CONSUME(Comma)
              this.SUBRULE2(this.attrArg)
            })
          })
          this.CONSUME(RBracket)
        },
      },
    ])
  })

  private fieldName = this.RULE('fieldName', () => {
    this.OR([
      { ALT: () => this.CONSUME(Identifier) },
      { ALT: () => this.CONSUME(ParamsKw) },
      { ALT: () => this.CONSUME(InputKw) },
      { ALT: () => this.CONSUME(OutputKw) },
      { ALT: () => this.CONSUME(MessageKw) },
      { ALT: () => this.CONSUME(ErrorsKw) },
      { ALT: () => this.CONSUME(PermissionsKw) },
    ])
  })

  private field = this.RULE('field', () => {
    this.MANY(() => this.SUBRULE(this.attribute))
    this.SUBRULE(this.fieldName)
    this.OPTION(() => this.CONSUME(Question))
    this.CONSUME(Colon)
    this.SUBRULE(this.typeExpr)
  })

  private typeExpr = this.RULE('typeExpr', () => {
    this.SUBRULE(this.typeExprInner)
    this.OPTION(() => {
      this.CONSUME(LBracket)
      this.CONSUME(RBracket)
    })
  })

  private typeExprInner = this.RULE('typeExprInner', () => {
    this.OR([
      {
        ALT: () => {
          this.OPTION(() => this.CONSUME(ClosedKw))
          this.CONSUME(UnionKw)
          this.CONSUME(LParen)
          this.SUBRULE(this.typeExpr)
          this.MANY(() => {
            this.CONSUME(Comma)
            this.SUBRULE2(this.typeExpr)
          })
          this.CONSUME(RParen)
        },
      },
      {
        ALT: () => {
          this.SUBRULE(this.typeAtom)
        },
      },
      {
        ALT: () => {
          this.CONSUME(LCurly)
          this.MANY3(() => this.SUBRULE(this.field))
          this.CONSUME(RCurly)
        },
      },
    ])
  })

  private typeAtom = this.RULE('typeAtom', () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(Hash)
          this.CONSUME(Identifier)
        },
      },
      {
        ALT: () => {
          this.SUBRULE(this.nsid)
          this.OPTION(() => {
            this.CONSUME2(Hash)
            this.CONSUME2(Identifier)
          })
        },
      },
    ])
  })
}

const parser = new LexdParser()

export class LexdSyntaxError extends Error {
  constructor(
    message: string,
    public readonly span?: SourceSpan,
  ) {
    super(message)
    this.name = 'LexdSyntaxError'
  }
}

function tokenSpan(token: IToken): SourceSpan {
  return {
    startOffset: token.startOffset,
    endOffset: token.endOffset ?? token.startOffset,
    startLine: token.startLine ?? 1,
    startColumn: token.startColumn ?? 1,
    endLine: token.endLine ?? token.startLine ?? 1,
    endColumn: token.endColumn ?? token.startColumn ?? 1,
  }
}

function mergeSpan(a?: SourceSpan, b?: SourceSpan): SourceSpan | undefined {
  if (!a) return b
  if (!b) return a
  return {
    startOffset: a.startOffset,
    endOffset: b.endOffset,
    startLine: a.startLine,
    startColumn: a.startColumn,
    endLine: b.endLine,
    endColumn: b.endColumn,
  }
}

function unquote(raw: string): string {
  const q = raw[0]
  const body = raw.slice(1, -1)
  if (q === '"') {
    return body.replace(/\\(["\\nrt])/g, (_, c: string) => {
      if (c === 'n') return '\n'
      if (c === 'r') return '\r'
      if (c === 't') return '\t'
      return c
    })
  }
  return body.replace(/\\(['\\nrt])/g, (_, c: string) => {
    if (c === 'n') return '\n'
    if (c === 'r') return '\r'
    if (c === 't') return '\t'
    return c
  })
}

function parseAttrValue(cst: CstNode): AttrValue {
  const children = cst.children
  if (children['StringLiteral']) {
    return unquote((children['StringLiteral'][0] as IToken).image)
  }
  if (children['NumberLiteral']) {
    return Number((children['NumberLiteral'][0] as IToken).image)
  }
  if (children['BooleanLiteral']) {
    return (children['BooleanLiteral'][0] as IToken).image === 'true'
  }
  const nested = children['attrArg'] as CstNode[] | undefined
  if (nested) {
    return nested.map(parseAttrValue) as Array<string | number | boolean>
  }
  return []
}

function buildAttribute(cst: CstNode): Attribute {
  const nameTok = cst.children['Identifier']![0] as IToken
  const args = (cst.children['attrArg'] as CstNode[] | undefined)?.map(parseAttrValue) ?? []
  return {
    name: nameTok.image,
    args,
    span: tokenSpan(nameTok),
  }
}

function buildNsid(cst: CstNode): { name: string; span: SourceSpan } {
  const ids = cst.children['Identifier'] as IToken[]
  const name = ids.map((t) => t.image).join('.')
  const first = ids[0]!
  const last = ids[ids.length - 1]!
  return {
    name,
    span: mergeSpan(tokenSpan(first), tokenSpan(last))!,
  }
}

function buildImportBinding(cst: CstNode): { imported: string; local: string } {
  const ids = cst.children['Identifier'] as IToken[]
  const imported = ids[0]!.image
  const local = ids[1]?.image ?? imported
  return { imported, local }
}

function buildImportDecl(cst: CstNode): ImportDecl {
  if (cst.children['StringLiteral']) {
    const module = unquote((cst.children['StringLiteral'][0] as IToken).image)
    const bindings = (cst.children['importBinding'] as CstNode[]).map(buildImportBinding)
    return {
      kind: 'named',
      module,
      bindings: bindings.map((b) => ({
        local: b.local,
        imported: b.imported,
      })),
    }
  }

  const nsid = buildNsid(cst.children['nsid']![0] as CstNode)
  const aliasTok = (cst.children['Identifier'] as IToken[] | undefined)?.[0]
  const local = aliasTok?.image ?? nsid.name.split('.').pop()!
  return {
    kind: 'whole',
    module: nsid.name,
    bindings: [{ local, imported: 'main' }],
    span: nsid.span,
  }
}

function buildTypeAtom(cst: CstNode): TypeExpr {
  if (!cst.children['nsid']) {
    const id = cst.children['Identifier']![0] as IToken
    return { kind: 'ref', name: `#${id.image}`, span: tokenSpan(id) }
  }

  const nsid = buildNsid(cst.children['nsid']![0] as CstNode)
  const fragTok = (cst.children['Identifier'] as IToken[] | undefined)?.[0]
  if (fragTok) {
    return {
      kind: 'ref',
      name: `${nsid.name}#${fragTok.image}`,
      span: mergeSpan(nsid.span, tokenSpan(fragTok)),
    }
  }

  if (PRIMITIVES.has(nsid.name)) {
    return {
      kind: 'primitive',
      name: nsid.name as PrimitiveName,
      span: nsid.span,
    }
  }

  return { kind: 'ref', name: nsid.name, span: nsid.span }
}

function buildTypeExpr(cst: CstNode): TypeExpr {
  const inner = buildTypeExprInner(cst.children['typeExprInner']![0] as CstNode)
  if (cst.children['LBracket']) {
    return { kind: 'array', element: inner, span: inner.span }
  }
  return inner
}

function buildTypeExprInner(cst: CstNode): TypeExpr {
  if (cst.children['UnionKw']) {
    const parts = cst.children['typeExpr'] as CstNode[]
    return {
      kind: 'union',
      refs: parts.map(buildTypeExpr),
      closed: Boolean(cst.children['ClosedKw']),
      span: tokenSpan(cst.children['UnionKw']![0] as IToken),
    }
  }

  if (cst.children['LCurly']) {
    const fields =
      (cst.children['field'] as CstNode[] | undefined)?.map(buildField) ?? []
    const lcurly = cst.children['LCurly']![0] as IToken
    const rcurly = cst.children['RCurly']![0] as IToken
    return { kind: 'inline', fields, span: mergeSpan(tokenSpan(lcurly), tokenSpan(rcurly)) }
  }

  return buildTypeAtom(cst.children['typeAtom']![0] as CstNode)
}

function fieldNameToken(cst: CstNode): IToken {
  const nameNodes = cst.children['fieldName'] as CstNode[] | undefined
  if (!nameNodes?.length) {
    throw new Error('Internal: field CST missing fieldName child')
  }
  for (const node of nameNodes) {
    for (const key of [
      'Identifier',
      'ParamsKw',
      'InputKw',
      'OutputKw',
      'MessageKw',
      'ErrorsKw',
      'PermissionsKw',
    ]) {
      const tok = node.children[key]?.[0] as IToken | undefined
      if (tok) return tok
    }
  }
  throw new Error('field missing name')
}

function buildField(cst: CstNode): Field {
  const attrs = (cst.children['attribute'] as CstNode[] | undefined)?.map(buildAttribute) ?? []
  const nameTok = fieldNameToken(cst)
  const optional = Boolean(cst.children['Question'])
  const type = buildTypeExpr(cst.children['typeExpr']![0] as CstNode)
  return {
    name: nameTok.image,
    optional,
    type,
    attributes: attrs,
    span: tokenSpan(nameTok),
  }
}

function buildErrorItem(cst: CstNode): ErrorDecl {
  const nameTok = cst.children['Identifier']![0] as IToken
  const descTok = cst.children['StringLiteral']?.[0] as IToken | undefined
  return {
    name: nameTok.image,
    description: descTok ? unquote(descTok.image) : undefined,
    span: tokenSpan(nameTok),
  }
}

function buildIoMembers(members: CstNode[] | undefined): {
  encoding?: string
  schema?: SchemaBody
} {
  let encoding: string | undefined
  let schema: SchemaBody | undefined
  for (const m of members ?? []) {
    if (m.children['EncodingKw']) {
      encoding = unquote((m.children['StringLiteral']![0] as IToken).image)
    } else if (m.children['SchemaKw']) {
      if (m.children['typeExpr']) {
        schema = { kind: 'type', type: buildTypeExpr(m.children['typeExpr']![0] as CstNode) }
      } else {
        const fields = (m.children['field'] as CstNode[] | undefined)?.map(buildField) ?? []
        schema = { kind: 'inline', fields }
      }
    }
  }
  return { encoding, schema }
}

function buildPermissionEntry(cst: CstNode): PermissionEntry {
  const resourceTok = cst.children['Identifier']![0] as IToken
  const resourceName = resourceTok.image
  if (resourceName !== 'rpc' && resourceName !== 'repo') {
    throw new LexdSyntaxError(
      `permission resource must be rpc or repo, got "${resourceName}"`,
      tokenSpan(resourceTok),
    )
  }
  const props: PermissionEntry['props'] = {}
  for (const p of (cst.children['permissionProp'] as CstNode[] | undefined) ?? []) {
    const key = (p.children['Identifier']![0] as IToken).image
    if (p.children['BooleanLiteral']) {
      props[key] = (p.children['BooleanLiteral'][0] as IToken).image === 'true'
    } else if (p.children['LBracket']) {
      const strs = (p.children['StringLiteral'] as IToken[] | undefined) ?? []
      props[key] = strs.map((t) => unquote(t.image))
    } else if (p.children['StringLiteral']) {
      props[key] = unquote((p.children['StringLiteral'][0] as IToken).image)
    }
  }
  return { resource: resourceName, props }
}

function buildTypeMember(cst: CstNode): { field?: Field; block?: TypeBlock } {
  if (cst.children['paramsBlock']) {
    const b = cst.children['paramsBlock']![0] as CstNode
    return {
      block: {
        kind: 'params',
        fields: (b.children['field'] as CstNode[] | undefined)?.map(buildField) ?? [],
      },
    }
  }
  if (cst.children['inputBlock']) {
    const b = cst.children['inputBlock']![0] as CstNode
    const { encoding, schema } = buildIoMembers(b.children['ioMember'] as CstNode[] | undefined)
    const block: IoBlock = { kind: 'input', encoding, schema }
    return { block }
  }
  if (cst.children['outputBlock']) {
    const b = cst.children['outputBlock']![0] as CstNode
    const { encoding, schema } = buildIoMembers(b.children['ioMember'] as CstNode[] | undefined)
    const block: IoBlock = { kind: 'output', encoding, schema }
    return { block }
  }
  if (cst.children['messageBlock']) {
    const b = cst.children['messageBlock']![0] as CstNode
    const block: MessageBlock = {
      kind: 'message',
      schema: buildTypeExpr(b.children['typeExpr']![0] as CstNode),
    }
    return { block }
  }
  if (cst.children['errorsBlock']) {
    const b = cst.children['errorsBlock']![0] as CstNode
    return {
      block: {
        kind: 'errors',
        errors: (b.children['errorItem'] as CstNode[] | undefined)?.map(buildErrorItem) ?? [],
      },
    }
  }
  if (cst.children['permissionsBlock']) {
    const b = cst.children['permissionsBlock']![0] as CstNode
    const block: PermissionsBlock = {
      kind: 'permissions',
      entries: (b.children['permissionEntry'] as CstNode[] | undefined)?.map(buildPermissionEntry) ?? [],
    }
    return { block }
  }
  return { field: buildField(cst.children['field']![0] as CstNode) }
}

function buildTypeDecl(cst: CstNode): TypeDecl {
  const attrs = (cst.children['attribute'] as CstNode[] | undefined)?.map(buildAttribute) ?? []
  const nameTok = cst.children['Identifier']![0] as IToken
  const members = (cst.children['typeMember'] as CstNode[] | undefined) ?? []
  const fields: Field[] = []
  const blocks: TypeBlock[] = []
  for (const m of members) {
    const built = buildTypeMember(m)
    if (built.field) fields.push(built.field)
    if (built.block) blocks.push(built.block)
  }
  const primary = attrs.some((a) => PRIMARY_ATTRS.has(a.name))
  const isToken = attrs.some((a) => a.name === 'token')
  const isScalar = attrs.some((a) => a.name === 'scalar')
  return {
    name: nameTok.image,
    attributes: attrs,
    fields,
    blocks,
    primary,
    isToken,
    isScalar,
    span: tokenSpan(nameTok),
  }
}

function buildNamespace(cst: CstNode): NamespaceDecl {
  const nsid = buildNsid(cst.children['nsid']![0] as CstNode)
  const types = (cst.children['typeDecl'] as CstNode[] | undefined)?.map(buildTypeDecl) ?? []
  return {
    name: nsid.name,
    types,
    span: nsid.span,
  }
}

export function parseLexd(source: string, filename?: string): LexdFile {
  const lexResult = lexdLexer.tokenize(source)
  if (lexResult.errors.length > 0) {
    const err = lexResult.errors[0]!
    throw new LexdSyntaxError(err.message, {
      startOffset: err.offset,
      endOffset: err.offset + (err.length ?? 0),
      startLine: err.line ?? 1,
      startColumn: err.column ?? 1,
      endLine: err.line ?? 1,
      endColumn: (err.column ?? 1) + (err.length ?? 0),
    })
  }

  parser.input = lexResult.tokens
  const cst = parser.file()
  if (parser.errors.length > 0) {
    const err = parser.errors[0]!
    const tok = err.token
    throw new LexdSyntaxError(
      err.message,
      tok ? tokenSpan(tok) : undefined,
    )
  }

  const imports = (cst.children['importDecl'] as CstNode[] | undefined)?.map(buildImportDecl) ?? []
  const namespaces = (cst.children['namespaceDecl'] as CstNode[] | undefined)?.map(buildNamespace) ?? []
  return { imports, namespaces, filename }
}
