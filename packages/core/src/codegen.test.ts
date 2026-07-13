import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { planLexCodegen, tryAtprotoLexCodegen } from './codegen.js'
import type { LexiconDoc } from './lexicon.js'

const sampleDoc: LexiconDoc = {
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

describe('codegen', () => {
  it('planLexCodegen emits nested JSON paths', () => {
    const plan = planLexCodegen([sampleDoc], { outDir: 'out' })
    assert.equal(plan.artifacts.length, 1)
    assert.equal(plan.artifacts[0]?.path, 'app/bsky/actor/profile.json')
    assert.match(plan.artifacts[0]?.content ?? '', /"lexicon": 1/)
  })

  it('tryAtprotoLexCodegen returns false when @atproto/lex-cli is unavailable', async () => {
    const result = await tryAtprotoLexCodegen([sampleDoc], { outDir: 'out' })
    assert.equal(result, false)
  })
})
