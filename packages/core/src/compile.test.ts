import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { compile, docsEqual, type LexiconDoc } from './index.js'

const here = dirname(fileURLToPath(import.meta.url))
const examples = join(here, '../../../examples')

const expectedProfile: LexiconDoc = {
  lexicon: 1,
  id: 'app.bsky.actor.profile',
  defs: {
    main: {
      type: 'record',
      key: 'self',
      record: {
        type: 'object',
        properties: {
          displayName: { type: 'string', maxGraphemes: 64 },
          description: { type: 'string', maxGraphemes: 256 },
        },
      },
    },
  },
}

describe('lexd compile', () => {
  it('compiles the profile example to the article JSON', () => {
    const source = readFileSync(join(examples, 'profile.lexd'), 'utf8')
    const [result] = compile(source, 'profile.lexd')
    assert.ok(result)
    assert.equal(result.id, 'app.bsky.actor.profile')
    assert.ok(docsEqual(result.doc, expectedProfile))
  })

  it('compiles feed-post with secondary defs and local refs', () => {
    const source = readFileSync(join(examples, 'feed-post.lexd'), 'utf8')
    const [result] = compile(source, 'feed-post.lexd')
    assert.ok(result)
    assert.equal(result.id, 'app.bsky.feed.post')

    const main = result.doc.defs.main
    assert.ok(main && main.type === 'record')
    assert.equal(main.key, 'tid')
    assert.deepEqual(main.record.required, ['text', 'createdAt'])
    assert.equal(main.record.properties.text?.type, 'string')
    if (main.record.properties.text?.type === 'string') {
      assert.equal(main.record.properties.text.maxGraphemes, 300)
      assert.equal(main.record.properties.text.maxLength, 3000)
    }
    assert.equal(main.record.properties.reply?.type, 'ref')
    if (main.record.properties.reply?.type === 'ref') {
      assert.equal(main.record.properties.reply.ref, '#Reply')
    }
    assert.equal(main.record.properties.langs?.type, 'array')

    const reply = result.doc.defs.Reply
    assert.ok(reply && reply.type === 'object')
    assert.deepEqual(reply.required, ['root', 'parent'])
    assert.equal(reply.properties.root?.type, 'ref')
    if (reply.properties.root?.type === 'ref') {
      assert.equal(reply.properties.root.ref, '#StrongRef')
    }

    const strong = result.doc.defs.StrongRef
    assert.ok(strong && strong.type === 'object')
    assert.equal(strong.properties.uri?.type, 'string')
    if (strong.properties.uri?.type === 'string') {
      assert.equal(strong.properties.uri.format, 'at-uri')
    }
  })

  it('supports union and full NSID refs', () => {
    const source = `
namespace com.example {
  @record("tid")
  type item {
    value: union(#Text, #Image)
    author: app.bsky.actor.profile
  }

  type Text {
    text: string
  }

  type Image {
    alt?: string
  }
}
`
    const [result] = compile(source)
    assert.ok(result)
    const main = result.doc.defs.main
    assert.ok(main && main.type === 'record')
    const value = main.record.properties.value
    assert.equal(value?.type, 'union')
    if (value?.type === 'union') {
      assert.deepEqual(value.refs, ['#Text', '#Image'])
    }
    const author = main.record.properties.author
    assert.equal(author?.type, 'ref')
    if (author?.type === 'ref') {
      assert.equal(author.ref, 'app.bsky.actor.profile')
    }
  })

  it('rejects orphan secondary types', () => {
    assert.throws(
      () =>
        compile(`
namespace com.example {
  type Orphan {
    x: string
  }
}
`),
      /no preceding primary/,
    )
  })
})
