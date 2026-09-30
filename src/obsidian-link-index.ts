import { getAllTags, type App } from 'obsidian';
import type { TagsOf } from './graph-filters';
import type { LinkIndex, NoteFacts } from './vault-graph';

/** Obsidian's in-memory link index, as `vaultToGraph` reads it. No note text is read. */
export function linkIndexOf(app: App): LinkIndex {
	return {
		resolvedLinks: app.metadataCache.resolvedLinks,
		unresolvedLinks: app.metadataCache.unresolvedLinks,
	};
}

/** A note's `date` and `sermon date` properties and creation time, from memory. */
export function noteFactsOf(app: App): (path: string) => NoteFacts {
	return (path) => {
		const frontmatter = app.metadataCache.getCache(path)?.frontmatter;
		return {
			dateProperty: frontmatter?.date as unknown,
			sermonDateProperty: frontmatter?.['sermon date'] as unknown,
			created: app.vault.getFileByPath(path)?.stat.ctime ?? 0,
		};
	};
}

/** A note's tags, in its body and its properties, without `#`, from memory. */
export function tagsOf(app: App): TagsOf {
	return (path) => {
		const cache = app.metadataCache.getCache(path);
		return cache ? (getAllTags(cache) ?? []).map((tag) => tag.replace(/^#/, '')) : [];
	};
}
