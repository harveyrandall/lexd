# Getting started

This guide walks through compiling your first `.lexd` file to lexicon JSON.

## Prerequisites

- **Node.js** 20+ (22 recommended)
- **pnpm** 10+ (for developing from source)

## 1. Clone and build

```bash
git clone https://github.com/harveyrandall/lexd.git
cd lexd
pnpm install
pnpm build
```

## 2. Write a lexicon

Create `examples/hello.lexd`:

```lexd
namespace app.example.hello {
  @record("tid")
  @description("A minimal greeting record")
  type greeting {
    @maxGraphemes(280) text: string
    @format("datetime") createdAt: string
  }
}
```

## 3. Compile

From the repo root:

```bash
pnpm lexd compile "examples/hello.lexd" -o lexicons
```

You should see:

```
wrote lexicons/app.example.hello.greeting.json
```

Inspect the output — it is a standard Lexicon document with `"lexicon": 1` and a `main` record def.

## 4. Use imports from stdlib

Most real lexicons reference shared AT Proto types:

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

The compiler resolves `com.atproto.repo.strongRef` from `@lexd/stdlib-atproto` automatically when it is installed in the workspace.

Try the bundled example:

```bash
pnpm lexd compile "examples/**/*.lexd" -o lexicons
```

## 5. Validate before publish

```bash
pnpm lexd validate "examples/**/*.lexd"
# validated N lexicon(s)
```

## 6. Editor support (optional)

For diagnostics, completion, and go-to-definition:

1. Build the monorepo (`pnpm build`)
2. Open the repo in VS Code / Cursor
3. Press **F5** with the **Lexd Extension** launch config, or install the VSIX — see [Editor & LSP](/editor.md)

## Project layout (typical app)

```
my-app/
├── lexicons/          # compiled JSON (gitignored or committed)
├── schemas/
│   └── app.bsky.feed/
│       └── post.lexd
└── package.json       # depends on @lexd/cli or uses vite-plugin
```

## Next

- [Installation](/installation.md) — npm packages, global CLI, VSIX
- [Syntax reference](/syntax.md) — records, XRPC, unions, constraints
- [CLI](/cli.md) — watch mode, decompile, publish
