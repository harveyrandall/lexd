import type { LexiconDoc } from './lexicon.js'

export interface LexCodegenOptions {
  /** Directory where generated artifacts should be written. */
  outDir: string
}

export interface LexCodegenArtifact {
  /** Path relative to outDir */
  path: string
  /** File contents */
  content: string
}

export interface LexCodegenPlan {
  artifacts: LexCodegenArtifact[]
}

/**
 * Plan codegen output from compiled lexicon documents.
 * Consumers can write `artifacts` to disk or pipe them to @atproto/lex tooling.
 */
export function planLexCodegen(docs: LexiconDoc[], options: LexCodegenOptions): LexCodegenPlan {
  const artifacts: LexCodegenArtifact[] = docs.map((doc) => ({
    path: `${doc.id.replaceAll('.', '/')}.json`,
    content: `${JSON.stringify(doc, null, 2)}\n`,
  }))

  return { artifacts }
}

/**
 * Optional hook for delegating to @atproto/lex-cli when installed in the host project.
 * Returns false when the package is unavailable so callers can fall back to planLexCodegen.
 */
export async function tryAtprotoLexCodegen(
  docs: LexiconDoc[],
  options: LexCodegenOptions,
): Promise<LexCodegenPlan | false> {
  try {
    const specifier = '@atproto/lex-cli'
    const mod = (await import(specifier)) as {
      generate?: (docs: LexiconDoc[], opts: { outDir: string }) => Promise<void>
    }
    if (typeof mod.generate !== 'function') return false
    await mod.generate(docs, { outDir: options.outDir })
    return { artifacts: [] }
  } catch {
    return false
  }
}
