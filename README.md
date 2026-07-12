# AT Proto Lexicon DSL (`lexd`)

A TypeScript toolchain that compiles a concise Lexicon DSL (`.lexd`) into AT Protocol lexicon JSON — usable with goat, `@atproto/lex`, pdsls, and the rest of the Atmosphere tooling.

## Quick example

```lexd
namespace app.bsky.actor {
  @record("self")
  type profile {
    @maxGraphemes(64) displayName?: string
    @maxGraphemes(256) description?: string
  }
}
```

Compiles to `app.bsky.actor.profile.json` with `defs.main` as a `record`.

## Packages

| Package | Role |
| --- | --- |
| `@lexd/core` | Parser, AST, lowering, JSON emitter |
| `@lexd/cli` | `lexd compile` CLI |
| `@lexd/vite-plugin` | Vite plugin (disk emit + optional `.lexd` imports) |

## Install / build

```bash
pnpm install
pnpm build
```

## CLI

```bash
pnpm --filter @lexd/cli exec lexd compile "examples/**/*.lexd" -o lexicons
# watch
pnpm --filter @lexd/cli exec lexd compile "examples/**/*.lexd" -o lexicons -w
# nested paths: app/bsky/actor/profile.json
pnpm --filter @lexd/cli exec lexd compile "examples/**/*.lexd" -o lexicons --layout nested
```

## Vite plugin

```ts
import { defineConfig } from 'vite'
import lexd from '@lexd/vite-plugin'

export default defineConfig({
  plugins: [
    lexd({
      include: 'src/**/*.lexd',
      outDir: 'lexicons',
      virtual: true, // import doc from './profile.lexd'
    }),
  ],
})
```

## MVP syntax

- `namespace a.b.c { ... }` — NSID prefix; each `@record` type becomes `a.b.c.<type>`
- `@record("self" | "tid" | "literal:…")` — primary record def (`main`)
- Trailing non-primary `type`s attach as sibling `defs` until the next primary
- `field?: Type` optional; `field: Type` required
- Types: `string`, `integer`, `boolean`, `bytes`, `cid-link`, `blob`, `unknown`, `T[]`, refs, `union(A, B)`
- Constraints: `@maxGraphemes`, `@minGraphemes`, `@maxLength`, `@minLength`, `@format`, `@default`, `@const`, `@enum`, `@knownValues`, `@description`

## Roadmap

Query, procedure, subscription, and permission-set primaries share the same pipeline and will land after the record MVP.
