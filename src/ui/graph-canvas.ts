import { Platform, setIcon } from 'obsidian';
import { GRAPH_NODE_HEIGHT, OPEN_CLOSE_MS, anchorFor, entryRowTop, layoutGraph, type GraphLayout } from '../graph-layout';
import { keepOnly, litPath, rangeKey, type GraphEntry, type GraphTestamentNode, type VerseRange } from '../graph-rules';
import { graphKeyAction, moveInTree, treeKeyEffect } from '../graph-key-rules';
import { MAX_ZOOM, MIN_ZOOM, THIN_LABELS_BELOW, zoomPercent, type Inset } from '../graph-zoom-rules';
import { GraphDrawing, type Band } from './graph-drawing';
import { CONTROL, PanZoom, type Sizes } from './pan-zoom';
import { drawIcon, type ToolbarIcon } from './toolbar-icons';

/**
 * The graph's canvas: the moving surface with the drawing on it
 * (`graph-drawing.ts`), and the toolbar over it. Lays the graph out with
 * `layoutGraph`, sizes the surface to it, and leaves pan and zoom to
 * `pan-zoom.ts`.
 */

/** Room round the drawing inside the transformed element, in rem. */
const PAD = 1;

/** The tooltip on Replay, here and in the view's header. */
export const REPLAY_TITLE = 'Replay: draw the graph again in the order you wrote it';

/** How the toolbar's tooltips name a Cmd-click, or a Ctrl-click off a Mac. */
const MOD_CLICK = Platform.isMacOS ? '⌘-click' : 'Ctrl-click';

/** Screens' worth of rows drawn above and below the one showing, see `GraphDrawing`. */
const OVERSCAN = 1;

export type CanvasModel = {
	tree: GraphTestamentNode[];
	open: ReadonlySet<string>;
	/** The notes showing in the column, already paged. */
	column: GraphEntry[];
	columnHeading: string;
	/** Notes left under the column's "more" button. */
	moreCount: number;
	verse: VerseRange | null;
	entry: GraphEntry | null;
	canExpand: boolean;
	canCollapse: boolean;
	/** Settings' Toolbar icons: icons on a wide graph too (the web app's item 8.9). */
	toolbarIcons: boolean;
	/** Why the filters left nothing to draw, or null. */
	nothingMatches: string | null;
	/** Replay is playing (the web app's item 8.3): what it has drawn so far, and how long a step is held. */
	replay: { revealed: ReadonlySet<string>; stepMs: number } | null;
};

export type CanvasActions = {
	toggle(key: string): void;
	selectVerse(range: VerseRange): void;
	selectEntry(id: string): void;
	clear(): void;
	loadMore(): void;
	/** One level, or every level with `all`. */
	expand(all: boolean): void;
	collapse(all: boolean): void;
	/** Starts Replay, or stops it. */
	replay(): void;
	hoverEntry(event: MouseEvent, el: HTMLElement, id: string): void;
	resetFilters(): void;
};

export class GraphCanvas {
	readonly viewport: HTMLElement;
	private readonly surface: HTMLElement;
	private readonly drawing: GraphDrawing;
	private readonly toolbar: HTMLElement;
	private readonly controls: Record<'out' | 'in' | 'fit' | 'center' | 'lines' | 'expand' | 'collapse' | 'hide' | 'replay', HTMLButtonElement>;
	private readonly percent: HTMLElement;
	/** Made the first time the canvas is in the page, which Panzoom requires; see `attached`. */
	private panZoom: PanZoom | null = null;

	private model: CanvasModel | null = null;
	private layout: GraphLayout | null = null;
	private contentRem = { width: 0, height: 0 };
	private showAllLines = false;
	/** The toolbar's Hide dimmed (the web app's item 8.7). */
	private hideDimmed = false;
	/** What Hide dimmed last closed the graph up round, and whether it is taking things away. */
	private hidingFor: string | null = null;
	private hiding = false;
	private replaying = false;
	/** The last drawing, for where the selection was before a change. */
	private before: { layout: GraphLayout; column: GraphEntry[]; besideY: number | undefined } | null = null;
	private placed = false;

	constructor(
		parent: HTMLElement,
		private readonly actions: CanvasActions,
		private readonly register: ConstructorParameters<typeof PanZoom>[3],
	) {
		this.viewport = parent.createDiv({ cls: 'verse-graph-canvas', attr: { tabindex: '-1' } });
		this.surface = this.viewport.createDiv({ cls: 'verse-graph-surface' });
		const drawing = this.surface.createDiv({ cls: 'verse-graph-drawing' });
		drawing.setCssStyles({ left: `${PAD}rem`, top: `${PAD}rem` });
		this.drawing = new GraphDrawing(drawing, { ...actions, focused: (key) => this.follow(key) }, () => this.near());

		this.toolbar = this.viewport.createDiv({ cls: ['verse-graph-toolbar', CONTROL], attr: { role: 'toolbar' } });
		// A button with words, and the app's icon for them that a narrow graph shows instead
		// (item 8.3). The words stay in the button for a screen reader either way.
		const button = (text: string, onClick: (event: MouseEvent) => void, label?: string, icon?: ToolbarIcon) => {
			const el = this.toolbar.createEl('button', { attr: label ? { 'aria-label': label } : {} });
			if (icon) drawIcon(el, icon);
			el.createSpan({ cls: icon ? 'verse-graph-word' : '', text });
			el.addEventListener('click', onClick);
			return el;
		};
		const divider = () => this.toolbar.createSpan({ cls: 'verse-graph-divider' });

		const out = button('−', () => this.attached()?.zoomStep('out'), 'Zoom out');
		this.percent = this.toolbar.createSpan({ cls: 'verse-graph-percent', attr: { 'aria-live': 'polite' } });
		const zoomIn = button('+', () => this.attached()?.zoomStep('in'), 'Zoom in');
		divider();
		const fit = button('Fit', () => this.attached()?.fit(), 'Fit the whole graph on the canvas (0)', 'fit');
		const center = button('', () => this.attached()?.center(this.hiding), 'Center the graph: back to where it opens, at this zoom (C)');
		setIcon(center, 'crosshair');
		divider();
		const lines = button(
			'Show all lines',
			() => {
				this.showAllLines = !this.showAllLines;
				this.redraw();
			},
			'Show all lines: every link between the verses and the notes in the column',
			'lines',
		);
		divider();
		// Collapse on the left and Expand on the right, as in the app (item 8.3). Cmd- or
		// Ctrl-click goes all the way: either key on either machine.
		const collapse = button(
			'Collapse',
			(event) => this.actions.collapse(event.metaKey || event.ctrlKey),
			`Close the deepest level open: verses, then chapters, then books. ${MOD_CLICK} closes every level`,
			'collapse',
		);
		const expand = button(
			'Expand',
			(event) => this.actions.expand(event.metaKey || event.ctrlKey),
			`Open the next level: chapters, then verses. ${MOD_CLICK} opens every level`,
			'expand',
		);
		divider();
		const hide = button(
			'Hide dimmed',
			() => {
				this.hideDimmed = !this.hideDimmed;
				this.redraw();
			},
			'Hide everything a selection greys out, leaving only what it lights',
			'hide',
		);
		// Last, as the design draws it; on a narrow graph it is in the header instead.
		const replayDivider = divider();
		replayDivider.addClass('verse-graph-replay-divider');
		const replay = button('Replay', () => this.actions.replay(), REPLAY_TITLE, 'replay');
		replay.addClass('verse-graph-replay');
		// The ones that stay on or off, rather than do something once: their colour is their feedback.
		for (const toggle of [lines, hide, replay]) toggle.addClass('is-toggle');
		this.controls = { out, in: zoomIn, fit, center, lines, expand, collapse, hide, replay };

		this.viewport.createDiv({
			cls: 'verse-graph-hint',
			text: Platform.isMobile ? 'Drag to move · pinch to zoom' : 'Scroll or drag to move · shift-scroll to zoom',
		});

		this.showScale(1);
		register(this.viewport, 'keydown', (event) => this.onKey(event));
	}

	render(model: CanvasModel): void {
		this.model = model;
		this.redraw();
	}

	/** Called when the view's size changes: the first time there is room, the graph opens fitted. */
	onResize(): void {
		if (this.placed || !this.model || this.model.tree.length === 0) return;
		const { viewport } = this.sizes();
		if (viewport.width === 0 || viewport.height === 0) return;
		const panZoom = this.attached();
		if (!panZoom) return;
		panZoom.showOpening();
		this.placed = true;
	}

	/**
	 * The graph's keys, as the web app's (`graph-key-rules.ts`): the arrows,
	 * Home and End walk the tree and the view follows; Enter or Space opens a
	 * book or chapter or selects a verse; `+` `-` `0` `C` zoom, fit and center.
	 * Only while the keyboard is in the graph, so they are never typing. Escape
	 * is left to the view, which clears the selection from anywhere in it.
	 */
	private onKey(event: KeyboardEvent): void {
		const treeKey = (event.target as HTMLElement).dataset.treeItem;
		const action = graphKeyAction(event, treeKey !== undefined);
		if (!action || action.kind === 'clear') return;
		event.preventDefault();
		const empty = !this.model || this.model.tree.length === 0;

		switch (action.kind) {
			case 'zoom':
				if (!empty) this.attached()?.zoomStep(action.direction);
				return;
			case 'fit':
				if (!empty) this.attached()?.fit();
				return;
			case 'center':
				if (!empty) this.attached()?.center(this.hiding);
				return;
			case 'select':
			case 'move': {
				const node = treeKey ? this.drawing.nodeOf(treeKey) : null;
				if (!treeKey || !node) return;
				const effect = treeKeyEffect(action, node);
				if (effect === 'open' || effect === 'close') this.actions.toggle(treeKey);
				else if (effect === 'select') {
					if (node.range) this.actions.selectVerse(node.range);
				} else if (action.kind === 'move') {
					this.drawing.focus(moveInTree(this.drawing.stops(), treeKey, action.to));
				}
				return;
			}
		}
	}

	/** Moves the view as little as it can to show a tree node the keyboard reached. */
	private follow(key: string): void {
		const placed = this.layout?.byKey.get(key);
		if (!placed || !this.layout) return;
		const rem = remPx();
		const box = this.layout.columns[placed.column];
		this.attached()?.showBox({
			x: (box.x + PAD) * rem,
			y: (placed.y + PAD) * rem,
			width: box.width * rem,
			height: GRAPH_NODE_HEIGHT * rem,
		});
	}

	/** Keeps the chosen note on screen once its panel has taken room from the canvas. */
	showEntry(id: string): void {
		const index = this.model?.column.findIndex((item) => item.id === id) ?? -1;
		if (index < 0 || !this.layout) return;
		const rem = remPx();
		const box = this.layout.columns.entry;
		this.attached()?.showBox({
			x: (box.x + PAD) * rem,
			y: (this.drawing.entryTop(index) + PAD) * rem,
			width: box.width * rem,
			height: GRAPH_NODE_HEIGHT * rem,
		});
	}

	destroy(): void {
		this.drawing.destroy();
		this.panZoom?.destroy();
		this.panZoom = null;
	}

	/**
	 * The pan and zoom, made on first use. Obsidian opens a view before its
	 * element is in the page, and Panzoom throws on an element that isn't.
	 */
	private attached(): PanZoom | null {
		if (!this.panZoom && this.viewport.isConnected) {
			this.panZoom = new PanZoom(
				this.viewport,
				this.surface,
				() => this.sizes(),
				this.register,
				(scale) => {
					this.showScale(scale);
					this.drawing.afterMove();
				},
				() => this.actions.clear(),
			);
		}
		return this.panZoom;
	}

	private redraw(): void {
		const model = this.model;
		if (!model) return;
		const lit = litPath(model.entry ? model.entry.cites : model.verse ? [model.verse] : []);

		// Hide dimmed, with something selected: the graph is laid out again with only
		// what is lit, so what is left closes up, and the rest slides into its parent as
		// a closed book's chapters do. Off, or with nothing selected, nothing changes.
		const hiding = this.hideDimmed && lit.size > 0;
		// Replay lays out only what it has reached, the same way (`keepOnly`), so each
		// new box grows out of its parent as opening a book does. The notes column and
		// the counts wait for the end: the column is the newest notes and a count the
		// whole vault's, while the replay runs from the oldest.
		const replay = model.replay;
		const isOpen = (key: string) => model.open.has(key);
		const kept = replay ? keepOnly(model.tree, replay.revealed) : hiding ? keepOnly(model.tree, lit) : model.tree;
		const layout = layoutGraph(kept, isOpen);
		this.layout = layout;
		const column = replay ? [] : hiding && model.entry ? [model.entry] : model.column;
		const moreCount = replay || hiding ? 0 : model.moreCount;

		// Sized to the finished graph while a replay grows, so keeping it on screen doesn't
		// tug at the view as the drawing gets bigger.
		const sized = replay ? layoutGraph(model.tree, isOpen) : layout;
		const beside = model.verse ? anchorFor(layout, model.verse, rangeKey(model.verse)) : undefined;
		this.contentRem = {
			width: sized.width + PAD * 2,
			height: Math.max(sized.treeHeight, entryRowTop(column.length + (moreCount > 0 ? 1 : 0), beside?.y)) + PAD * 2,
		};
		this.surface.setCssStyles({ width: `${this.contentRem.width}rem`, height: `${this.contentRem.height}rem` });
		this.viewport.toggleClass('is-replaying', replay !== null);
		this.toolbar.toggleClass('is-icons', model.toolbarIcons);
		this.updateToolbar();
		this.drawing.show({
			...model,
			column,
			moreCount,
			columnHeading: replay ? '' : model.columnHeading,
			layout,
			lit,
			hiding,
			showAllLines: this.showAllLines,
			// A replay's slide is never longer than its step, or boxes never land and pile up.
			slideMs: replay ? Math.min(OPEN_CLOSE_MS, replay.stepMs) : OPEN_CLOSE_MS,
		});
		this.onResize();

		// A replay starts where the graph opens, at this zoom (item 8.8's Center): the tree grows from its first branch.
		if (replay && !this.replaying) window.requestAnimationFrame(() => this.attached()?.center());
		this.replaying = replay !== null;

		// Hide dimmed keeps the selection still and closes everything else up round it,
		// as in the web app: when hiding comes on or goes off, or the selection changes
		// while it is on, the view moves by as much as the selected box did.
		const hidingFor = hiding ? [...lit].join('\n') : null;
		const now = { layout, column, besideY: beside?.y };
		if (hidingFor !== this.hidingFor && this.before) {
			const wasY = selectionY({ ...this.before, entry: model.entry, verse: model.verse });
			const nowY = selectionY({ ...now, entry: model.entry, verse: model.verse });
			if (wasY !== undefined && nowY !== undefined && wasY !== nowY) this.attached()?.keepStill(wasY, nowY, remPx());
		}
		this.hidingFor = hidingFor;
		this.hiding = hiding;
		this.before = now;
	}

	/** The rows showing, and a screen either side, in rem from the drawing's top. */
	private near(): Band {
		const rem = remPx();
		const height = this.viewport.clientHeight || window.innerHeight;
		const scale = this.panZoom?.scale ?? 1;
		const top = -(this.panZoom?.pan.y ?? 0) / rem - PAD;
		const tall = height / scale / rem;
		return { top: top - tall * OVERSCAN, bottom: top + tall * (1 + OVERSCAN) };
	}

	private updateToolbar(): void {
		const model = this.model;
		const empty = !model || model.tree.length === 0;
		const scale = this.panZoom?.scale ?? 1;
		this.controls.out.disabled = empty || scale <= MIN_ZOOM + 0.001;
		this.controls.in.disabled = empty || scale >= MAX_ZOOM - 0.001;
		this.controls.fit.disabled = empty;
		this.controls.center.disabled = empty;
		this.controls.lines.disabled = empty;
		this.controls.lines.toggleClass('is-active', this.showAllLines);
		this.controls.lines.setAttr('aria-pressed', String(this.showAllLines));
		this.controls.hide.disabled = empty;
		this.controls.hide.toggleClass('is-active', this.hideDimmed);
		this.controls.hide.setAttr('aria-pressed', String(this.hideDimmed));
		const playing = model?.replay != null;
		this.controls.replay.disabled = empty;
		this.controls.replay.toggleClass('is-playing', playing);
		this.controls.replay.setAttr('aria-pressed', String(playing));
		this.controls.expand.disabled = empty || !model?.canExpand;
		this.controls.collapse.disabled = empty || !model?.canCollapse;
	}

	private showScale(scale: number): void {
		this.percent.setText(zoomPercent(scale));
		// Zoomed far out, the boxes carry their names only.
		this.viewport.toggleClass('is-thin', scale < THIN_LABELS_BELOW);
		if (this.model) this.updateToolbar();
	}

	private sizes(): Sizes {
		const rem = remPx();
		const box = this.viewport.getBoundingClientRect();
		return {
			content: { width: this.contentRem.width * rem, height: this.contentRem.height * rem },
			viewport: { width: box.width, height: box.height },
			// The toolbar sits over the canvas, at the top or, on a narrow canvas, the bottom;
			// Fit and the opening view keep clear of whichever edge it is on. Measured from
			// layout rather than the screen, which a transform part-way through Obsidian
			// opening the tab would throw off.
			inset: toolbarInset(this.toolbar, this.viewport.clientHeight),
		};
	}
}

/** How much of the canvas the toolbar covers, at the edge it is nearer: the web app's `toolbarInset`. */
function toolbarInset(bar: HTMLElement, height: number): Inset {
	if (bar.offsetHeight === 0) return { top: 0, bottom: 0 };
	const top = bar.offsetTop;
	const bottom = top + bar.offsetHeight;
	return top < height - bottom ? { top: bottom, bottom: 0 } : { top: 0, bottom: height - top };
}

/** Pixels per rem, read off the page. */
function remPx(): number {
	return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/**
 * Where the selection's box is, in rem down the drawing: the chosen note's
 * row, or the selected verse, or the box hiding it (`anchorFor`). The web
 * app's `selectionY`, in `GraphCanvas.tsx`.
 */
function selectionY({
	layout,
	column,
	besideY,
	entry,
	verse,
}: {
	layout: GraphLayout;
	column: readonly GraphEntry[];
	besideY: number | undefined;
	entry: GraphEntry | null;
	verse: VerseRange | null;
}): number | undefined {
	if (entry) {
		const index = column.findIndex((item) => item.id === entry.id);
		return index === -1 ? undefined : entryRowTop(index, besideY);
	}
	return verse ? anchorFor(layout, verse, rangeKey(verse))?.y : undefined;
}
