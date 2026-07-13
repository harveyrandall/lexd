import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateLexiconDoc, validateLexiconDocs } from './validate.js'
import type { LexiconDoc } from './lexicon.js'

const validDoc: LexiconDoc = {
  lexicon: 1,
  id: 'app.bsky.actor.profile',
  defs: {
    main: {
      type: 'record',
      key: 'self',
      record: { type: 'object', properties: {} },
    },
  },
}

describe('validateLexiconDoc', () => {
  it('accepts a valid record lexicon', () => {
    assert.deepEqual(validateLexiconDoc(validDoc), [])
  })

  it('rejects invalid lexicon version', () => {
    const errors = validateLexiconDoc({ ...validDoc, lexicon: 2 })
    assert.match(errors[0] ?? '', /lexicon version must be 1/)
  })

  it('rejects missing or shallow NSID ids', () => {
    assert.match(validateLexiconDoc({ ...validDoc, id: '' })[0] ?? '', /valid NSID/)
    assert.match(validateLexiconDoc({ ...validDoc, id: 'a.b' })[0] ?? '', /valid NSID/)
  })

  it('rejects empty defs without undefined id interpolation', () => {
    const errors = validateLexiconDoc({ lexicon: 1, id: '', defs: {} })
    assert.ok(errors.some((e) => e.includes('(unknown)')))
    assert.ok(errors.some((e) => e.includes('defs must not be empty')))
  })

  it('rejects invalid primary def types', () => {
    for (const type of ['string', 'blob', 'ref', 'union', 'unknown'] as const) {
      const doc: LexiconDoc = {
        lexicon: 1,
        id: 'test.example.bad',
        defs: { main: { type } as LexiconDoc['defs'][string] },
      }
      const errors = validateLexiconDoc(doc)
      assert.ok(errors.some((e) => e.includes('primary def cannot be type')))
    }
  })
})

describe('validateLexiconDocs', () => {
  it('reports duplicate ids across a batch', () => {
    const errors = validateLexiconDocs([validDoc, validDoc])
    assert.match(errors[0] ?? '', /duplicate lexicon id/)
  })
})
