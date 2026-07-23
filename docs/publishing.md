# Publishing

Lexd **emits** lexicon JSON. Publishing to the AT Protocol network is a separate step.

## Emit JSON locally

```bash
lexd publish "src/**/*.lexd" -o lexicons --layout nested
lexd publish "src/**/*.lexd" -o lexicons --dry-run   # CI preview
```

This validates shape, compiles, and writes files. It does **not** upload to a PDS.

## Publish to Atmosphere

To make lexicons discoverable on the network:

1. **Store JSON** in collection `com.atproto.lexicon.schema` with record key = lexicon NSID
2. **Prove namespace authority** with a `_lexicon` DNS TXT record on your domain

Lexd output is compatible with goat, `@atproto/lex`, and manual PDS uploads.

Further reading: [atproto made simple: publishing lexicons](https://underreacted.leaflet.pub/3mjfjsk24qk2i)

## npm packages

Publishable `@lexd/*` packages include MIT license, `publishConfig.access: public`, and `prepack` build steps.

From the monorepo after version bumps:

```bash
pnpm pack:packages    # dry-run tarballs (dependency order)
pnpm publish:packages # core → stdlib → cli / lsp / vite-plugin
```

| Package | Published |
| --- | --- |
| `@lexd/core` | yes |
| `@lexd/cli` | yes |
| `@lexd/vite-plugin` | yes |
| `@lexd/language-server` | yes |
| `@lexd/stdlib-atproto` | yes |
| `@lexd/stdlib-standard` | yes |
| `vscode-lexd` | no (VSIX only) |

## VSIX extension

```bash
pnpm package:vsix
# → packages/vscode-lexd/vscode-lexd-<version>.vsix
```

CI builds the VSIX on every push. Download from [Actions artifacts](https://github.com/harveyrandall/lexd/actions) or build locally.

Install from the Marketplace: [harveyrandall.vscode-lexd](https://marketplace.visualstudio.com/items?itemName=harveyrandall.vscode-lexd).

### Publish a new Marketplace version

1. Log in once: `cd packages/vscode-lexd && pnpm exec vsce login harveyrandall` (PAT with Marketplace **Manage** scope).
2. Run the full release pipeline from the repo root:

```bash
pnpm release:vscode              # build → test → package:vsix → publish patch
pnpm release:vscode:minor
pnpm release:vscode:major
pnpm release:vscode 0.1.2          # explicit version
```

3. Or publish manually after build/test:

```bash
cd packages/vscode-lexd

# Semver bump
pnpm run vscode:publish:patch

# Explicit version (sets package.json to 0.1.2 and publishes)
pnpm exec vsce publish 0.1.2 --no-dependencies
pnpm run publish:marketplace -- 0.1.2
```

Always pass `--no-dependencies` when using `vsce publish` from this pnpm workspace — the extension bundle is self-contained and `vsce`’s dependency check fails on `workspace:*` links.

See [Editor & LSP](/editor.md#publish-to-marketplace) and [`packages/vscode-lexd/README.md`](https://github.com/harveyrandall/lexd/blob/main/packages/vscode-lexd/README.md).

## Validation in CI

```bash
pnpm lexd validate "schemas/**/*.lexd"
pnpm lexd publish "schemas/**/*.lexd" -o /tmp/lexicons --dry-run
```

Both exit non-zero on validation errors.

## Related

- [CLI](/cli.md) — `validate`, `publish`, flags
- [Getting started](/getting-started.md) — first compile
