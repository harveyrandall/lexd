import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import lexd from '@lexd/vite-plugin'

const dir = dirname(fileURLToPath(import.meta.url))
const examplesDir = join(dir, '../../../examples')

export default defineConfig({
  root: dir,
  plugins: [
    lexd({
      include: join(examplesDir, '*.lexd'),
      outDir: join(dir, 'lexicons'),
      layout: 'flat',
      virtual: true,
    }),
  ],
  build: {
    outDir: 'dist-fixture',
    emptyOutDir: true,
    lib: {
      entry: join(dir, 'entry.ts'),
      formats: ['es'],
      fileName: 'entry',
    },
  },
})
