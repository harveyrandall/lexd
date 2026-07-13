# CLI

The `lexd` command compiles, decompiles, validates, and publishes lexicon JSON.

## Commands

| Command | Description |
| --- | --- |
| `lexd compile <patterns…>` | Compile `.lexd` → JSON |
| `lexd decompile <file\|dir>` | Decompile JSON → `.lexd` |
| `lexd validate <patterns…>` | Compile + validate lexicon shape |
| `lexd publish <patterns…>` | Validate, compile, write JSON |

## compile

```bash
lexd compile "src/**/*.lexd" -o lexicons
lexd compile "src/**/*.lexd" -o lexicons --layout nested
lexd compile "src/**/*.lexd" -o lexicons -w   # watch mode
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `-o, --out <dir>` | `lexicons` | Output directory |
| `--layout flat\|nested` | `flat` | `id.json` vs `id/path.json` |
| `-w, --watch` | off | Recompile on file changes |

Stdlib imports (`com.atproto.*`, `site.standard.*`) resolve from `@lexd/stdlib-*` in `node_modules` without listing those files in the glob.

## decompile

```bash
lexd decompile lexicons -o recovered
lexd decompile lexicons/app.bsky.actor.profile.json -o recovered
lexd decompile lexicons --layout nested -o recovered
```

Converts lexicon JSON back to `.lexd`. Known stdlib refs become named imports; inline JSON objects are hoisted to secondary types.

| Flag | Default | Description |
| --- | --- | --- |
| `-o, --out <dir>` | `lexd-out` | Output directory |
| `--layout flat\|nested` | `flat` | Match compile layout |

## validate

```bash
lexd validate "src/**/*.lexd"
```

Compiles all matched files and checks:

- Lexicon version and NSID shape
- Non-empty defs
- Valid primary def types on `#main`
- No duplicate ids in a batch

Exits with code 1 and prints errors on failure.

## publish

```bash
lexd publish "src/**/*.lexd" -o lexicons --layout nested
lexd publish "src/**/*.lexd" -o lexicons --dry-run
```

Same validation as `validate`, then writes JSON. `--dry-run` prints paths without writing — useful in CI.

| Flag | Default | Description |
| --- | --- | --- |
| `-o, --out <dir>` | `lexicons` | Output directory |
| `--layout flat\|nested` | `flat` | Output path layout |
| `--dry-run` | off | Preview paths only |

## Stdlib bootstrap

Sync `com.atproto.*` sources from upstream atproto lexicons:

```bash
pnpm stdlib:bootstrap
```

Updates `packages/stdlib-atproto/src/*.lexd` and `packages/core/src/stdlib-imports.ts`.

## Examples

```bash
# From monorepo root after pnpm build
pnpm lexd compile "examples/**/*.lexd" -o lexicons
pnpm lexd decompile lexicons -o recovered
pnpm lexd validate "examples/**/*.lexd"
pnpm lexd publish "examples/**/*.lexd" -o lexicons --dry-run
```
