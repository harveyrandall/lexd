import * as path from 'node:path'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import type { ExtensionContext } from 'vscode'
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node'

const nodeRequire = createRequire(__filename)

let client: LanguageClient | undefined

function resolveServerModule(context: ExtensionContext): string {
  const candidates = [
    // Monorepo sibling: packages/vscode-lexd → packages/language-server
    context.asAbsolutePath(path.join('..', 'language-server', 'dist', 'server.js')),
    // Nested dependency (VSIX / packaged install)
    context.asAbsolutePath(
      path.join('node_modules', '@lexd', 'language-server', 'dist', 'server.js'),
    ),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  try {
    return nodeRequire.resolve('@lexd/language-server/package.json').replace(
      /package\.json$/,
      'dist/server.js',
    )
  } catch {
    return candidates[0]!
  }
}

export function activate(context: ExtensionContext): void {
  const serverModule = resolveServerModule(context)

  const serverOptions: ServerOptions = {
    run: {
      command: process.execPath,
      args: [serverModule],
      transport: TransportKind.stdio,
    },
    debug: {
      command: process.execPath,
      args: ['--nolazy', '--inspect=6009', serverModule],
      transport: TransportKind.stdio,
    },
  }

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'lexd' },
      { scheme: 'untitled', language: 'lexd' },
    ],
  }

  client = new LanguageClient('lexd', 'Lexd Language Server', serverOptions, clientOptions)
  context.subscriptions.push({ dispose: () => { void client?.stop() } })
  void client.start()
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop()
}
