import type { SourceSpan } from './ast.js'

export class LexdCompileError extends Error {
  readonly span?: SourceSpan

  constructor(message: string, span?: SourceSpan) {
    super(message)
    this.name = 'LexdCompileError'
    this.span = span
  }
}
