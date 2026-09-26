import { ItemView, debounce } from 'obsidian';
import { buildGraphTree } from '../graph-rules';
import { linkIndexOf, noteFactsOf } from '../obsidian-link-index';
import { vaultToGraph } from '../vault-graph';

export const VERSE_GRAPH_VIEW = 'verse-graph';

const REBUILD_PAUSE_MS = 500;

/**
 * The verse graph. For now a plain list of the cited verses with their counts,
 * checking the data before session 2 draws it.
 */
export class VerseGraphView extends ItemView {
	private readonly rebuildSoon = debounce(() => this.render(), REBUILD_PAUSE_MS, true);

	getViewType(): string {
		return VERSE_GRAPH_VIEW;
	}

	getDisplayText(): string {
		return 'Verse graph';
	}

	getIcon(): string {
		return 'git-fork';
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('verse-graph');
		// A graph left open at quit reopens at launch, maybe before the link index is
		// complete: draw what is there once the layout is ready, and again on `resolved`.
		this.app.workspace.onLayoutReady(() => {
			this.render();
			this.registerEvent(this.app.metadataCache.on('resolved', () => this.rebuildSoon()));
		});
	}

	async onClose(): Promise<void> {
		this.rebuildSoon.cancel();
	}

	private render(): void {
		const { rows, entries } = vaultToGraph(linkIndexOf(this.app), noteFactsOf(this.app));
		this.contentEl.empty();

		if (rows.length === 0) {
			this.contentEl.createEl('p', { text: 'No verses cited yet.', cls: 'verse-graph-muted' });
			return;
		}

		this.contentEl.createEl('p', {
			text: `${rows.length} passages cited in ${entries.length} notes.`,
			cls: 'verse-graph-muted',
		});

		for (const testament of buildGraphTree(rows)) {
			const testamentEl = this.contentEl.createEl('details', { attr: { open: '' } });
			testamentEl.createEl('summary', { text: `${testament.label} (${testament.count})` });
			for (const book of testament.books) {
				const bookEl = testamentEl.createEl('details', { cls: 'verse-graph-level' });
				bookEl.createEl('summary', { text: `${book.label} (${book.count})` });
				const list = bookEl.createEl('ul');
				for (const verse of book.chapters.flatMap((chapter) => chapter.verses)) {
					list.createEl('li', { text: `${verse.label} (${verse.count})` });
				}
			}
		}
	}
}
