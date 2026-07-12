import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  compile,
  compileFiles,
  docsEqual,
  discoverStdlibLexdFiles,
  type LexiconDoc,
} from './index.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../..')
const examples = join(repoRoot, 'examples')

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

  it('compiles feed-post with StrongRef import from stdlib', () => {
    const results = compileFiles([join(examples, 'feed-post.lexd')], {
      cwd: repoRoot,
      includeStdlib: true,
    })
    const result = results.find((r) => r.id === 'app.bsky.feed.post')
    assert.ok(result)

    const main = result.doc.defs.main
    assert.ok(main && main.type === 'record')
    assert.equal(main.key, 'tid')
    assert.deepEqual(main.record.required, ['text', 'createdAt'])

    const reply = result.doc.defs.Reply
    assert.ok(reply && reply.type === 'object')
    assert.equal(reply.properties.root?.type, 'ref')
    if (reply.properties.root?.type === 'ref') {
      assert.equal(reply.properties.root.ref, 'com.atproto.repo.strongRef')
    }
    if (reply.properties.parent?.type === 'ref') {
      assert.equal(reply.properties.parent.ref, 'com.atproto.repo.strongRef')
    }
  })

  it('compiles like example with imported StrongRef on a field', () => {
    const results = compileFiles([join(examples, 'like.lexd')], { cwd: repoRoot })
    const result = results.find((r) => r.id === 'app.bsky.feed.like')
    assert.ok(result)
    const main = result.doc.defs.main
    assert.ok(main && main.type === 'record')
    const subject = main.record.properties.subject
    assert.equal(subject?.type, 'ref')
    if (subject?.type === 'ref') {
      assert.equal(subject.ref, 'com.atproto.repo.strongRef')
    }
  })

  it('compiles @object strongRef stdlib source', () => {
    const stdlib = discoverStdlibLexdFiles(repoRoot)
    const strongPath = stdlib.find((p) => p.includes('strongRef'))
    assert.ok(strongPath)
    const results = compileFiles([strongPath], { cwd: repoRoot, includeStdlib: false })
    const result = results.find((r) => r.id === 'com.atproto.repo.strongRef')
    assert.ok(result)
    const main = result.doc.defs.main
    assert.ok(main && main.type === 'object')
    assert.deepEqual(main.required, ['uri', 'cid'])
  })

  it('compiles defs modules without main', () => {
    const stdlib = discoverStdlibLexdFiles(repoRoot)
    const defsPath = stdlib.find((p) => p.includes('label.defs'))
    assert.ok(defsPath)
    const results = compileFiles([defsPath], { cwd: repoRoot, includeStdlib: false })
    const result = results.find((r) => r.id === 'com.atproto.label.defs')
    assert.ok(result)
    assert.equal(result.doc.defs.main, undefined)
    assert.ok(result.doc.defs.selfLabel)
    assert.ok(result.doc.defs.selfLabels)
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
  })

  it('rejects unknown bare type names', () => {
    assert.throws(
      () =>
        compile(`
namespace com.example {
  @record("tid")
  type item {
    x: Missing
  }
}
`),
      /Unknown type "Missing"/,
    )
  })

  it('rejects non-primary types before the first primary', () => {
    assert.throws(
      () =>
        compile(`
namespace com.example {
  type Orphan {
    x: string
  }
  @record("tid")
  type item {
    y: string
  }
}
`),
      /no preceding primary/,
    )
  })
})

describe('defs and imports', () => {
  it('treats primary-less namespaces as defs modules', () => {
    const [result] = compile(`
namespace com.example.defs {
  type Foo {
    x: string
  }
}
`)
    assert.ok(result)
    assert.equal(result.id, 'com.example.defs')
    assert.ok(result.doc.defs.Foo)
    assert.equal(result.doc.defs.main, undefined)
  })

  it('resolves named import of a defs fragment', () => {
    const results = compileFiles(
      [
        join(repoRoot, 'packages/stdlib-atproto/src/com.atproto.label.defs.lexd'),
        join(repoRoot, 'packages/stdlib-standard/src/site.standard.document.lexd'),
      ],
      { cwd: repoRoot, includeStdlib: true },
    )
    const doc = results.find((r) => r.id === 'site.standard.document')
    assert.ok(doc)
    const main = doc.doc.defs.main
    assert.ok(main && main.type === 'record')
    const labels = main.record.properties.labels
    assert.equal(labels?.type, 'ref')
    if (labels?.type === 'ref') {
      assert.equal(labels.ref, 'com.atproto.label.defs#selfLabels')
    }
  })
})

describe('xrpc and permission-set', () => {
  it('compiles com.atproto.repo.getRecord query', () => {
    const path = join(repoRoot, 'packages/stdlib-atproto/src/com.atproto.repo.getRecord.lexd')
    const [result] = compileFiles([path], { cwd: repoRoot, includeStdlib: false })
    assert.ok(result)
    assert.equal(result.id, 'com.atproto.repo.getRecord')
    const main = result.doc.defs.main
    assert.ok(main && main.type === 'query')
    assert.ok(main.parameters)
    assert.deepEqual(main.parameters.required, ['repo', 'collection', 'rkey'])
    assert.equal(main.output?.encoding, 'application/json')
    assert.equal(main.errors?.[0]?.name, 'RecordNotFound')
  })

  it('compiles createRecord procedure', () => {
    const path = join(repoRoot, 'packages/stdlib-atproto/src/com.atproto.repo.createRecord.lexd')
    const [result] = compileFiles([path], { cwd: repoRoot, includeStdlib: false })
    assert.ok(result)
    const main = result.doc.defs.main
    assert.ok(main && main.type === 'procedure')
    assert.ok(main.input?.schema)
    assert.equal(main.errors?.[0]?.name, 'InvalidSwap')
  })

  it('compiles getProfile query with output ref', () => {
    const path = join(examples, 'get-profile.lexd')
    const [result] = compileFiles([path], { cwd: repoRoot, includeStdlib: false })
    assert.ok(result)
    const main = result.doc.defs.main
    assert.ok(main && main.type === 'query')
    assert.equal(main.output?.schema?.type, 'ref')
    if (main.output?.schema?.type === 'ref') {
      assert.equal(main.output.schema.ref, 'app.bsky.actor.defs#profileViewDetailed')
    }
  })

  it('compiles subscription with union message and secondary defs', () => {
    const path = join(examples, 'subscribe-demo.lexd')
    const [result] = compileFiles([path], { cwd: repoRoot, includeStdlib: false })
    assert.ok(result)
    const main = result.doc.defs.main
    assert.ok(main && main.type === 'subscription')
    assert.equal(main.message.schema.type, 'union')
    if (main.message.schema.type === 'union') {
      assert.deepEqual(main.message.schema.refs, ['#commit', '#identity'])
    }
    assert.ok(result.doc.defs.commit)
    assert.ok(result.doc.defs.identity)
  })

  it('compiles permission-set', () => {
    const path = join(examples, 'auth-create-posts.lexd')
    const [result] = compileFiles([path], { cwd: repoRoot, includeStdlib: false })
    assert.ok(result)
    const main = result.doc.defs.main
    assert.ok(main && main.type === 'permission-set')
    assert.equal(main.title, 'Create Bluesky Posts')
    assert.equal(main.permissions.length, 2)
    assert.equal(main.permissions[0]?.resource, 'rpc')
    assert.equal(main.permissions[1]?.resource, 'repo')
  })

  it('supports closed unions, nullable, blob attrs, and tokens', () => {
    const [result] = compile(`
namespace com.example {
  @record("tid")
  type item {
    payload: closed union(#A, #B)
    @nullable maybe?: string
    @accept(["image/*"]) @maxSize(1000000) image?: blob
  }

  type A {
    x: string
  }

  type B {
    y: integer
  }

  @token
  @description("A marker token")
  type marker {}
}
`)
    assert.ok(result)
    const main = result.doc.defs.main
    assert.ok(main && main.type === 'record')
    const payload = main.record.properties.payload
    assert.equal(payload?.type, 'union')
    if (payload?.type === 'union') {
      assert.equal(payload.closed, true)
    }
    assert.deepEqual(main.record.nullable, ['maybe'])
    const image = main.record.properties.image
    assert.equal(image?.type, 'blob')
    if (image?.type === 'blob') {
      assert.deepEqual(image.accept, ['image/*'])
      assert.equal(image.maxSize, 1000000)
    }
    const marker = result.doc.defs.marker
    assert.ok(marker && marker.type === 'token')
  })
})
