import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ModuleRegistry } from './registry.js'

describe('ModuleRegistry', () => {
  it('clone copies module exports without sharing defKeys sets', () => {
    const source = new ModuleRegistry()
    source.register({ id: 'com.example.foo', defKeys: new Set(['main', 'bar']) })

    const copy = source.clone()
    assert.ok(copy.has('com.example.foo'))
    assert.equal(copy.get('com.example.foo')?.defKeys.size, 2)

    copy.get('com.example.foo')!.defKeys.add('baz')
    assert.equal(source.get('com.example.foo')?.defKeys.size, 2)
  })
})
