import { ItemView, Notice, debounce, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import { CATEGORY_KEYS, buildGraphTree, collapseOneLevel, expandOneLevel, openLevelsOf, type GraphTestamentNode } from '../graph-rules';
import {
	COLUMN_PAGE,
	NOTHING_SELECTED,
	OPENING_OPEN,
	clearSelection,
	columnHeading,
	columnOf,
	followRename,
	hidePanel,
	keepSelection,
	opensFor,
	selectEntry,
	selectVerse,
	statusLine,
	type Selection,
} from '../graph-selection';
import {
	NO_GRAPH_FILTERS,
	nothingMatchesSentence,
	scopeCounts,
	type GraphFilters,
	type GraphReference,
} from '../graph-filter-rules';
import { dateFacets, filterGraph, opensForReference, tagCounts, unscopedCitations } from '../graph-filters';
import { linkIndexOf, noteFactsOf, tagsOf } from '../obsidian-link-index';
import type { VerseGraphSettings } from '../settings';
import { readViewState, type ViewState } from '../view-state';
import { vaultToGraph, type VaultGraph } from '../vault-graph';
import { FilterBar } from './filter-bar';
import type { FilterContext } from './filter-modals';
import { GraphCanvas } from './graph-canvas';
import { NotePanel } from './note-panel';

export const VERSE_GRAPH_VIEW = 'verse-graph';

const REBUILD_PAUSE_MS = 500;

/**
 * The verse graph: a status line, the canvas, and the chosen note's panel.
 * Holds what is selected, what is open and how much of the column shows, and
 * redraws the canvas from them.
 */
export class VerseGraphView extends ItemView {
	/** The whole vault's graph, and `graph`, what the filters leave of it. */
	private full: VaultGraph = { rows: [], entries: [] };
	private graph: VaultGraph = { rows: [], entries: [] };
	private filters: GraphFilters = NO_GRAPH_FILTERS;
	private filterBar: FilterBar | null = null;
	private tree: GraphTestamentNode[] = [];
	private selection: Selection = NOTHING_SELECTED;
	private openKeys = new Set<string>(OPENING_OPEN);
	private columnLength = COLUMN_PAGE;

	private status!: HTMLElement;
	private clearButton!: HTMLButtonElement;
	private canvas: GraphCanvas | null = null;
	private panel: NotePanel | null = null;
	private readonly rebuildSoon = debounce(() => this.rebuild(), REBUILD_PAUSE_MS, true);
	/** Whether the graph has been built from the link index yet. */
	private built = false;
	/** A note to show, or a saved state to restore, once the graph is built. */
	private pendingEntry: string | null = null;
	private pendingState: Partial<ViewState> | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly settings: () => VerseGraphSettings,
	) {
		super(leaf);
	}

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
		this.contentEl.empty();
		this.contentEl.addClass('verse-graph');

		const header = this.contentEl.createDiv({ cls: 'verse-graph-header' });
		this.status = header.createDiv({ cls: 'verse-graph-status' });
		this.clearButton = header.createEl('button', { text: 'Clear' });
		this.clearButton.addEventListener('click', () => this.select(clearSelection(this.selection)));

		this.filterBar = new FilterBar(this.contentEl, this.app, this.filterContext(), (reference) =>
			this.chooseReference(reference),
		);

		const row = this.contentEl.createDiv({ cls: 'verse-graph-row' });
		const register = this.registerDomEvent.bind(this) as ConstructorParameters<typeof GraphCanvas>[2];
		this.canvas = new GraphCanvas(
			row,
			{
				toggle: (key) => this.toggle(key),
				selectVerse: (range) => this.select(selectVerse(this.selection, range)),
				selectEntry: (id) => this.chooseEntry(id),
				clear: () => this.select(clearSelection(this.selection, true)),
				loadMore: () => {
					this.columnLength += COLUMN_PAGE;
					this.draw();
				},
				expand: () => this.setOpen(expandOneLevel(this.openKeys, openLevelsOf(this.tree))),
				collapse: () => this.setOpen(collapseOneLevel(this.openKeys, openLevelsOf(this.tree))),
				hoverEntry: (event, el, id) => this.hover(event, el, id, ''),
				resetFilters: () => this.setFilters(NO_GRAPH_FILTERS),
			},
			register,
		);
		this.panel = new NotePanel(row, this.app, this, {
			back: () => this.select(clearSelection(this.selection)),
			close: () => this.select(hidePanel(this.selection)),
			selectVerse: (range) => this.select(selectVerse(this.selection, range)),
			hoverLink: (event, el, linktext, sourcePath) => this.hover(event, el, linktext, sourcePath),
		});

		this.registerDomEvent(this.contentEl, 'keydown', (event) => {
			if (event.key !== 'Escape') return;
			const inPanel = this.panel?.el.contains(event.target as Node) ?? false;
			this.select(inPanel ? hidePanel(this.selection) : clearSelection(this.selection, true));
		});

		// A graph left open at quit reopens at launch, maybe before the link index is
		// complete: draw what is there once the layout is ready, and again on `resolved`.
		// The metadata cache sends no `changed` for a rename or a delete, so those are
		// listened for too, through the same pause.
		this.app.workspace.onLayoutReady(() => {
			this.rebuild();
			this.registerEvent(this.app.metadataCache.on('resolved', () => this.rebuildSoon()));
			this.registerEvent(
				this.app.vault.on('rename', (file, oldPath) => {
					this.selection = followRename(this.selection, oldPath, file.path);
					this.rebuildSoon();
				}),
			);
			this.registerEvent(this.app.vault.on('delete', () => this.rebuildSoon()));
		});
	}

	async onClose(): Promise<void> {
		this.rebuildSoon.cancel();
		this.canvas?.destroy();
		this.panel?.clear();
	}

	onResize(): void {
		this.canvas?.onResize();
	}

	/** Kept with the tab, so a graph reopened at launch comes back as it was left (`view-state.ts`). */
	getState(): Record<string, unknown> {
		const state: ViewState = { verse: this.selection.verse, entry: this.selection.entryId, open: [...this.openKeys] };
		return { ...super.getState(), ...state };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const saved = readViewState(state);
		if (this.built) this.restore(saved);
		else this.pendingState = saved;
		await super.setState(state, result);
	}

	/** What was open, the verse and the note, as saved; whatever has since gone is let go of. */
	private restore(saved: Partial<ViewState>): void {
		if (saved.open) this.openKeys = new Set(saved.open);
		const verse = saved.verse ?? null;
		const entryId = saved.entry ?? null;
		if (entryId && !verse) {
			const index = this.graph.entries.findIndex((entry) => entry.id === entryId);
			if (index >= 0) this.columnLength = Math.max(this.columnLength, Math.ceil((index + 1) / COLUMN_PAGE) * COLUMN_PAGE);
		}
		this.selection = keepSelection({ verse, entryId, panelShowing: entryId !== null }, this.graph.rows, this.graph.entries);
		this.draw();
		const chosen = this.selection.entryId;
		if (chosen) window.requestAnimationFrame(() => this.canvas?.showEntry(chosen));
	}

	/**
	 * *Show in graph* (the web app's item 8.5): chooses a note with its panel,
	 * opens the way down to every verse it cites, and reads the column down to
	 * it if it is past the first page. `tell` says so when it cites nothing.
	 */
	showNote(path: string, tell = true): void {
		if (!this.built) {
			this.pendingEntry = path;
			return;
		}
		// A note the filters leave out brings the whole graph back, rather than saying it cites nothing.
		if (!this.graph.entries.some((entry) => entry.id === path) && this.full.entries.some((entry) => entry.id === path)) {
			this.setFilters(NO_GRAPH_FILTERS);
		}
		const index = this.graph.entries.findIndex((entry) => entry.id === path);
		const entry = this.graph.entries[index];
		if (!entry) {
			if (tell) new Notice('This note cites no verses yet.');
			return;
		}
		for (const key of opensFor(entry)) this.openKeys.add(key);
		this.columnLength = Math.max(this.columnLength, Math.ceil((index + 1) / COLUMN_PAGE) * COLUMN_PAGE);
		this.select({ verse: null, entryId: path, panelShowing: true });
		window.requestAnimationFrame(() => this.canvas?.showEntry(path));
	}

	private rebuild(): void {
		this.full = vaultToGraph(linkIndexOf(this.app), noteFactsOf(this.app));
		this.built = true;
		this.applyFilters();
		if (this.pendingState) {
			const saved = this.pendingState;
			this.pendingState = null;
			this.restore(saved);
		}
		if (this.pendingEntry) {
			const entry = this.pendingEntry;
			this.pendingEntry = null;
			this.showNote(entry, false);
		}
	}

	/** A setting changed. Switching the categories on shows them open, as the graph opens them. */
	settingsChanged(): void {
		if (this.settings().literaryCategories) for (const key of CATEGORY_KEYS) this.openKeys.add(key);
		this.applyFilters();
	}

	/** The graph again from `full`, through the filters, keeping what is still there selected. */
	private applyFilters(): void {
		this.graph = filterGraph(this.full, this.filters, tagsOf(this.app));
		this.tree = buildGraphTree(this.graph.rows, { categories: this.settings().literaryCategories });
		this.selection = keepSelection(this.selection, this.graph.rows, this.graph.entries);
		this.filterBar?.draw();
		this.draw();
	}

	/**
	 * A filter changed. The selection is let go of and what is open is kept, as
	 * in the app: a verse filtered away cannot stay selected.
	 */
	private setFilters(filters: GraphFilters): void {
		this.filters = filters;
		this.selection = NOTHING_SELECTED;
		this.columnLength = COLUMN_PAGE;
		this.applyFilters();
	}

	/** Choosing a reference opens the tree down to it: a book to its chapters, a chapter to its verses. */
	private chooseReference(reference: GraphReference): void {
		for (const key of opensForReference(reference)) this.openKeys.add(key);
		this.setFilters({ ...this.filters, reference });
	}

	private filterContext(): FilterContext {
		const tags = () => tagsOf(this.app);
		return {
			filters: () => this.filters,
			setFilters: (filters) => this.setFilters(filters),
			scopeCounts: () => scopeCounts(unscopedCitations(this.full, this.filters, tags())),
			dateFacets: () => dateFacets(this.full, this.filters, tags()),
			tagCounts: () => tagCounts(this.full, this.filters, tags()),
		};
	}

	private select(selection: Selection): void {
		this.selection = selection;
		this.draw();
	}

	/** Choosing a note opens every book and chapter it cites, so its verses are on screen to be lit. */
	private chooseEntry(id: string): void {
		const next = selectEntry(this.selection, id);
		const entry = this.graph.entries.find((candidate) => candidate.id === next.entryId);
		if (entry && next.entryId !== this.selection.entryId) {
			for (const key of opensFor(entry)) this.openKeys.add(key);
		}
		this.select(next);
		if (next.panelShowing && next.entryId) {
			// Once the panel has taken its width from the canvas.
			const entryId = next.entryId;
			window.requestAnimationFrame(() => this.canvas?.showEntry(entryId));
		}
	}

	private toggle(key: string): void {
		const next = new Set(this.openKeys);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		this.setOpen(next);
	}

	private setOpen(open: Set<string>): void {
		this.openKeys = open;
		this.draw();
	}

	private draw(): void {
		// What is selected and open is the view's saved state; Obsidian waits a moment before saving.
		this.app.workspace.requestSaveLayout();
		const { rows, entries } = this.graph;
		const { verse, entryId, panelShowing } = this.selection;

		const everyNote = columnOf(entries, verse);
		// A verse's column is whole; the landing column comes a page at a time.
		const column = verse ? everyNote : everyNote.slice(0, this.columnLength);
		const entry = column.find((candidate) => candidate.id === entryId) ?? null;
		const levels = openLevelsOf(this.tree);

		this.canvas?.render({
			tree: this.tree,
			open: this.openKeys,
			column,
			columnHeading: columnHeading(verse),
			moreCount: everyNote.length - column.length,
			verse,
			entry,
			canExpand: levels.some((level) => level.some((key) => !this.openKeys.has(key))),
			canCollapse: levels.some((level) => level.some((key) => this.openKeys.has(key))),
			// The filters leave nothing, in a vault that has verses: said in the filters' own terms,
			// never as an empty vault. The app's sentence says entries; the plugin's are notes.
			nothingMatches:
				rows.length === 0 && this.full.rows.length > 0
					? nothingMatchesSentence(this.filters).replace(/\bentries\b/g, 'notes')
					: null,
		});

		const line = statusLine(rows, entries, this.selection);
		this.status.empty();
		if (line.bold) this.status.createEl('strong', { text: line.bold });
		this.status.appendText(line.rest);
		this.clearButton.toggle(verse !== null || entryId !== null);

		void this.panel?.show(panelShowing ? entry : null, verse);
	}

	/** Obsidian's page preview, for a note in the column or a link in the panel. */
	private hover(event: MouseEvent, targetEl: HTMLElement, linktext: string, sourcePath: string): void {
		this.app.workspace.trigger('hover-link', {
			event,
			source: VERSE_GRAPH_VIEW,
			hoverParent: this,
			targetEl,
			linktext,
			sourcePath,
		});
	}
}
