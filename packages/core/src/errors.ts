export class LexdCompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LexdCompileError'
  }
}
