import {
  CstParser,
  type IToken,
  type CstNode,
} from 'chevrotain'
import {
  allTokens,
  NamespaceKw,
  TypeKw,
  UnionKw,
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
  Field,
  LexdFile,
  NamespaceDecl,
  PrimitiveName,
  SourceSpan,
  TypeDecl,
  TypeExpr,
} from './ast.js'
import { PRIMITIVES } from './ast.js'

class LexdParser extends CstParser {
  constructor() {
    super(allTokens, { recoveryEnabled: false })
    this.performSelfAnalysis()
  }

  public file = this.RULE('file', () => {
    this.MANY(() => this.SUBRULE(this.namespaceDecl))
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
    this.MANY2(() => this.SUBRULE(this.field))
    this.CONSUME(RCurly)
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

  private field = this.RULE('field', () => {
    this.MANY(() => this.SUBRULE(this.attribute))
    this.CONSUME(Identifier)
    this.OPTION(() => this.CONSUME(Question))
    this.CONSUME(Colon)
    this.SUBRULE(this.typeExpr)
  })

  private typeExpr = this.RULE('typeExpr', () => {
    this.OR([
      {
        ALT: () => {
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
          this.OPTION(() => {
            this.CONSUME(LBracket)
            this.CONSUME(RBracket)
          })
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
  // array
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
  const dots = (cst.children['Dot'] as IToken[] | undefined) ?? []
  const name = ids.map((t) => t.image).join('.')
  const first = ids[0]!
  const last = ids[ids.length - 1]!
  return {
    name,
    span: mergeSpan(tokenSpan(first), tokenSpan(last))!,
  }
}

function buildTypeAtom(cst: CstNode): TypeExpr {
  // #fragment only
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
  if (cst.children['UnionKw']) {
    const parts = cst.children['typeExpr'] as CstNode[]
    return {
      kind: 'union',
      refs: parts.map(buildTypeExpr),
      span: tokenSpan(cst.children['UnionKw']![0] as IToken),
    }
  }

  const atom = buildTypeAtom(cst.children['typeAtom']![0] as CstNode)
  if (cst.children['LBracket']) {
    return { kind: 'array', element: atom, span: atom.span }
  }
  return atom
}

function buildField(cst: CstNode): Field {
  const attrs = (cst.children['attribute'] as CstNode[] | undefined)?.map(buildAttribute) ?? []
  const nameTok = cst.children['Identifier']![0] as IToken
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

function buildTypeDecl(cst: CstNode): TypeDecl {
  const attrs = (cst.children['attribute'] as CstNode[] | undefined)?.map(buildAttribute) ?? []
  const nameTok = cst.children['Identifier']![0] as IToken
  const fields = (cst.children['field'] as CstNode[] | undefined)?.map(buildField) ?? []
  const primary = attrs.some((a) => a.name === 'record')
  return {
    name: nameTok.image,
    attributes: attrs,
    fields,
    primary,
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

  const namespaces = (cst.children['namespaceDecl'] as CstNode[] | undefined)?.map(buildNamespace) ?? []
  return { namespaces, filename }
}
