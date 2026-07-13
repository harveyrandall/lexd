# Editor & LSP

Lexd includes a Language Server and VS Code / Cursor extension for `.lexd` files.

## Features

| Feature | Description |
| --- | --- |
| **Diagnostics** | Syntax errors with source spans; compile errors when resolvable |
| **Completion** | `@` constraints, primitives, section keywords, in-scope symbols |
| **Hover** | Field types, constraints, import resolution |
| **Go to definition** | Local secondary types; stdlib imports when indexed |

## VS Code / Cursor extension

Package name: `vscode-lexd` (publisher: `lexd`)

### Install VSIX

```bash
git clone https://github.com/harveyrandall/lexd.git
cd lexd
pnpm install
pnpm package:vsix
code --install-extension packages/vscode-lexd/vscode-lexd-0.1.0.vsix
```

The VSIX bundles:

- Language server (`dist/server.bundle.js`)
- Stdlib `.lexd` sources for offline import resolution
- TextMate grammar for syntax highlighting

### Development (F5)

1. Clone repo, `pnpm install && pnpm build`
2. Open in VS Code / Cursor
3. **Run and Debug** → **Lexd Extension** → F5
4. Open `examples/feed-post.lexd` in the Extension Development Host

### Verify

1. Introduce a syntax error — diagnostic appears
2. Type `@` in a type body — constraint completions
3. **Go to Definition** on `Reply` in `reply?: Reply`

## Language server (`@lexd/language-server`)

Standalone LSP over stdio for other editors:

```bash
node node_modules/@lexd/language-server/dist/server.js
```

Or from the monorepo:

```bash
pnpm lexd-lsp
```

### Initialization options

The VS Code extension passes bundled stdlib paths:

```json
{
  "stdlibPaths": ["/path/to/extension/stdlib/atproto", "/path/to/extension/stdlib/standard"]
}
```

In monorepo dev mode, the server discovers stdlib from workspace `packages/stdlib-*`.

## Workspace indexing

The LSP indexes `.lexd` files under:

- Workspace folders (`examples`, `packages`, `src`, `lexd`)
- Bundled stdlib paths (VSIX)
- `discoverStdlibLexdFiles` from `@lexd/core`

Adding or removing workspace folders triggers a re-index and re-diagnosis of open documents.

## Related

- [Installation](/installation.md) — build prerequisites
- [Syntax reference](/syntax.md) — what the LSP validates against
