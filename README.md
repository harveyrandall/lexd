# AT Proto Lexicon DSL (`lexd`)

A TypeScript toolchain that compiles a concise Lexicon DSL (`.lexd`) into AT Protocol lexicon JSON — usable with goat, [`@atproto/lex`](https://www.npmjs.com/package/@atproto/lex), [pdsls](https://pdsls.dev/), and the rest of the Atmosphere tooling.

## Quick example

```lexd
import { StrongRef } from "com.atproto.repo.strongRef"

namespace app.bsky.feed {
  @record("tid")
  type like {
    subject: StrongRef
    @format("datetime") createdAt: string
  }
}
```

```bash
pnpm build
pnpm lexd compile "examples/**/*.lexd" -o lexicons
```

## Packages

| Package | Role |
| --- | --- |
| `@lexd/core` | Parser, AST, import resolution, JSON emitter, decompiler |
| `@lexd/cli` | `lexd compile` / `lexd decompile` CLI |
| `@lexd/vite-plugin` | Vite plugin (disk emit + optional `.lexd` imports) |
| `@lexd/stdlib-atproto` | Curated `com.atproto.*` `.lexd` sources |
| `@lexd/stdlib-standard` | Curated `site.standard.*` `.lexd` sources |
| `@lexd/language-server` | LSP for `.lexd` (diagnostics, hover, completion, go-to-definition) |
| `vscode-lexd` | VS Code / Cursor extension client |

## Install / build

```bash
pnpm install
pnpm build
pnpm test
```

---

## Syntax cheat sheet

### Namespaces and records

```lexd
namespace app.bsky.actor {
  @record("self")              // record key: self | tid | literal:…
  @description("A profile")
  type profile {
    @maxGraphemes(64) displayName?: string   // optional
    @maxGraphemes(256) description?: string
  }
}
```

- `namespace a.b.c` is the NSID **prefix**; a `@record` type `profile` emits lexicon id `a.b.c.profile`.
- Fields without `?` are listed in JSON `required`.
- Trailing non-primary `type`s after a `@record` become sibling `defs` until the next primary.

### Object lexicons (no record)

Use `@object` when `main` should be an object (e.g. `com.atproto.repo.strongRef`):

```lexd
namespace com.atproto.repo {
  @object
  @description("A URI with a content-hash fingerprint.")
  type strongRef {
    @format("at-uri") uri: string
    @format("cid") cid: string
  }
}
```

### Defs modules

If a namespace contains **only** non-primary types (no `@record` / `@object`), the namespace **is** the lexicon id and each type becomes a named def (no `main`) — the `*.defs` pattern:

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

### Imports

```lexd
// Named import — aliases `main` of that lexicon (or a named def if the name matches)
import { StrongRef } from "com.atproto.repo.strongRef"
import { selfLabels } from "com.atproto.label.defs"

// Rename
import { StrongRef as Ref } from "com.atproto.repo.strongRef"

// Whole-module import — local name is the last NSID segment
import com.atproto.repo.strongRef
```

Imported symbols lower to **external refs** (`"com.atproto.repo.strongRef"` or `"com.atproto.label.defs#selfLabels"`). Foreign defs are never copied into the emitting lexicon.

Resolution order for a bare type name: **import alias → local def → error**.

### Queries, procedures, subscriptions

```lexd
namespace com.atproto.repo {
  @query
  @description("Get a single record from a repository.")
  type getRecord {
    params {
      @format("at-identifier") repo: string
      @format("nsid") collection: string
      @format("record-key") rkey: string
      @format("cid") cid?: string
    }
    output {
      encoding: "application/json"
      schema {
        @format("at-uri") uri: string
        value: unknown
      }
    }
    errors {
      RecordNotFound
    }
  }

  @procedure
  type createRecord {
    input {
      encoding: "application/json"
      schema {
        repo: string
        collection: string
        record: unknown
      }
    }
    output {
      encoding: "application/json"
      schema {
        @format("at-uri") uri: string
        @format("cid") cid: string
      }
    }
  }
}

namespace com.example.sync {
  @subscription
  type subscribeDemo {
    params { cursor?: integer }
    message {
      schema: union(#commit, #identity)
    }
    errors {
      FutureCursor
      ConsumerTooSlow: "Backpressure disconnect."
    }
  }

  type commit { seq: integer }
  type identity { seq: integer }
}
```

- `schema: TypeExpr` or `schema { fields… }` inside `input` / `output` / `message`
- `closed union(A, B)` sets `"closed": true`
- `@nullable` on a field adds it to the object `nullable` list
- `@accept([...])` / `@maxSize(n)` on `blob`
- `@token type Name {}` emits a token def

### Permission sets

```lexd
namespace app.bsky {
  @permissionSet
  @title("Create Bluesky Posts")
  @detail("Create only; no update/delete.")
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
}
```

### Types

| DSL | Lexicon |
| --- | --- |
| `string`, `integer`, `boolean`, `bytes`, `cid-link`, `blob`, `unknown` | same |
| `T[]` | `array` + `items` |
| `TypeName` / `#frag` / `ns.id` / `ns.id#frag` | `ref` |
| `union(A, B)` / `closed union(A, B)` | `union` (+ `closed`) |

### Constraints (field / type attributes)

`@maxGraphemes` `@minGraphemes` `@maxLength` `@minLength` `@format` `@default` `@const` `@enum` `@knownValues` `@description` `@minimum` `@maximum` `@accept` `@maxSize` `@nullable` `@title` `@detail`

On array fields, `@maxLength` / `@minLength` apply to the array length.

> **Reserved section words** (cannot be bare field names): `params`, `input`, `output`, `message`, `errors`, `permissions`, `encoding`, `schema`, `closed`, `union`.

---

## CLI

```bash
# From the repo (after pnpm build)
pnpm lexd compile "examples/**/*.lexd" -o lexicons

# Watch
pnpm lexd compile "examples/**/*.lexd" -o lexicons -w

# Nested paths: lexicons/app/bsky/actor/profile.json
pnpm lexd compile "examples/**/*.lexd" -o lexicons --layout nested

# Decompile lexicon JSON back to .lexd (flat NSID filenames)
pnpm lexd decompile lexicons -o recovered
pnpm lexd decompile lexicons/app.bsky.actor.profile.json -o recovered
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `-o, --out <dir>` | `lexicons` (compile) / `lexd-out` (decompile) | Output directory |
| `--layout flat\|nested` | `flat` | `id.json` vs `id/path.json` (compile only) |
| `-w, --watch` | off | Recompile on change |

`compile` also loads `@lexd/stdlib-atproto` and `@lexd/stdlib-standard` from the workspace/node_modules so `import { … } from "com.atproto…"` resolves without listing those files on the command line. Stdlib lexicons are emitted when you include their sources in the glob (or compile the stdlib package paths explicitly).

`decompile` writes one `.lexd` file per lexicon JSON using the flat NSID name (e.g. `app.bsky.actor.profile.lexd`). Known stdlib refs such as `com.atproto.repo.strongRef` become named imports (`StrongRef`) instead of inlined full NSIDs.

---

## Vite plugin

```ts
import { defineConfig } from 'vite'
import lexd from '@lexd/vite-plugin'

export default defineConfig({
  plugins: [
    lexd({
      include: 'src/**/*.lexd',
      outDir: 'lexicons',       // disk emit for goat / @atproto/lex
      layout: 'flat',
      virtual: true,            // import doc from './profile.lexd'
    }),
  ],
})
```

- **Disk emit** — writes JSON under `outDir` on `buildStart` and when `.lexd` files change in dev.
- **Virtual modules** — `import schema from './profile.lexd'` yields the compiled `LexiconDoc` (or an array if the file produces multiple docs).

---

## Stdlib

| Package | Namespace examples |
| --- | --- |
| `@lexd/stdlib-atproto` | `com.atproto.repo.strongRef`, … |
| `@lexd/stdlib-standard` | `site.standard.document` (starter shape) |

```lexd
import { StrongRef } from "com.atproto.repo.strongRef"
```

Add more curated `.lexd` files under `packages/stdlib-*/src` as the surface grows.

---

## Publishing lexicons (JSON only)

`lexd` only **emits** lexicon JSON. Publishing to the Atmosphere is unchanged:

1. Put the JSON in collection `com.atproto.lexicon.schema` with record key = lexicon NSID.
2. Prove namespace authority with a `_lexicon` DNS TXT record.

See [atproto made simple: publishing lexicons](https://underreacted.leaflet.pub/3mjfjsk24qk2i) for the mental model.

---

## Editor support (LSP / VS Code)

`@lexd/language-server` speaks the Language Server Protocol over stdio (`lexd-lsp` / `packages/language-server/dist/server.js`). The `vscode-lexd` extension contributes language id `lexd` for `.lexd` files and starts that server.

Features (MVP):

- Diagnostics from `parseLexd` / compile (syntax spans; compile errors when available)
- Completion for `@` constraints, primitives, section keywords, and in-scope symbols
- Hover for fields / types / imports
- Go to Definition for local secondary types and imported stdlib modules when indexed

### Run the extension locally

```bash
pnpm install
pnpm build
```

Then either:

1. **F5** — use the “Lexd Extension” config in `.vscode/launch.json`, or
2. **Install the folder** — `code --install-extension ./packages/vscode-lexd` (or `cursor --install-extension …`), or
3. **Package a VSIX** — see [`packages/vscode-lexd/README.md`](packages/vscode-lexd/README.md).

Open `examples/feed-post.lexd` to try diagnostics, `@` completion, and go-to-definition on `Reply`.

---

## Path to the full lexicon surface

| Milestone | Status |
| --- | --- |
| Records, objects, defs modules, imports, stdlib seeds | Done (M0/M1) |
| `@query` / `@procedure` / `@subscription` / `@permissionSet`, tokens, blob/nullable/closed unions | Done (M2) |
| JSON → `.lexd` decompiler | Done (M3) |
| LSP / VS Code extension | Done (M4) |

## Roadmap (short)

1. Polish decompiler (inline object fields, broader import preference, `--layout`)
2. Polish LSP (semantic tokens, compile-error spans, richer import navigation, VSIX bundling)
