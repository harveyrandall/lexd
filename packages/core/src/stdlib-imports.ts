/**
 * Preferred import bindings and module prefixes for decompiler output.
 * Updated by `pnpm stdlib:bootstrap` when syncing from upstream lexicons.
 */
export const STDLIB_MAIN_IMPORTS: Record<string, string> = {
  'com.atproto.repo.applyWrites': 'ApplyWrites',
  'com.atproto.repo.createRecord': 'CreateRecord',
  'com.atproto.repo.getRecord': 'GetRecord',
  'com.atproto.repo.listRecords': 'ListRecords',
  'com.atproto.repo.strongRef': 'StrongRef',
  'com.atproto.server.describeServer': 'DescribeServer',
  'com.atproto.sync.subscribeRepos': 'SubscribeRepos',
}

/** NSID prefixes for modules that should be imported rather than fully qualified. */
export const STDLIB_MODULE_PREFIXES = [
  'com.atproto.',
  'app.bsky.',
  'site.standard.',
] as const
