import type { LexdFile, TypeDecl } from './ast.js'
import { LexdCompileError } from './errors.js'

/** What a lexicon module exposes for import resolution. */
export interface ModuleExport {
  /** Lexicon NSID */
  id: string
  /** Def keys present (including 'main' when present) */
  defKeys: Set<string>
}

/**
 * Registry of lexicon modules discovered from .lexd sources.
 * Maps NSID → export metadata.
 */
export class ModuleRegistry {
  private modules = new Map<string, ModuleExport>()

  has(id: string): boolean {
    return this.modules.has(id)
  }

  get(id: string): ModuleExport | undefined {
    return this.modules.get(id)
  }

  register(mod: ModuleExport): void {
    this.modules.set(mod.id, mod)
  }

  /** Register all modules that a parsed file will emit. */
  registerFile(file: LexdFile): void {
    for (const ns of file.namespaces) {
      const primaries = ns.types.filter((t) => t.primary)
      if (primaries.length === 0) {
        this.register({
          id: ns.name,
          defKeys: new Set(ns.types.map((t) => t.name)),
        })
        continue
      }
      for (const g of groupForRegistry(ns.types)) {
        const id = `${ns.name}.${g.primary.name}`
        const defKeys = new Set<string>(['main'])
        for (const s of g.secondaries) defKeys.add(s.name)
        this.register({ id, defKeys })
      }
    }
  }

  /**
   * Resolve an import binding to a lexicon ref string.
   * - exact def key → `id#key` (or `id` when key is main)
   * - otherwise if module has main → `id` (alias)
   */
  resolveImport(moduleId: string, importedName: string): string {
    const mod = this.modules.get(moduleId)
    if (!mod) {
      throw new LexdCompileError(
        `Cannot resolve import from "${moduleId}": module not found (add its .lexd to the compile set or install a stdlib package)`,
      )
    }
    if (importedName === 'main') {
      if (!mod.defKeys.has('main')) {
        throw new LexdCompileError(
          `Module "${moduleId}" has no main def (defs-only lexicon); import a named def instead`,
        )
      }
      return moduleId
    }
    if (mod.defKeys.has(importedName)) {
      return `${moduleId}#${importedName}`
    }
    if (mod.defKeys.has('main')) {
      return moduleId
    }
    throw new LexdCompileError(
      `Module "${moduleId}" has no def "${importedName}" and no main to alias`,
    )
  }
}

function groupForRegistry(types: TypeDecl[]): Array<{ primary: TypeDecl; secondaries: TypeDecl[] }> {
  const groups: Array<{ primary: TypeDecl; secondaries: TypeDecl[] }> = []
  let current: { primary: TypeDecl; secondaries: TypeDecl[] } | undefined
  for (const t of types) {
    if (t.primary) {
      current = { primary: t, secondaries: [] }
      groups.push(current)
    } else if (current) {
      current.secondaries.push(t)
    }
  }
  return groups
}

/** Build import local-name → ref string map for a file. */
export function buildImportMap(
  file: LexdFile,
  registry: ModuleRegistry,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const imp of file.imports) {
    for (const b of imp.bindings) {
      if (map.has(b.local)) {
        throw new LexdCompileError(`Duplicate import binding "${b.local}"`)
      }
      const imported = imp.kind === 'whole' ? 'main' : b.imported
      const ref = registry.resolveImport(imp.module, imported)
      map.set(b.local, ref)
    }
  }
  return map
}
