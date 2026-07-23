# vscode-lexd

VS Code / Cursor extension for the AT Proto Lexicon DSL (`.lexd`).

Provides:

- Syntax highlighting (TextMate grammar)
- Language configuration (`//` / `/* */` comments, brackets)
- Language server features via a bundled LSP: diagnostics, hover, completion, go-to-definition
- Bundled `@lexd/stdlib-atproto` and `@lexd/stdlib-standard` sources for import resolution offline

## Prerequisites

From the monorepo root:

```bash
pnpm install
pnpm build
```

This builds `@lexd/core`, `@lexd/language-server`, and this extension.

## Run / install locally

### Option A — Launch from the repo (F5)

1. Open this monorepo in VS Code or Cursor.
2. Open the Run and Debug view and choose **Lexd Extension**.
3. Press **F5** (or start debugging). A new Extension Development Host window opens with `vscode-lexd` loaded.
4. Open any `examples/*.lexd` file to try diagnostics, hover, completion (`@`), and go-to-definition.

In monorepo dev mode the extension loads the sibling `@lexd/language-server` build (not the bundled server). Stdlib is resolved from workspace `packages/stdlib-*` via the LSP workspace index.

### Option B — Install a VSIX (self-contained)

```bash
# From the monorepo root
pnpm package:vsix
code --install-extension packages/vscode-lexd/vscode-lexd-0.1.1.vsix
# or: cursor --install-extension packages/vscode-lexd/vscode-lexd-0.1.1.vsix
```

The VSIX filename matches `version` in `packages/vscode-lexd/package.json` (e.g. `vscode-lexd-0.1.1.vsix`).

`pnpm package:vsix` runs `vscode:prepublish`, which:

1. Builds `@lexd/core` and `@lexd/language-server`
2. Bundles the language server + core into `dist/server.bundle.js` (esbuild)
3. Bundles the extension host into `dist/extension.js`
4. Copies stdlib `.lexd` sources into `stdlib/{atproto,standard}`

The resulting VSIX has no runtime dependency on the monorepo or npm packages.

### Option C — Symlink into extensions folder

```bash
pnpm --filter vscode-lexd build
ln -s "$(pwd)/packages/vscode-lexd" ~/.vscode/extensions/lexd.vscode-lexd-0.1.0
# Restart VS Code / Cursor
```

## Verify

1. Open `examples/feed-post.lexd`.
2. Introduce a syntax error (e.g. `name string` without `:`) — a diagnostic should appear.
3. Type `@` inside a type body — completions should include `@maxGraphemes`.
4. Place the cursor on `Reply` in `reply?: Reply` and run **Go to Definition** — it should jump to `type Reply`.

## Publish to VS Code Marketplace

Maintainers only. You need a [Personal Access Token](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token) with **Marketplace → Manage** scope and `vsce login harveyrandall` (publisher id matches `publisher` in `package.json`).

### Recommended release (build → test → VSIX → publish)

From the monorepo root:

```bash
pnpm release:vscode              # patch bump (default)
pnpm release:vscode:minor
pnpm release:vscode:major
pnpm release:vscode 0.1.2        # explicit version
```

Or from `packages/vscode-lexd`:

```bash
pnpm release:patch
```

This runs `pnpm build`, `pnpm test`, `pnpm package:vsix`, then publishes via `vsce`.

### Manual publish steps

```bash
cd packages/vscode-lexd
pnpm build && pnpm test   # or from root: pnpm build && pnpm test
pnpm package:vsix         # from root, or pnpm run package:vsix here

# Semver bump (updates package.json and publishes)
pnpm run vscode:publish:patch
pnpm run vscode:publish:minor
pnpm run vscode:publish:major

# Explicit version (no bump keyword — pass the version you want live)
pnpm exec vsce publish 0.1.2 --no-dependencies

# Or use the generic marketplace script (pass version or patch/minor/major after --)
pnpm run publish:marketplace -- patch
pnpm run publish:marketplace -- 0.1.2
```

Always use `--no-dependencies` when publishing from this pnpm monorepo. `vsce` otherwise runs `npm list` and fails on workspace `link:` dependencies even though the bundled extension is self-contained.

After publish, the extension appears at [harveyrandall.vscode-lexd](https://marketplace.visualstudio.com/items?itemName=harveyrandall.vscode-lexd) within a few minutes.
