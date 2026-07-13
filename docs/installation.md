# Installation

Lexd can be used from the monorepo, as npm packages, or via the VS Code extension.

## From source (monorepo)

Best for contributing or using unreleased features.

```bash
git clone https://github.com/harveyrandall/lexd.git
cd lexd
pnpm install
pnpm build
pnpm test
```

Run the CLI without publishing:

```bash
pnpm lexd compile "examples/**/*.lexd" -o lexicons
# or directly:
node packages/cli/dist/cli.js compile "examples/**/*.lexd" -o lexicons
```

## npm packages

Publishable packages (MIT, public npm):

| Package | Install |
| --- | --- |
| `@lexd/core` | `pnpm add @lexd/core` |
| `@lexd/cli` | `pnpm add -D @lexd/cli` |
| `@lexd/vite-plugin` | `pnpm add -D @lexd/vite-plugin` |
| `@lexd/stdlib-atproto` | `pnpm add @lexd/stdlib-atproto` |
| `@lexd/stdlib-standard` | `pnpm add @lexd/stdlib-standard` |
| `@lexd/language-server` | `pnpm add -D @lexd/language-server` |

After installing `@lexd/cli`:

```bash
npx lexd compile "src/**/*.lexd" -o lexicons
```

> **Note:** npm packages are version `0.1.0`. Check [GitHub Releases](https://github.com/harveyrandall/lexd/releases) for published versions.

### Monorepo consumers

In a pnpm workspace, add workspace protocol dependencies:

```json
{
  "devDependencies": {
    "@lexd/cli": "workspace:*",
    "@lexd/vite-plugin": "workspace:*"
  }
}
```

## VS Code / Cursor extension

### Option A — VSIX (self-contained)

```bash
git clone https://github.com/harveyrandall/lexd.git
cd lexd
pnpm install
pnpm package:vsix
code --install-extension packages/vscode-lexd/vscode-lexd-0.1.0.vsix
```

The VSIX bundles the language server and stdlib sources — no monorepo path required at runtime.

### Option B — Extension Development Host (F5)

1. Clone and `pnpm build`
2. Open the repo in VS Code / Cursor
3. Run **Lexd Extension** from the debug panel

See [Editor & LSP](/editor.md) for details.

## Language server only

For other editors that support LSP over stdio:

```bash
pnpm add -D @lexd/language-server
npx lexd-lsp
# → packages/language-server/dist/server.js
```

Configure your editor to launch `node path/to/@lexd/language-server/dist/server.js` for files with language id `lexd`.

## Requirements

| Component | Version |
| --- | --- |
| Node.js | ≥ 20 (22 in CI) |
| pnpm | 10.x (see root `packageManager`) |
| VS Code | ≥ 1.85 (extension) |

## Troubleshooting

**Imports not resolving**

Ensure `@lexd/stdlib-atproto` is installed and the compiler can find it via `node_modules`. From the monorepo, stdlib resolves automatically.

**`lexd: command not found`**

Use `pnpm lexd`, `npx lexd`, or `node packages/cli/dist/cli.js` after building.

**Extension shows no diagnostics**

Build `@lexd/language-server` first (`pnpm build`). In VSIX mode, reinstall after `pnpm package:vsix`.
