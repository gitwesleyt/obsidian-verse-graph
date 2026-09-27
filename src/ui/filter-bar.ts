import { setIcon, type App } from 'obsidian';
import {
	NO_DATES,
	NO_GRAPH_FILTERS,
	booksButtonLabel,
	datesButtonLabel,
	hasDates,
	isFiltered,
	referenceLabel,
	tagsButtonLabel,
	type GraphFilters,
	type GraphReference,
} from '../graph-filter-rules';
import { BooksModal, DatesModal, ReferenceModal, TagsModal, type FilterContext } from './filter-modals';

/**
 * The filter bar above the graph (the web app's item 8.4): Books, a reference,
 * dates and tags, each a chip saying what it is set to, and Reset. A chip in
 * use is filled, and has an × that clears just it.
 */
export class FilterBar {
	private readonly el: HTMLElement;

	constructor(
		parent: HTMLElement,
		private readonly app: App,
		private readonly context: FilterContext,
		/** A reference was chosen, so the view can open the tree down to it. */
		private readonly chooseReference: (reference: GraphReference) => void,
	) {
		this.el = parent.createDiv({ cls: 'verse-graph-filters', attr: { role: 'toolbar', 'aria-label': 'Filters' } });
	}

	/** Draws the chips for the filters as they are now. */
	draw(): void {
		const filters = this.context.filters();
		const set = (change: Partial<GraphFilters>) => this.context.setFilters({ ...filters, ...change });
		this.el.empty();

		this.chip(booksButtonLabel(filters.books), filters.books.length > 0, 'book-open', () =>
			new BooksModal(this.app, this.context).open(),
		() => set({ books: [] }));
		this.chip(filters.reference ? referenceLabel(filters.reference) : 'Reference', filters.reference !== null, 'search', () =>
			new ReferenceModal(this.app, this.context, (reference) => this.chooseReference(reference)).open(),
		() => set({ reference: null }));
		this.chip(datesButtonLabel(filters.dates), hasDates(filters.dates), 'calendar', () =>
			new DatesModal(this.app, this.context).open(),
		() => set({ dates: NO_DATES }));
		this.chip(tagsButtonLabel(filters.tagNames), filters.tagNames.length > 0, 'tag', () =>
			new TagsModal(this.app, this.context).open(),
		() => set({ tagNames: [] }));

		if (isFiltered(filters)) {
			const reset = this.el.createEl('button', { cls: 'verse-graph-reset', text: 'Reset' });
			reset.addEventListener('click', () => this.context.setFilters(NO_GRAPH_FILTERS));
		}
	}

	private chip(text: string, active: boolean, icon: string, open: () => void, clear: () => void): void {
		const chip = this.el.createDiv({ cls: 'verse-graph-filter' });
		chip.toggleClass('is-active', active);
		const button = chip.createEl('button', { cls: 'verse-graph-filter-open' });
		setIcon(button.createSpan({ cls: 'verse-graph-filter-icon' }), icon);
		button.createSpan({ text });
		button.addEventListener('click', open);
		if (!active) return;
		const cross = chip.createEl('button', { cls: 'verse-graph-filter-clear', attr: { 'aria-label': `Clear ${text}` } });
		setIcon(cross, 'x');
		cross.addEventListener('click', clear);
	}
}
