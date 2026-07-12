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
code --install-extension packages/vscode-lexd/vscode-lexd-0.1.0.vsix
# or: cursor --install-extension packages/vscode-lexd/vscode-lexd-0.1.0.vsix
```

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
