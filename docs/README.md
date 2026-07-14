# Lexd

**Lexd** is a TypeScript toolchain for the AT Protocol **Lexicon DSL** (`.lexd`). It compiles concise, readable schema sources into standard lexicon JSON — the same format used by [goat](https://github.com/bluesky-social/goat), [`@atproto/lex`](https://www.npmjs.com/package/@atproto/lex), [pdsls](https://pdsls.dev/), and the rest of the Atmosphere stack.

If you have worked with Protocol Buffers, OpenAPI, or GraphQL SDL, Lexicon DSL fills a similar role: **one authoritative schema language** that generates the JSON lexicons PDS and clients expect.

## Why Lexd?

| Problem | Lexd approach |
| --- | --- |
| Hand-maintaining large JSON lexicon files | Write `.lexd` with namespaces, imports, and field syntax |
| Duplicated `strongRef`-style defs | Import from `@lexd/stdlib-atproto` |
| No editor support for lexicons | LSP diagnostics, completion, hover, go-to-definition |
| JSON-only workflows | `lexd decompile` round-trips JSON → `.lexd` |

## Hello, lexicon

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
lexd compile "src/**/*.lexd" -o lexicons
# → lexicons/app.bsky.feed.like.json
```

## Packages

| Package | Description |
| --- | --- |
| [`@lexd/core`](https://github.com/harveyrandall/lexd/tree/main/packages/core) | Parser, compiler, decompiler, validator |
| [`@lexd/cli`](https://github.com/harveyrandall/lexd/tree/main/packages/cli) | `lexd` command-line tool |
| [`@lexd/vite-plugin`](https://github.com/harveyrandall/lexd/tree/main/packages/vite-plugin) | Vite integration |
| [`@lexd/stdlib-atproto`](https://github.com/harveyrandall/lexd/tree/main/packages/stdlib-atproto) | Curated `com.atproto.*` sources |
| [`@lexd/stdlib-standard`](https://github.com/harveyrandall/lexd/tree/main/packages/stdlib-standard) | Curated `site.standard.*` sources |
| [`@lexd/language-server`](https://github.com/harveyrandall/lexd/tree/main/packages/language-server) | LSP server |
| `vscode-lexd` | VS Code / Cursor extension (VSIX) |
| [`@lexd/cli`](https://www.npmjs.com/package/@lexd/cli) | CLI |
| [VS Code extension](https://marketplace.visualstudio.com/items?itemName=harveyrandall.vscode-lexd) | Editor support |

## What you can define

- **Records** — `app.bsky.feed.post`, profile, likes, …
- **Objects** — reusable shapes like `com.atproto.repo.strongRef`
- **Defs modules** — named fragments (`com.atproto.label.defs`)
- **XRPC** — `@query`, `@procedure`, `@subscription`
- **Permission sets** — OAuth-style capability bundles
- **Tokens, unions, blobs, nullable fields** — full Lexicon surface

## Next steps

- [Getting started](/getting-started.md) — compile your first lexicon in five minutes
- [Installation](/installation.md) — monorepo, npm packages, VSIX
- [Syntax reference](/syntax.md) — language cheat sheet
- [CLI](/cli.md) — compile, decompile, validate, publish

## Links

- [Repository](https://github.com/harveyrandall/lexd)
- [AT Protocol Lexicons spec](https://atproto.com/specs/lexicon)
- [Publishing lexicons (guide)](https://underreacted.leaflet.pub/3mjfjsk24qk2i)
