import { moment } from 'obsidian';
import {
	GRAPH_NODE_HEIGHT,
	GRAPH_ROW_PITCH,
	OPEN_CLOSE_MS,
	anchorFor,
	blendLayouts,
	curveBetween,
	easeOut,
	entryRowTop,
	restingBlend,
	type Blend,
	type GraphColumn,
	type GraphLayout,
} from '../graph-layout';
import { rangeKey, type GraphBookNode, type GraphEntry, type GraphTestamentNode, type VerseRange } from '../graph-rules';
import type { TreeStop } from '../graph-key-rules';
import { plural } from '../graph-selection';

/**
 * What the canvas draws inside its moving surface: the tree, the notes column
 * and the lines between them, in `rem` from `layoutGraph`.
 *
 * **Boxes are kept, not redrawn.** Each is made once and then moved, so a
 * change of what is lit or dimmed fades (the CSS transitions in styles.css) and
 * an open or close slides: every box and line moves from where it is to where
 * it is going over `OPEN_CLOSE_MS`, with `blendLayouts`, as in the web app. New
 * boxes grow out of their parent; closing ones slide back into it. Under
 * reduced motion it jumps.
 *
 * **The tree is one tab stop**, as in the web app: the node the keyboard is on
 * (`focusKey`, or the first node) takes Tab, and the canvas's arrow keys move
 * it (`graph-key-rules.ts`).
 *
 * **Only what is near the screen is in the page.** Every book, chapter and
 * verse open on a large vault is some 11,000 boxes and as many lines, so only
 * the rows within a screen's height of what shows are drawn, and more as a
 * move or zoom reaches past them.
 */

export type Scene = {
	tree: GraphTestamentNode[];
	layout: GraphLayout;
	/** Keys of everything lit: the selected verse's or chosen note's path. */
	lit: ReadonlySet<string>;
	open: ReadonlySet<string>;
	column: GraphEntry[];
	columnHeading: string;
	moreCount: number;
	verse: VerseRange | null;
	entry: GraphEntry | null;
	showAllLines: boolean;
};

export type DrawingActions = {
	toggle(key: string): void;
	selectVerse(range: VerseRange): void;
	selectEntry(id: string): void;
	loadMore(): void;
	hoverEntry(event: MouseEvent, el: HTMLElement, id: string): void;
	/** A tree node took the keyboard, by Tab, an arrow or a click. */
	focused(key: string): void;
};

/** Rows from the drawing's top, in rem. */
export type Band = { top: number; bottom: number };

type Kind = 'testament' | 'category' | 'book' | 'chapter' | 'verse' | 'entry';
type Tone = 'rest' | 'faint' | 'lit';
type TreeNode = { kind: Kind; label: string; count: number; level: number; range?: VerseRange };

const SVG = 'http://www.w3.org/2000/svg';

export class GraphDrawing {
	private scene: Scene | null = null;
	/** Every tree node by key, open or not, for labels and clicks. */
	private treeNodes = new Map<string, TreeNode>();
	/** Where the boxes are now, part-way through a slide or at rest. */
	private blend: Blend = new Map();
	private slide = { from: new Map() as Blend, start: 0, frame: 0 };
	/** The rows drawn at the last paint. */
	private painted: Band = { top: 0, bottom: 0 };
	/** New notes in the column fade in, but not ones a pan brings on screen. */
	private changing = false;
	/** The tree node the keyboard is on, or was last. */
	private focusKey: string | null = null;

	private readonly headings: HTMLElement;
	private readonly lines: SVGSVGElement;
	private readonly boxes = new Map<string, HTMLElement>();
	private readonly paths = new Map<string, SVGPathElement>();
	private more: HTMLButtonElement | null = null;
	private emptyCard: HTMLElement | null = null;

	constructor(
		private readonly el: HTMLElement,
		private readonly actions: DrawingActions,
		/** The rows to draw: what shows, and a screen either side. */
		private readonly near: () => Band,
	) {
		this.lines = el.createSvg('svg', { cls: 'verse-graph-lines', attr: { 'aria-hidden': 'true' } });
		this.headings = el.createDiv();
		el.setAttrs({ role: 'tree', 'aria-label': 'The verses your notes cite' });
	}

	/** Draws a new scene, sliding to it when what is open changed. */
	show(scene: Scene): void {
		const before = this.scene?.layout;
		this.scene = scene;
		this.treeNodes = treeNodesOf(scene.tree);
		this.drawHeadings();

		window.cancelAnimationFrame(this.slide.frame);
		const slides = before !== undefined && moved(before, scene.layout) && !reducedMotion();
		if (!slides) {
			this.blend = restingBlend(scene.layout);
			this.changing = true;
			this.paint();
			this.changing = false;
			return;
		}

		this.slide = { from: this.blend, start: performance.now(), frame: 0 };
		this.el.parentElement?.addClass('is-sliding');
		const step = (now: number) => {
			const t = easeOut((now - this.slide.start) / OPEN_CLOSE_MS);
			this.blend = blendLayouts(this.slide.from, scene.layout, t);
			this.changing = true;
			this.paint();
			this.changing = false;
			if (t < 1) this.slide.frame = window.requestAnimationFrame(step);
			else this.el.parentElement?.removeClass('is-sliding');
		};
		step(this.slide.start);
	}

	/** After a move or zoom: draws again if it reached rows past what was drawn. */
	afterMove(): void {
		const showing = this.near();
		const tall = (showing.bottom - showing.top) / 3;
		const onScreen = { top: showing.top + tall, bottom: showing.bottom - tall };
		if (onScreen.top >= this.painted.top && onScreen.bottom <= this.painted.bottom) return;
		this.paint();
	}

	/** What is showing of the tree, in reading order: what the arrow keys walk. */
	stops(): TreeStop[] {
		const layout = this.scene?.layout;
		if (!layout) return [];
		const stops: TreeStop[] = [];
		for (const key of this.treeNodes.keys()) {
			const placed = layout.byKey.get(key);
			if (placed) stops.push({ key, parentKey: placed.parentKey });
		}
		return stops;
	}

	/** Whether a tree node opens, whether it is open, and the verse it is if it is one. */
	nodeOf(key: string): { expandable: boolean; expanded: boolean; range?: VerseRange } | null {
		const node = this.treeNodes.get(key);
		if (!node || !this.scene) return null;
		const expandable = node.kind !== 'verse';
		return { expandable, expanded: expandable && this.scene.open.has(key), range: node.range };
	}

	/** Moves the keyboard to a tree node, drawing it first if it was off screen. */
	focus(key: string): void {
		this.focusKey = key;
		this.paint();
		this.boxes.get(key)?.focus({ preventScroll: true });
	}

	/** Where a note's row is now, in rem from the drawing's top. */
	entryTop(index: number): number {
		const scene = this.scene;
		const verse = scene?.verse;
		const beside = verse && scene ? anchorFor(scene.layout, verse, rangeKey(verse)) : undefined;
		const besideY = beside ? (this.blend.get(beside.key)?.y ?? beside.y) : undefined;
		return entryRowTop(index, besideY);
	}

	destroy(): void {
		window.cancelAnimationFrame(this.slide.frame);
	}

	private paint(): void {
		const scene = this.scene;
		if (!scene) return;
		this.painted = this.near();

		const empty = scene.tree.length === 0;
		this.el.parentElement?.parentElement?.toggleClass('is-empty', empty);
		if (empty) {
			this.clearAll();
			if (!this.emptyCard) {
				this.emptyCard = this.el.createDiv({ cls: 'verse-graph-empty' });
				this.emptyCard.createEl('h3', { text: 'No verses cited yet' });
				this.emptyCard.createEl('p', {
					text: 'Link a note to a verse note and the verse appears here. Converting plain references to links fills it in.',
				});
			}
			return;
		}
		this.emptyCard?.remove();
		this.emptyCard = null;

		const keptBoxes = new Set<string>();
		const keptPaths = new Set<string>();
		this.paintLines(scene, keptPaths);
		this.paintTree(scene, keptBoxes);
		this.paintColumn(scene, keptBoxes);
		removeAllBut(this.boxes, keptBoxes);
		removeAllBut(this.paths, keptPaths);
	}

	private clearAll(): void {
		for (const box of this.boxes.values()) box.remove();
		for (const path of this.paths.values()) path.remove();
		this.boxes.clear();
		this.paths.clear();
		this.more?.remove();
		this.more = null;
		this.headings.empty();
	}

	/** Whether anything between two heights, in rem, is within the rows being drawn. */
	private isNear(from: number, to: number): boolean {
		return Math.max(from, to) + GRAPH_ROW_PITCH >= this.painted.top && Math.min(from, to) <= this.painted.bottom;
	}

	private drawHeadings(): void {
		const scene = this.scene!;
		this.headings.empty();
		if (scene.tree.length === 0) return;
		const columns = scene.layout.columns;
		const headings: [GraphColumn, string][] = [
			['testament', 'Testament'],
			...(scene.tree.some((testament) => testament.categories)
				? [['category', 'Literary categories'] as [GraphColumn, string]]
				: []),
			['book', 'Book'],
			['chapter', 'Chapter'],
			['verse', 'Verse'],
			['entry', scene.columnHeading],
		];
		for (const [column, text] of headings) {
			const el = this.headings.createDiv({ cls: 'verse-graph-heading', text });
			el.setCssStyles({ left: `${columns[column].x}rem`, width: `${columns[column].width}rem` });
		}
	}

	private paintLines(scene: Scene, kept: Set<string>): void {
		const { layout, lit } = scene;
		const width = layout.width;
		const height = Math.max(layout.treeHeight, this.entryTop(scene.column.length));
		this.lines.setAttrs({ width: `${width}rem`, height: `${height}rem`, viewBox: `0 0 ${width} ${height}` });

		const anySelected = lit.size > 0;
		const line = (key: string, d: string, tone: Tone, dimmed: boolean, opacity = 1) => {
			let path = this.paths.get(key);
			if (!path) {
				path = document.createElementNS(SVG, 'path');
				path.setAttribute('vector-effect', 'non-scaling-stroke');
				this.lines.appendChild(path);
				this.paths.set(key, path);
			}
			path.setAttribute('d', d);
			path.setAttribute('class', `verse-graph-line is-${tone}${dimmed ? ' is-dimmed' : ''}`);
			path.style.opacity = opacity < 1 ? String(opacity * (dimmed ? 0.35 : 1)) : '';
			kept.add(key);
		};

		for (const node of this.blend.values()) {
			const parent = node.parentKey ? this.blend.get(node.parentKey) : undefined;
			if (!parent || !this.isNear(parent.y, node.y)) continue;
			const on = lit.has(node.key) && !node.leaving;
			line(`tree:${node.key}`, curveBetween(parent, node, layout.columns), on ? 'lit' : 'rest', anySelected && !on, node.opacity);
		}

		// Two ranges hidden inside one closed book land on the same box: one line is enough.
		const toEntry = (prefix: string, range: VerseRange, index: number, tone: Tone) => {
			const anchor = anchorFor(layout, range, rangeKey(range));
			if (!anchor) return;
			const from = { ...anchor, y: this.blend.get(anchor.key)?.y ?? anchor.y };
			const top = this.entryTop(index);
			const key = `${prefix}:${anchor.key}:${index}`;
			if (kept.has(key) || !this.isNear(from.y, top)) return;
			line(key, curveBetween(from, { column: 'entry', y: top }, layout.columns), tone, false);
		};

		if (scene.showAllLines) {
			scene.column.forEach((item, index) => item.cites.forEach((range) => toEntry('all', range, index, 'faint')));
		}
		const chosen = scene.entry ? scene.column.findIndex((item) => item.id === scene.entry?.id) : -1;
		if (scene.entry && chosen !== -1) {
			scene.entry.cites.forEach((range) => toEntry('chosen', range, chosen, 'lit'));
		} else if (scene.verse) {
			const verse = scene.verse;
			scene.column.forEach((_, index) => toEntry('verse', verse, index, 'lit'));
		}
	}

	private paintTree(scene: Scene, kept: Set<string>): void {
		const { lit, open } = scene;
		const anySelected = lit.size > 0;
		const selectedVerse = scene.verse && !scene.entry ? rangeKey(scene.verse) : null;
		// The node that takes Tab is always drawn, wherever it is, so Tab can reach it.
		const roving =
			this.focusKey && scene.layout.byKey.has(this.focusKey) ? this.focusKey : (this.stops()[0]?.key ?? null);

		for (const placed of this.blend.values()) {
			const node = this.treeNodes.get(placed.key);
			if (!node || (!this.isNear(placed.y, placed.y) && placed.key !== roving)) continue;
			const isLit = lit.has(placed.key) && !placed.leaving;
			const box = this.box(placed.key, node.kind, placed, {
				label: node.label,
				count: node.count,
				expanded: node.kind === 'verse' ? undefined : open.has(placed.key),
				lit: isLit && placed.key !== selectedVerse,
				selected: placed.key === selectedVerse,
				dimmed: anySelected && !isLit,
				opacity: placed.opacity,
				leaving: placed.leaving,
			});
			box.tabIndex = placed.key === roving ? 0 : -1;
			if (!box.dataset.wired) {
				box.dataset.wired = 'true';
				box.dataset.treeItem = placed.key;
				box.setAttrs({ role: 'treeitem', 'aria-level': String(node.level) });
				box.addEventListener('click', () => this.clickTree(placed.key));
				box.addEventListener('focus', () => {
					this.focusKey = placed.key;
					this.actions.focused(placed.key);
				});
			}
			if (node.range) box.setAttr('aria-selected', String(placed.key === selectedVerse));
			kept.add(placed.key);
		}
	}

	private clickTree(key: string): void {
		const node = this.treeNodes.get(key);
		if (!node) return;
		if (node.range) this.actions.selectVerse(node.range);
		else this.actions.toggle(key);
	}

	private paintColumn(scene: Scene, kept: Set<string>): void {
		scene.column.forEach((item, index) => {
			const top = this.entryTop(index);
			if (!this.isNear(top, top)) return;
			const key = `entry:${item.id}`;
			const isSelected = scene.entry?.id === item.id;
			const box = this.box(key, 'entry', { column: 'entry', y: top }, {
				label: item.title,
				detail: moment(item.entryDate).format('D MMM YYYY'),
				count: item.cites.length,
				countLabel: `cites ${plural(item.cites.length, 'verse', 'verses')}`,
				selected: isSelected,
				lit: !scene.entry && scene.verse !== null,
				dimmed: scene.entry !== null && !isSelected,
			});
			if (!box.dataset.wired) {
				box.dataset.wired = 'true';
				box.dataset.graphNode = key;
				box.addEventListener('click', () => this.actions.selectEntry(item.id));
				box.addEventListener('mouseover', (event) => this.actions.hoverEntry(event, box, item.id));
			}
			kept.add(key);
		});

		if (scene.moreCount <= 0) {
			this.more?.remove();
			this.more = null;
			return;
		}
		if (!this.more) {
			this.more = this.el.createEl('button', { cls: 'verse-graph-more', attr: { 'data-graph-node': 'more' } });
			this.more.addEventListener('click', () => this.actions.loadMore());
		}
		this.more.setText(`↓ ${plural(scene.moreCount, 'more note', 'more notes')}`);
		this.more.setCssStyles({
			left: `${scene.layout.columns.entry.x}rem`,
			top: `${this.entryTop(scene.column.length) + (GRAPH_ROW_PITCH - GRAPH_NODE_HEIGHT) / 2}rem`,
		});
	}

	/** A box, made the first time its key is drawn and brought up to date after. */
	private box(
		key: string,
		kind: Kind,
		placed: { column: GraphColumn; y: number },
		options: {
			label: string;
			count: number;
			countLabel?: string;
			detail?: string;
			expanded?: boolean;
			lit?: boolean;
			selected?: boolean;
			dimmed?: boolean;
			opacity?: number;
			leaving?: boolean;
		},
	): HTMLElement {
		let box = this.boxes.get(key);
		if (!box) {
			box = this.el.createDiv({
				cls: ['verse-graph-node', `is-${kind}`, ...(kind === 'entry' && this.changing ? ['is-entering'] : [])],
				attr: { 'data-graph-node': kind === 'entry' ? '' : kind, ...(kind === 'entry' ? { role: 'button' } : {}) },
			});
			if (options.detail) box.createSpan({ cls: 'verse-graph-detail' });
			if (options.expanded !== undefined) box.createSpan({ cls: 'verse-graph-chevron' });
			box.createSpan({ cls: 'verse-graph-label' });
			box.createSpan({ cls: 'verse-graph-count' });
			this.boxes.set(key, box);
		}

		box.toggleClass('is-lit', options.lit ?? false);
		box.toggleClass('is-selected', options.selected ?? false);
		box.toggleClass('is-dimmed', options.dimmed ?? false);
		box.toggleClass('is-leaving', options.leaving ?? false);
		const column = this.scene!.layout.columns[placed.column];
		box.setCssStyles({
			left: `${column.x}rem`,
			top: `${placed.y}rem`,
			width: `${column.width}rem`,
			opacity: options.opacity !== undefined && options.opacity < 1 ? String(options.opacity * (options.dimmed ? 0.35 : 1)) : '',
		});

		setText(box.querySelector('.verse-graph-detail'), options.detail ?? '');
		const chevron = box.querySelector('.verse-graph-chevron');
		if (chevron && options.expanded !== undefined) {
			setText(chevron, options.expanded ? '▾' : '▸');
			box.setAttr('aria-expanded', String(options.expanded));
		}
		setText(box.querySelector('.verse-graph-label'), options.label);
		const count = box.querySelector<HTMLElement>('.verse-graph-count');
		setText(count, String(options.count));
		if (options.countLabel) count?.setAttr('aria-label', options.countLabel);
		return box;
	}
}

/** Takes out of the page every element whose key is not in `kept`. */
function removeAllBut(elements: Map<string, Element>, kept: ReadonlySet<string>): void {
	for (const [key, el] of elements) {
		if (kept.has(key)) continue;
		el.remove();
		elements.delete(key);
	}
}

/** Only touches the page when the text changed, since boxes are brought up to date every frame of a slide. */
function setText(el: Element | null, text: string): void {
	if (el && el.textContent !== text) el.textContent = text;
}

/** Whether any box is somewhere else, or there, or gone, between two layouts. */
function moved(before: GraphLayout, after: GraphLayout): boolean {
	if (before.nodes.length !== after.nodes.length) return true;
	return after.nodes.some((node) => before.byKey.get(node.key)?.y !== node.y);
}

function reducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Every node in the tree by key, in reading order, whether it is open or not. */
function treeNodesOf(tree: readonly GraphTestamentNode[]): Map<string, TreeNode> {
	const nodes = new Map<string, TreeNode>();
	const addBook = (book: GraphBookNode, level: number) => {
		nodes.set(book.key, { kind: 'book', label: book.label, count: book.count, level });
		for (const chapter of book.chapters) {
			nodes.set(chapter.key, { kind: 'chapter', label: chapter.label, count: chapter.count, level: level + 1 });
			for (const verse of chapter.verses) {
				nodes.set(verse.key, {
					kind: 'verse',
					label: verse.label,
					count: verse.count,
					level: level + 2,
					range: verse.range,
				});
			}
		}
	};
	for (const testament of tree) {
		nodes.set(testament.key, { kind: 'testament', label: testament.label, count: testament.count, level: 1 });
		if (testament.categories) {
			for (const category of testament.categories) {
				nodes.set(category.key, { kind: 'category', label: category.label, count: category.count, level: 2 });
				category.books.forEach((book) => addBook(book, 3));
			}
		} else {
			testament.books.forEach((book) => addBook(book, 2));
		}
	}
	return nodes;
}
