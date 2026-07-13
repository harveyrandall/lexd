# Syntax reference

Lexd is a domain-specific language for [AT Protocol Lexicons](https://atproto.com/specs/lexicon). This page summarizes the surface area; see the [repo examples](https://github.com/harveyrandall/lexd/tree/main/examples) for full files.

## File structure

A `.lexd` file contains optional imports followed by one or more namespaces:

```lexd
import { StrongRef } from "com.atproto.repo.strongRef"

namespace app.bsky.feed {
  @record("tid")
  type post { /* … */ }

  type Reply { /* secondary def */ }
}
```

## Namespaces and records

```lexd
namespace app.bsky.actor {
  @record("self")
  @description("A profile")
  type profile {
    @maxGraphemes(64) displayName?: string
    @maxGraphemes(256) description?: string
  }
}
```

| Concept | Meaning |
| --- | --- |
| `namespace a.b.c` | NSID prefix for types in this block |
| `@record("self")` | Record key: `self`, `tid`, or `literal:…` |
| `type profile` | Primary type → lexicon id `a.b.c.profile` |
| `field?: type` | Optional field (omitted from `required`) |
| Trailing `type`s | Secondary defs in the same lexicon file |

## Object lexicons

Use `@object` when `main` should be an object (not a record):

```lexd
namespace com.atproto.repo {
  @object
  type strongRef {
    @format("at-uri") uri: string
    @format("cid") cid: string
  }
}
```

## Defs modules

Namespaces with **only** non-primary types emit a defs module (no `main`):

```lexd
namespace com.atproto.label.defs {
  type selfLabel {
    @maxGraphemes(128) val: string
  }
  type selfLabels {
    values: selfLabel[]
  }
}
```

## Inline object fields

```lexd
meta: {
  label: string
  count?: integer
}
```

## Types

| DSL | Lexicon JSON |
| --- | --- |
| `string`, `integer`, `boolean`, `bytes`, `cid-link`, `blob`, `unknown` | same |
| `T[]` | `{ "type": "array", "items": … }` |
| `TypeName`, `#frag`, `ns.id`, `ns.id#frag` | `{ "type": "ref", "ref": "…" }` |
| `union(A, B)` | `{ "type": "union", "refs": […] }` |
| `closed union(A, B)` | union with `"closed": true` |

## Constraints

Field and type attributes:

`@maxGraphemes` `@minGraphemes` `@maxLength` `@minLength` `@format` `@default` `@const` `@enum` `@knownValues` `@description` `@minimum` `@maximum` `@accept` `@maxSize` `@nullable` `@title` `@detail`

On array fields, `@maxLength` / `@minLength` constrain array length.

## XRPC

### Query

```lexd
@query
type getRecord {
  params {
    @format("at-identifier") repo: string
    collection: string
    rkey: string
  }
  output {
    encoding: "application/json"
    schema { uri: string; value: unknown }
  }
  errors { RecordNotFound }
}
```

### Procedure

```lexd
@procedure
type createRecord {
  input {
    encoding: "application/json"
    schema { repo: string; collection: string; record: unknown }
  }
  output {
    encoding: "application/json"
    schema { uri: string; cid: string }
  }
}
```

### Subscription

```lexd
@subscription
type subscribeRepos {
  params { cursor?: integer }
  message {
    schema: union(#commit, #identity)
  }
  errors { FutureCursor }
}

type commit { seq: integer }
type identity { seq: integer }
```

## Permission sets

```lexd
@permissionSet
@title("Create Posts")
type authCreatePosts {
  permissions {
    rpc {
      inheritAud: true
      lxm: ["app.bsky.video.uploadVideo"]
    }
    repo {
      collection: ["app.bsky.feed.post"]
      action: ["create"]
    }
  }
}
```

## Tokens

```lexd
@token
type myMarker {}
```

## Scalar defs

```lexd
@scalar("string")
@knownValues("a", "b")
type myEnum {}
```

## Reserved words

These cannot be used as bare field names (use them only as section headers):

`params`, `input`, `output`, `message`, `errors`, `permissions`, `encoding`, `schema`, `closed`, `union`

## Imports

See [Imports & stdlib](/stdlib.md).
