import { createToken, Lexer } from 'chevrotain'

export const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /[ \t\r\n]+/,
  group: Lexer.SKIPPED,
})

export const LineComment = createToken({
  name: 'LineComment',
  pattern: /\/\/[^\n]*/,
  group: Lexer.SKIPPED,
})

export const BlockComment = createToken({
  name: 'BlockComment',
  pattern: /\/\*[\s\S]*?\*\//,
  group: Lexer.SKIPPED,
})

export const StringLiteral = createToken({
  name: 'StringLiteral',
  pattern: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/,
})

export const NumberLiteral = createToken({
  name: 'NumberLiteral',
  pattern: /-?\d+/,
})

export const BooleanLiteral = createToken({
  name: 'BooleanLiteral',
  pattern: /true|false/,
})

export const NamespaceKw = createToken({ name: 'NamespaceKw', pattern: /namespace/ })
export const TypeKw = createToken({ name: 'TypeKw', pattern: /type/ })
export const UnionKw = createToken({ name: 'UnionKw', pattern: /union/ })

export const LCurly = createToken({ name: 'LCurly', pattern: /\{/ })
export const RCurly = createToken({ name: 'RCurly', pattern: /\}/ })
export const LParen = createToken({ name: 'LParen', pattern: /\(/ })
export const RParen = createToken({ name: 'RParen', pattern: /\)/ })
export const LBracket = createToken({ name: 'LBracket', pattern: /\[/ })
export const RBracket = createToken({ name: 'RBracket', pattern: /\]/ })
export const Colon = createToken({ name: 'Colon', pattern: /:/ })
export const Comma = createToken({ name: 'Comma', pattern: /,/ })
export const Question = createToken({ name: 'Question', pattern: /\?/ })
export const At = createToken({ name: 'At', pattern: /@/ })
export const Hash = createToken({ name: 'Hash', pattern: /#/ })
export const Dot = createToken({ name: 'Dot', pattern: /\./ })

// Identifiers after keywords so keywords win
export const Identifier = createToken({
  name: 'Identifier',
  pattern: /[A-Za-z_][A-Za-z0-9_-]*/,
})

export const allTokens = [
  WhiteSpace,
  LineComment,
  BlockComment,
  StringLiteral,
  NumberLiteral,
  BooleanLiteral,
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
]

export const lexdLexer = new Lexer(allTokens)
