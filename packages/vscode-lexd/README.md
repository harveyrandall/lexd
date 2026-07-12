# vscode-lexd

VS Code / Cursor extension for the AT Proto Lexicon DSL (`.lexd`).

Provides:

- Syntax highlighting (TextMate grammar)
- Language configuration (`//` / `/* */` comments, brackets)
- Language server features via `@lexd/language-server`: diagnostics, hover, completion, go-to-definition

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

### Option B — Install a VSIX

```bash
# From the monorepo root (requires @vscode/vsce)
pnpm --filter vscode-lexd build
cd packages/vscode-lexd
npx @vscode/vsce package --no-dependencies
code --install-extension ./vscode-lexd-0.1.0.vsix
# or: cursor --install-extension ./vscode-lexd-0.1.0.vsix
```

`--no-dependencies` keeps the package small; the language server is bundled via the workspace dependency path when developing from source. For a self-contained VSIX you may want to vendor `dist/` of `@lexd/language-server` and `@lexd/core` — for local use, Option A or C is simpler.

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
