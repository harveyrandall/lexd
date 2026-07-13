# Imports & stdlib

Lexd resolves cross-lexicon references through **imports** and ships curated **stdlib** packages.

## Import syntax

```lexd
// Named import — main or named def
import { StrongRef } from "com.atproto.repo.strongRef"
import { selfLabels } from "com.atproto.label.defs"

// Rename
import { StrongRef as Ref } from "com.atproto.repo.strongRef"

// Whole-module import (local name = last NSID segment)
import com.atproto.repo.strongRef
```

Imported symbols lower to **external refs** in JSON:

```json
{ "type": "ref", "ref": "com.atproto.repo.strongRef" }
```

Foreign defs are never copied into the emitting lexicon.

## Name resolution

For a bare type name in field position:

1. **Import alias** in the current file
2. **Local def** (`#TypeName` or secondary type in namespace)
3. **Error** if unresolved

Full NSIDs (`com.atproto.repo.strongRef`) and fragment refs (`#Reply`) are also supported.

## Stdlib packages

| Package | Namespaces |
| --- | --- |
| `@lexd/stdlib-atproto` | `com.atproto.*` (repo, label, server, sync, …) |
| `@lexd/stdlib-standard` | `site.standard.*` |

### Example

```lexd
import { StrongRef } from "com.atproto.repo.strongRef"

namespace app.bsky.feed {
  @record("tid")
  type like {
    subject: StrongRef
    createdAt: string
  }
}
```

Install stdlib in your project:

```bash
pnpm add @lexd/stdlib-atproto
```

In the lexd monorepo, resolution works automatically after `pnpm install`.

## Bootstrap from upstream

Maintainers can refresh stdlib from [bluesky-social/atproto](https://github.com/bluesky-social/atproto) lexicons:

```bash
pnpm stdlib:bootstrap
```

This:

1. Fetches JSON listed in `packages/stdlib-atproto/manifest.json`
2. Decompiles to `.lexd` under `packages/stdlib-atproto/src/`
3. Regenerates `packages/core/src/stdlib-imports.ts` (preferred import names)

## Decompiler import preferences

When decompiling JSON, known stdlib refs become imports instead of full NSIDs. Preferences live in `STDLIB_MAIN_IMPORTS` and `STDLIB_MODULE_PREFIXES` in `@lexd/core`.

## Adding custom stdlib

1. Add `.lexd` files under `packages/stdlib-atproto/src/` (or a new package)
2. Ensure the compiler can discover them via `node_modules` or workspace paths
3. For LSP, include the directory in workspace roots

## Related

- [Syntax reference](/syntax.md) — defs modules and refs
- [CLI](/cli.md) — `stdlib:bootstrap` script
