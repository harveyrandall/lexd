import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  analyzeDocument,
  buildWorkspaceIndex,
  completionsAt,
  definitionAt,
  hoverAt,
  offsetAt,
} from './analysis.js'

const SAMPLE = `import { StrongRef } from "com.atproto.repo.strongRef"

namespace app.bsky.feed {
  @record("tid")
  type post {
    @maxGraphemes(300) text: string
    reply?: Reply
  }

  type Reply {
    root: StrongRef
  }
}
`

describe('language-server analysis', () => {
  it('reports syntax diagnostics with a span', () => {
    const bad = `namespace app.example {\n  type broken {\n    name string\n  }\n}\n`
    const result = analyzeDocument('file:///tmp/bad.lexd', bad)
    assert.ok(result.diagnostics.length >= 1)
    assert.equal(result.diagnostics[0]!.severity, 'error')
    assert.ok(result.diagnostics[0]!.span)
  })

  it('parses a valid document without diagnostics when stdlib resolves', () => {
    const workspace = buildWorkspaceIndex([process.cwd()])
    const result = analyzeDocument('file:///tmp/feed.lexd', SAMPLE, workspace)
    assert.equal(result.diagnostics.length, 0, result.diagnostics.map((d) => d.message).join('; '))
    assert.ok(result.ast)
    assert.ok(result.localTypes.has('Reply'))
    assert.ok(result.imports.has('StrongRef'))
  })

  it('suggests @maxGraphemes after @', () => {
    const src = `namespace app.example {\n  type t {\n    @\n  }\n}\n`
    const result = analyzeDocument('file:///tmp/c.lexd', src)
    const offset = offsetAt(src, 2, 5)
    const items = completionsAt(result, offset)
    assert.ok(items.some((i) => i.label === '@maxGraphemes'))
    assert.ok(items.some((i) => i.label === '@format'))
  })

  it('suggests primitives in type position', () => {
    const src = `namespace app.example {\n  type t {\n    name: \n  }\n}\n`
    const result = analyzeDocument('file:///tmp/c.lexd', src)
    const offset = offsetAt(src, 2, 10)
    const items = completionsAt(result, offset)
    assert.ok(items.some((i) => i.label === 'string'))
    assert.ok(items.some((i) => i.label === 'integer'))
  })

  it('go-to-definition finds a local secondary type', () => {
    const result = analyzeDocument('file:///tmp/feed.lexd', SAMPLE)
    const replyLine = SAMPLE.split('\n').findIndex((l) => l.includes('reply?: Reply'))
    const col = SAMPLE.split('\n')[replyLine]!.indexOf('Reply')
    const offset = offsetAt(SAMPLE, replyLine, col + 1)
    const loc = definitionAt(result, offset)
    assert.ok(loc)
    assert.equal(loc.uri, 'file:///tmp/feed.lexd')
    const declLine = SAMPLE.split('\n').findIndex((l) => l.trimStart().startsWith('type Reply'))
    assert.equal(loc.span.startLine - 1, declLine)
  })

  it('hover shows field type and constraints', () => {
    const result = analyzeDocument('file:///tmp/feed.lexd', SAMPLE)
    const textLine = SAMPLE.split('\n').findIndex((l) => l.includes('text: string'))
    const col = SAMPLE.split('\n')[textLine]!.indexOf('text')
    const offset = offsetAt(SAMPLE, textLine, col + 1)
    const hover = hoverAt(result, offset)
    assert.ok(hover)
    assert.match(hover.markdown, /text/)
    assert.match(hover.markdown, /string/)
    assert.match(hover.markdown, /maxGraphemes/)
  })
})
