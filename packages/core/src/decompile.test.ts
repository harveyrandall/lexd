import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compileFiles,
  decompile,
  docsEqual,
  type LexiconDoc,
} from './index.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../..')

function roundTrip(lexdPath: string): { original: LexiconDoc; decompiled: string; again: LexiconDoc } {
  const compiled = compileFiles([lexdPath], { cwd: repoRoot })
  assert.ok(compiled[0], `expected compile output for ${lexdPath}`)
  const original = compiled[0].doc
  const decompiled = decompile(original)

  const dir = mkdtempSync(join(tmpdir(), 'lexd-decompile-'))
  const tmp = join(dir, 'round.lexd')
  writeFileSync(tmp, decompiled)

  const recompiled = compileFiles([tmp], { cwd: repoRoot })
  const again = recompiled.find((r) => r.id === original.id) ?? recompiled[0]
  assert.ok(again, `expected recompile output for ${original.id}`)
  return { original, decompiled, again: again.doc }
}

describe('lexd decompile', () => {
  it('round-trips examples/profile.lexd', () => {
    const { original, again } = roundTrip(join(repoRoot, 'examples/profile.lexd'))
    assert.ok(docsEqual(original, again))
  })

  it('round-trips stdlib strongRef and prefers no self-import', () => {
    const path = join(
      repoRoot,
      'packages/stdlib-atproto/src/com.atproto.repo.strongRef.lexd',
    )
    const { original, decompiled, again } = roundTrip(path)
    assert.ok(docsEqual(original, again))
    assert.match(decompiled, /@object/)
    assert.doesNotMatch(decompiled, /import \{/)
  })

  it('round-trips getRecord query', () => {
    const path = join(
      repoRoot,
      'packages/stdlib-atproto/src/com.atproto.repo.getRecord.lexd',
    )
    const { original, decompiled, again } = roundTrip(path)
    assert.ok(docsEqual(original, again))
    assert.match(decompiled, /@query/)
    assert.match(decompiled, /type getRecord/)
    assert.match(decompiled, /params \{/)
    assert.match(decompiled, /RecordNotFound/)
  })

  it('prefers StrongRef import when decompiling refs to strongRef', () => {
    const { original, decompiled, again } = roundTrip(join(repoRoot, 'examples/like.lexd'))
    assert.ok(docsEqual(original, again))
    assert.match(
      decompiled,
      /import \{ StrongRef \} from "com\.atproto\.repo\.strongRef"/,
    )
    assert.match(decompiled, /subject: StrongRef/)
    assert.doesNotMatch(decompiled, /subject: com\.atproto\.repo\.strongRef/)
  })

  it('round-trips feed-post with StrongRef import and secondary defs', () => {
    const { original, decompiled, again } = roundTrip(join(repoRoot, 'examples/feed-post.lexd'))
    assert.ok(docsEqual(original, again))
    assert.match(
      decompiled,
      /import \{ StrongRef \} from "com\.atproto\.repo\.strongRef"/,
    )
    assert.match(decompiled, /type Reply \{/)
    assert.match(decompiled, /root: StrongRef/)
  })

  it('hoists inline object fields to named secondary types', () => {
    const doc: LexiconDoc = {
      lexicon: 1,
      id: 'test.inline.object',
      defs: {
        main: {
          type: 'object',
          properties: {
            meta: {
              type: 'object',
              required: ['label'],
              properties: {
                label: { type: 'string' },
                count: { type: 'integer' },
              },
            },
          },
        },
      },
    }
    const source = decompile(doc)
    assert.match(source, /meta\?: Meta/)
    assert.match(source, /type Meta \{/)
    assert.doesNotMatch(source, /meta: unknown/)

    const dir = mkdtempSync(join(tmpdir(), 'lexd-inline-'))
    const tmp = join(dir, 'inline.lexd')
    writeFileSync(tmp, source)
    const recompiled = compileFiles([tmp], { cwd: repoRoot })
    const again = recompiled.find((r) => r.id === doc.id)?.doc
    assert.ok(again)
    const meta = again.defs.main?.properties?.meta
    assert.equal(meta?.type, 'ref')
    assert.equal(meta?.ref, '#Meta')
    const metaDef = again.defs.Meta
    assert.ok(metaDef && metaDef.type === 'object')
    if (metaDef?.type === 'object') {
      assert.equal(metaDef.properties?.label?.type, 'string')
      assert.equal(metaDef.properties?.count?.type, 'integer')
    }
  })

  it('hoists array-of-object fields using the field name', () => {
    const doc: LexiconDoc = {
      lexicon: 1,
      id: 'test.inline.array',
      defs: {
        main: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: {
                type: 'object',
                required: ['label'],
                properties: {
                  label: { type: 'string' },
                },
              },
            },
          },
        },
      },
    }
    const source = decompile(doc)
    assert.match(source, /tags\?: Tags\[\]/)
    assert.match(source, /type Tags \{/)
    assert.doesNotMatch(source, /Inline1/)
  })
})
