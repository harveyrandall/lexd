#!/usr/bin/env node
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  type CompletionItem,
  CompletionItemKind,
  type Diagnostic,
  DiagnosticSeverity,
  type Hover,
  type InitializeParams,
  type InitializeResult,
  type Location,
  MarkupKind,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node.js'
import { TextDocument } from 'vscode-languageserver-textdocument'
import {
  analyzeDocument,
  buildWorkspaceIndex,
  completionsAt,
  definitionAt,
  hoverAt,
  offsetAt,
  pathToUri,
  type AnalyzedDocument,
  type WorkspaceIndex,
  uriToPath,
} from './analysis.js'
import type { SourceSpan } from '@lexd/core'

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

let workspace: WorkspaceIndex | undefined
let workspaceFolders: string[] = []
const cache = new Map<string, AnalyzedDocument>()

function spanToRange(span: SourceSpan) {
  return {
    start: { line: span.startLine - 1, character: span.startColumn - 1 },
    end: { line: span.endLine - 1, character: span.endColumn - 1 },
  }
}

function refreshWorkspace(folders: string[]): void {
  workspace = buildWorkspaceIndex(folders)
}

function analyze(doc: TextDocument): AnalyzedDocument {
  const result = analyzeDocument(doc.uri, doc.getText(), workspace)
  cache.set(doc.uri, result)
  return result
}

function publishDiagnostics(doc: TextDocument, analyzed: AnalyzedDocument): void {
  const diagnostics: Diagnostic[] = analyzed.diagnostics.map((d) => {
    const range = d.span
      ? spanToRange(d.span)
      : {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        }
    return {
      severity: d.severity === 'warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
      range,
      message: d.message,
      source: 'lexd',
    }
  })
  connection.sendDiagnostics({ uri: doc.uri, diagnostics })
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
  workspaceFolders =
    params.workspaceFolders?.map((f) => uriToPath(f.uri)) ??
    (params.rootUri ? [uriToPath(params.rootUri)] : [])
  refreshWorkspace(workspaceFolders)

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      definitionProvider: true,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['@', ':', ' ', '.', '#'],
      },
    },
  }
})

connection.onInitialized(() => {
  connection.workspace?.onDidChangeWorkspaceFolders?.((event) => {
    for (const folder of event.removed) {
      const path = uriToPath(folder.uri)
      workspaceFolders = workspaceFolders.filter((f) => f !== path)
    }
    for (const folder of event.added) {
      workspaceFolders.push(uriToPath(folder.uri))
    }
    refreshWorkspace(workspaceFolders)
    cache.clear()
    for (const doc of documents.all()) {
      const analyzed = analyze(doc)
      publishDiagnostics(doc, analyzed)
    }
  })
})

documents.onDidChangeContent((change) => {
  const analyzed = analyze(change.document)
  publishDiagnostics(change.document, analyzed)
})

documents.onDidClose((event) => {
  cache.delete(event.document.uri)
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] })
})

connection.onHover((params): Hover | null => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null
  const analyzed = cache.get(doc.uri) ?? analyze(doc)
  const offset = offsetAt(
    doc.getText(),
    params.position.line,
    params.position.character,
  )
  const hover = hoverAt(analyzed, offset)
  if (!hover) return null
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: hover.markdown,
    },
  }
})

connection.onDefinition((params): Location | null => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null
  const analyzed = cache.get(doc.uri) ?? analyze(doc)
  const offset = offsetAt(
    doc.getText(),
    params.position.line,
    params.position.character,
  )
  const loc = definitionAt(analyzed, offset, workspace)
  if (!loc) return null
  return {
    uri: loc.uri.startsWith('file:') ? loc.uri : pathToUri(loc.uri),
    range: spanToRange(loc.span),
  }
})

connection.onCompletion((params): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return []
  const analyzed = cache.get(doc.uri) ?? analyze(doc)
  const offset = offsetAt(
    doc.getText(),
    params.position.line,
    params.position.character,
  )
  const kindMap = {
    keyword: CompletionItemKind.Keyword,
    type: CompletionItemKind.TypeParameter,
    property: CompletionItemKind.Property,
    snippet: CompletionItemKind.Snippet,
    text: CompletionItemKind.Text,
  } as const

  return completionsAt(analyzed, offset).map((item) => {
    const result: CompletionItem = {
      label: item.label,
      kind: kindMap[item.kind],
      detail: item.detail,
    }
    if (item.insertText) {
      result.insertText = item.insertText
      if (item.insertText.includes('$0') || item.insertText.includes('\n')) {
        result.insertTextFormat = 2 // Snippet
      }
    }
    return result
  })
})

documents.listen(connection)
connection.listen()
