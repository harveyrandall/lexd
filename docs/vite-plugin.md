# Vite plugin

`@lexd/vite-plugin` integrates Lexd into Vite projects — disk emit for build pipelines and optional virtual imports for in-app schema access.

## Setup

```bash
pnpm add -D @lexd/vite-plugin vite
```

```ts
import { defineConfig } from 'vite'
import lexd from '@lexd/vite-plugin'

export default defineConfig({
  plugins: [
    lexd({
      include: 'src/**/*.lexd',
      outDir: 'lexicons',
      layout: 'flat',
      virtual: true,
    }),
  ],
})
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `include` | `'**/*.lexd'` | Glob of `.lexd` files to compile |
| `outDir` | `'lexicons'` | Directory for emitted JSON |
| `layout` | `'flat'` | `flat` or `nested` output paths |
| `virtual` | `false` | Enable `import … from './schema.lexd'` |

## Disk emit

On `buildStart` and when `.lexd` files change during dev, the plugin writes compiled lexicon JSON to `outDir`. Use this output with goat, `@atproto/lex`, or PDS publish workflows.

## Virtual modules

When `virtual: true`:

```ts
import profileSchema from './schemas/profile.lexd'

// profileSchema is the compiled LexiconDoc (or LexiconDoc[] if multiple)
console.log(profileSchema.id)
```

Virtual imports return parsed JSON objects — no disk read at runtime in your bundle (the plugin inlines the compile result).

## Monorepo example

See [`packages/vite-plugin`](https://github.com/harveyrandall/lexd/tree/main/packages/vite-plugin) and its fixture app for a working configuration.

## Related

- [CLI](/cli.md) — same compile flags from the command line
- [Getting started](/getting-started.md) — first compile without Vite
