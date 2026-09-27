import { ItemView, debounce, type WorkspaceLeaf } from 'obsidian';
import { buildGraphTree, collapseOneLevel, expandOneLevel, openLevelsOf, type GraphTestamentNode } from '../graph-rules';
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
import { linkIndexOf, noteFactsOf } from '../obsidian-link-index';
import { vaultToGraph, type VaultGraph } from '../vault-graph';
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
	private graph: VaultGraph = { rows: [], entries: [] };
	private tree: GraphTestamentNode[] = [];
	private selection: Selection = NOTHING_SELECTED;
	private openKeys = new Set<string>(OPENING_OPEN);
	private columnLength = COLUMN_PAGE;

	private status!: HTMLElement;
	private clearButton!: HTMLButtonElement;
	private canvas: GraphCanvas | null = null;
	private panel: NotePanel | null = null;
	private readonly rebuildSoon = debounce(() => this.rebuild(), REBUILD_PAUSE_MS, true);

	constructor(leaf: WorkspaceLeaf) {
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

	private rebuild(): void {
		this.graph = vaultToGraph(linkIndexOf(this.app), noteFactsOf(this.app));
		this.tree = buildGraphTree(this.graph.rows);
		this.selection = keepSelection(this.selection, this.graph.rows, this.graph.entries);
		this.draw();
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
