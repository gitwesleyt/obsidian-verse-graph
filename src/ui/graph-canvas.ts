import { moment, setIcon } from 'obsidian';
import {
	GRAPH_NODE_HEIGHT,
	GRAPH_ROW_PITCH,
	anchorFor,
	curveBetween,
	entryRowTop,
	layoutGraph,
	type GraphColumn,
	type GraphLayout,
	type PlacedNode,
} from '../graph-layout';
import {
	litPath,
	rangeKey,
	type GraphBookNode,
	type GraphEntry,
	type GraphTestamentNode,
	type VerseRange,
} from '../graph-rules';
import { MAX_ZOOM, MIN_ZOOM, THIN_LABELS_BELOW, zoomPercent } from '../graph-zoom-rules';
import { plural } from '../graph-selection';
import { CONTROL, PanZoom, type Sizes } from './pan-zoom';

/**
 * The graph's canvas: the tree, the notes column, the lines between them, and
 * the toolbar, drawn from `layoutGraph` in `rem` as the web app's
 * `GraphCanvas.tsx` does. Boxes are positioned elements; lines are one SVG
 * behind them. Redrawn whole on every change, which is cheap because only
 * what is open is drawn.
 */

/** Room round the drawing inside the transformed element, in rem. */
const PAD = 1;

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
};

export type CanvasActions = {
	toggle(key: string): void;
	selectVerse(range: VerseRange): void;
	selectEntry(id: string): void;
	clear(): void;
	loadMore(): void;
	expand(): void;
	collapse(): void;
	hoverEntry(event: MouseEvent, el: HTMLElement, id: string): void;
};

type Kind = 'testament' | 'category' | 'book' | 'chapter' | 'verse' | 'entry';
type Tone = 'rest' | 'faint' | 'lit';

export class GraphCanvas {
	readonly viewport: HTMLElement;
	private readonly surface: HTMLElement;
	private readonly drawing: HTMLElement;
	private readonly toolbar: HTMLElement;
	private readonly controls: Record<'out' | 'in' | 'fit' | 'center' | 'lines' | 'expand' | 'collapse', HTMLButtonElement>;
	private readonly percent: HTMLElement;
	/** Made the first time the canvas is in the page, which Panzoom requires; see `attached`. */
	private panZoom: PanZoom | null = null;

	private model: CanvasModel | null = null;
	private layout: GraphLayout | null = null;
	private contentRem = { width: 0, height: 0 };
	private showAllLines = false;
	private placed = false;

	constructor(
		parent: HTMLElement,
		private readonly actions: CanvasActions,
		private readonly register: ConstructorParameters<typeof PanZoom>[3],
	) {
		this.viewport = parent.createDiv({ cls: 'verse-graph-canvas', attr: { tabindex: '-1' } });
		this.surface = this.viewport.createDiv({ cls: 'verse-graph-surface' });
		this.drawing = this.surface.createDiv({ cls: 'verse-graph-drawing' });
		this.drawing.setCssStyles({ left: `${PAD}rem`, top: `${PAD}rem` });

		this.toolbar = this.viewport.createDiv({ cls: ['verse-graph-toolbar', CONTROL], attr: { role: 'toolbar' } });
		const button = (text: string, onClick: () => void, label?: string) => {
			const el = this.toolbar.createEl('button', { text, attr: label ? { 'aria-label': label } : {} });
			el.addEventListener('click', onClick);
			return el;
		};
		const divider = () => this.toolbar.createSpan({ cls: 'verse-graph-divider' });

		const out = button('−', () => this.attached()?.zoomStep('out'), 'Zoom out');
		this.percent = this.toolbar.createSpan({ cls: 'verse-graph-percent' });
		const zoomIn = button('+', () => this.attached()?.zoomStep('in'), 'Zoom in');
		divider();
		const fit = button('Fit', () => this.attached()?.fit());
		const center = button('', () => this.attached()?.center(), 'Center the graph');
		setIcon(center, 'crosshair');
		divider();
		const lines = button('Show all lines', () => {
			this.showAllLines = !this.showAllLines;
			this.redraw();
		});
		divider();
		const expand = button('Expand', () => this.actions.expand(), 'Open the next level: chapters, then verses');
		const collapse = button(
			'Collapse',
			() => this.actions.collapse(),
			'Close the deepest level open: verses, then chapters, then books',
		);
		this.controls = { out, in: zoomIn, fit, center, lines, expand, collapse };

		this.viewport.createDiv({ cls: 'verse-graph-hint', text: 'Scroll or drag to move · shift-scroll to zoom' });

		this.showScale(1);
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

	/** Keeps the chosen note on screen once its panel has taken room from the canvas. */
	showEntry(id: string): void {
		const index = this.model?.column.findIndex((item) => item.id === id) ?? -1;
		if (index < 0 || !this.layout) return;
		const rem = remPx();
		const box = this.layout.columns.entry;
		this.attached()?.showBox({
			x: (box.x + PAD) * rem,
			y: (this.entryTop(index) + PAD) * rem,
			width: box.width * rem,
			height: GRAPH_NODE_HEIGHT * rem,
		});
	}

	destroy(): void {
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
				(scale) => this.showScale(scale),
				() => this.actions.clear(),
			);
		}
		return this.panZoom;
	}

	private redraw(): void {
		const model = this.model;
		if (!model) return;
		const layout = layoutGraph(model.tree, (key) => model.open.has(key));
		this.layout = layout;

		const column = model.column;
		const besideY = this.besideTarget()?.y;
		this.contentRem = {
			width: layout.width + PAD * 2,
			height:
				Math.max(layout.treeHeight, entryRowTop(column.length + (model.moreCount > 0 ? 1 : 0), besideY)) + PAD * 2,
		};
		this.surface.setCssStyles({ width: `${this.contentRem.width}rem`, height: `${this.contentRem.height}rem` });

		this.drawing.empty();
		const empty = model.tree.length === 0;
		this.viewport.toggleClass('is-empty', empty);
		this.updateToolbar();
		if (empty) {
			const card = this.drawing.createDiv({ cls: 'verse-graph-empty' });
			card.createEl('h3', { text: 'No verses cited yet' });
			card.createEl('p', {
				text: 'Link a note to a verse note and the verse appears here. Converting plain references to links fills it in.',
			});
			return;
		}

		const lit = litPath(model.entry ? model.entry.cites : model.verse ? [model.verse] : []);
		this.drawHeadings(model.columnHeading);
		this.drawLines(layout, lit);
		this.drawTree(layout, lit);
		this.drawColumn();
		this.onResize();
	}

	private drawHeadings(entryHeading: string): void {
		const columns = this.layout!.columns;
		const withCategories = this.model!.tree.some((testament) => testament.categories);
		const headings: [GraphColumn, string][] = [
			['testament', 'Testament'],
			...(withCategories ? [['category', 'Literary categories'] as [GraphColumn, string]] : []),
			['book', 'Book'],
			['chapter', 'Chapter'],
			['verse', 'Verse'],
			['entry', entryHeading],
		];
		for (const [column, text] of headings) {
			const el = this.drawing.createDiv({ cls: 'verse-graph-heading', text });
			el.setCssStyles({ left: `${columns[column].x}rem`, width: `${columns[column].width}rem` });
		}
	}

	private drawLines(layout: GraphLayout, lit: Set<string>): void {
		const model = this.model!;
		const height = this.contentRem.height - PAD * 2;
		const width = layout.width;
		const svg = this.drawing.createSvg('svg', {
			cls: 'verse-graph-lines',
			attr: {
				width: `${width}rem`,
				height: `${height}rem`,
				viewBox: `0 0 ${width} ${height}`,
				'aria-hidden': 'true',
			},
		});
		const line = (d: string, tone: Tone, dimmed = false) => {
			svg.createSvg('path', {
				cls: ['verse-graph-line', `is-${tone}`, ...(dimmed ? ['is-dimmed'] : [])],
				attr: { d, 'vector-effect': 'non-scaling-stroke' },
			});
		};

		const anySelected = lit.size > 0;
		for (const node of layout.nodes) {
			const parent = node.parentKey ? layout.byKey.get(node.parentKey) : undefined;
			if (!parent) continue;
			const on = lit.has(node.key);
			line(curveBetween(parent, node, layout.columns), on ? 'lit' : 'rest', anySelected && !on);
		}

		// Two ranges hidden inside one closed book land on the same box: one line is enough.
		const drawn = new Set<string>();
		const toEntry = (prefix: string, range: VerseRange, index: number, tone: Tone) => {
			const from = anchorFor(layout, range, rangeKey(range));
			if (!from) return;
			const key = `${prefix}:${from.key}:${index}`;
			if (drawn.has(key)) return;
			drawn.add(key);
			line(curveBetween(from, { column: 'entry', y: this.entryTop(index) }, layout.columns), tone);
		};

		if (this.showAllLines) {
			model.column.forEach((item, index) => item.cites.forEach((range) => toEntry('a', range, index, 'faint')));
		}
		const chosen = model.entry ? model.column.findIndex((item) => item.id === model.entry?.id) : -1;
		if (model.entry && chosen !== -1) {
			model.entry.cites.forEach((range) => toEntry('s', range, chosen, 'lit'));
		} else if (model.verse) {
			const verse = model.verse;
			model.column.forEach((_, index) => toEntry('f', verse, index, 'lit'));
		}
	}

	private drawTree(layout: GraphLayout, lit: Set<string>): void {
		const model = this.model!;
		const anySelected = lit.size > 0;
		const selectedVerse = model.verse && !model.entry ? rangeKey(model.verse) : null;

		const draw = (key: string, kind: Kind, label: string, count: number, onClick: () => void) => {
			const placed = layout.byKey.get(key);
			if (!placed) return;
			const opens = kind !== 'verse';
			const el = this.node(placed, kind, {
				label,
				count,
				expanded: opens ? model.open.has(key) : undefined,
				lit: lit.has(key) && key !== selectedVerse,
				selected: key === selectedVerse,
				dimmed: anySelected && !lit.has(key),
			});
			el.addEventListener('click', onClick);
		};

		const drawBook = (book: GraphBookNode) => {
			draw(book.key, 'book', book.label, book.count, () => this.actions.toggle(book.key));
			for (const chapter of book.chapters) {
				draw(chapter.key, 'chapter', chapter.label, chapter.count, () => this.actions.toggle(chapter.key));
				for (const verse of chapter.verses) {
					draw(verse.key, 'verse', verse.label, verse.count, () => this.actions.selectVerse(verse.range));
				}
			}
		};

		for (const testament of model.tree) {
			draw(testament.key, 'testament', testament.label, testament.count, () => this.actions.toggle(testament.key));
			if (testament.categories) {
				// The literary categories level, when the tree is built with it (the web app's item 8.6).
				for (const category of testament.categories) {
					draw(category.key, 'category', category.label, category.count, () => this.actions.toggle(category.key));
					category.books.forEach(drawBook);
				}
			} else {
				testament.books.forEach(drawBook);
			}
		}
	}

	private drawColumn(): void {
		const model = this.model!;
		model.column.forEach((item, index) => {
			const isSelected = model.entry?.id === item.id;
			const el = this.node({ column: 'entry', y: this.entryTop(index) }, 'entry', {
				label: item.title,
				detail: moment(item.entryDate).format('D MMM YYYY'),
				count: item.cites.length,
				countLabel: `cites ${plural(item.cites.length, 'verse', 'verses')}`,
				selected: isSelected,
				lit: !model.entry && model.verse !== null,
				dimmed: model.entry !== null && !isSelected,
			});
			el.dataset.graphNode = `entry:${item.id}`;
			el.addEventListener('click', () => this.actions.selectEntry(item.id));
			el.addEventListener('mouseover', (event) => this.actions.hoverEntry(event, el, item.id));
		});

		if (model.moreCount > 0) {
			const more = this.drawing.createEl('button', {
				cls: 'verse-graph-more',
				text: `↓ ${plural(model.moreCount, 'more note', 'more notes')}`,
				attr: { 'data-graph-node': 'more' },
			});
			more.setCssStyles({
				left: `${this.layout!.columns.entry.x}rem`,
				top: `${this.entryTop(model.column.length) + (GRAPH_ROW_PITCH - GRAPH_NODE_HEIGHT) / 2}rem`,
			});
			more.addEventListener('click', () => this.actions.loadMore());
		}
	}

	private node(
		placed: { column: GraphColumn; y: number },
		kind: Kind,
		options: {
			label: string;
			count: number;
			countLabel?: string;
			detail?: string;
			expanded?: boolean;
			lit?: boolean;
			selected?: boolean;
			dimmed?: boolean;
		},
	): HTMLElement {
		const el = this.drawing.createDiv({
			cls: [
				'verse-graph-node',
				`is-${kind}`,
				...(options.lit ? ['is-lit'] : []),
				...(options.selected ? ['is-selected'] : []),
				...(options.dimmed ? ['is-dimmed'] : []),
			],
			attr: { 'data-graph-node': placed.column === 'entry' ? '' : kind, role: 'button' },
		});
		const column = this.layout!.columns[placed.column];
		el.setCssStyles({ left: `${column.x}rem`, top: `${placed.y}rem`, width: `${column.width}rem` });
		if (options.detail) el.createSpan({ cls: 'verse-graph-detail', text: options.detail });
		if (options.expanded !== undefined) {
			el.createSpan({ cls: 'verse-graph-chevron', text: options.expanded ? '▾' : '▸' });
			el.setAttr('aria-expanded', String(options.expanded));
		}
		el.createSpan({ cls: 'verse-graph-label', text: options.label });
		el.createSpan({
			cls: 'verse-graph-count',
			text: String(options.count),
			attr: options.countLabel ? { 'aria-label': options.countLabel } : {},
		});
		return el;
	}

	/** The selected verse's box, or the chapter or book hiding it, which the column starts level with. */
	private besideTarget(): PlacedNode | undefined {
		const verse = this.model?.verse;
		return verse && this.layout ? anchorFor(this.layout, verse, rangeKey(verse)) : undefined;
	}

	private entryTop(index: number): number {
		return entryRowTop(index, this.besideTarget()?.y);
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
		const bar = this.toolbar.getBoundingClientRect();
		return {
			content: { width: this.contentRem.width * rem, height: this.contentRem.height * rem },
			viewport: { width: box.width, height: box.height },
			// The toolbar sits over the top of the canvas; Fit and the opening view keep clear of it.
			inset: { top: box.height > 0 ? bar.bottom - box.top : 0, bottom: 0 },
		};
	}
}

/** Pixels per rem, read off the page. */
function remPx(): number {
	return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}
