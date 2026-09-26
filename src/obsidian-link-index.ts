import type { App } from 'obsidian';
import type { LinkIndex, NoteFacts } from './vault-graph';

/** Obsidian's in-memory link index, as `vaultToGraph` reads it. No note text is read. */
export function linkIndexOf(app: App): LinkIndex {
	return {
		resolvedLinks: app.metadataCache.resolvedLinks,
		unresolvedLinks: app.metadataCache.unresolvedLinks,
	};
}

/** A note's date property and creation time, from memory. */
export function noteFactsOf(app: App): (path: string) => NoteFacts {
	return (path) => ({
		dateProperty: app.metadataCache.getCache(path)?.frontmatter?.date as unknown,
		created: app.vault.getFileByPath(path)?.stat.ctime ?? 0,
	});
}
