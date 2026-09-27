import { Modal, Setting, SuggestModal, type App } from 'obsidian';
import { BIBLE_BOOKS } from '../bible-books';
import { monthName, weekdayName, type EntryFacet } from '../entry-filter-rules';
import {
	booksSelectedLabel,
	citedBooksOf,
	referenceSuggestions,
	testamentSummary,
	testamentTick,
	toggleBook,
	toggleTestament,
	type GraphFilters,
	type GraphReference,
	type ReferenceSuggestion,
	type ScopeCounts,
} from '../graph-filter-rules';
import { reachableDates } from '../graph-filters';
import { TESTAMENT_LABELS, testamentOf, type Testament } from '../graph-rules';
import { plural } from '../graph-selection';

/**
 * The filter bar's pickers (the web app's item 8.4), as Obsidian dialogs: the
 * app's popovers are its own; these are Obsidian's. Each applies as it is
 * ticked, as the app does at desktop width, so the graph behind changes while
 * the dialog is open.
 */

/** What a picker reads and changes, from the graph view. */
export type FilterContext = {
	filters(): GraphFilters;
	setFilters(filters: GraphFilters): void;
	/** Under every filter but the scope. */
	scopeCounts(): ScopeCounts;
	/** Without the dates. */
	dateFacets(): EntryFacet[];
	/** Without the tags. */
	tagCounts(): { name: string; count: number }[];
};

/** Books (design F3): each testament with a select-all box, and every book with its count. */
export class BooksModal extends Modal {
	/** Hide books with no entries starts on, the app owner's call on the preview. */
	private hideUncited = true;

	constructor(
		app: App,
		private readonly context: FilterContext,
	) {
		super(app);
		this.setTitle('Books');
	}

	onOpen(): void {
		this.draw();
	}

	private draw(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('verse-graph-books');
		const counts = this.context.scopeCounts();
		const ticked = this.context.filters().books;
		const tick = (books: string[]) => {
			this.context.setFilters({ ...this.context.filters(), books });
			this.draw();
		};

		new Setting(contentEl).setName('Hide books with no notes').addToggle((toggle) =>
			toggle.setValue(this.hideUncited).onChange((on) => {
				this.hideUncited = on;
				this.draw();
			}),
		);

		for (const testament of ['old', 'new'] as Testament[]) {
			const section = contentEl.createDiv({ cls: 'verse-graph-books-testament' });
			const head = section.createEl('label', { cls: 'verse-graph-books-head' });
			const all = head.createEl('input', { type: 'checkbox' });
			const state = testamentTick(testament, ticked, counts);
			all.checked = state === 'all';
			all.indeterminate = state === 'some';
			all.disabled = citedBooksOf(testament, counts).length === 0;
			all.addEventListener('change', () => tick(toggleTestament(testament, ticked, counts)));
			const words = head.createDiv();
			words.createDiv({ cls: 'verse-graph-books-name', text: TESTAMENT_LABELS[testament] });
			words.createDiv({ cls: 'verse-graph-muted', text: testamentSummary(testament, counts) });

			const grid = section.createDiv({ cls: 'verse-graph-books-grid' });
			for (const book of BIBLE_BOOKS.filter((candidate) => testamentOf(candidate.name) === testament)) {
				const count = counts.books.get(book.name) ?? 0;
				if (count === 0 && this.hideUncited) continue;
				const row = grid.createEl('label', { cls: 'verse-graph-books-book' });
				const box = row.createEl('input', { type: 'checkbox' });
				box.checked = ticked.includes(book.name);
				box.disabled = count === 0;
				box.addEventListener('change', () => tick(toggleBook(book.name, ticked)));
				row.createSpan({ text: book.name });
				if (count > 0) row.createSpan({ cls: 'verse-graph-muted', text: String(count) });
			}
		}

		const foot = contentEl.createDiv({ cls: 'verse-graph-modal-foot' });
		foot.createSpan({ cls: 'verse-graph-muted', text: booksSelectedLabel(ticked) });
		const done = foot.createEl('button', { cls: 'mod-cta', text: 'Done' });
		done.addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** A reference (design F2): a book or a chapter, typed, from what the notes cite. */
export class ReferenceModal extends SuggestModal<ReferenceSuggestion> {
	constructor(
		app: App,
		private readonly context: FilterContext,
		private readonly choose: (reference: GraphReference) => void,
	) {
		super(app);
		this.setPlaceholder('Type a book or chapter');
	}

	getSuggestions(query: string): ReferenceSuggestion[] {
		const answer = referenceSuggestions(query, this.context.scopeCounts());
		// A real book or chapter nobody has cited says so, rather than looking like a typo.
		this.emptyStateText =
			answer.kind === 'uncited' ? `No notes cite ${answer.label} yet.` : 'No book or chapter by that name.';
		return answer.kind === 'rows' ? answer.rows : [];
	}

	renderSuggestion(suggestion: ReferenceSuggestion, el: HTMLElement): void {
		el.addClass('verse-graph-suggestion');
		el.createSpan({ text: suggestion.label });
		el.createSpan({ cls: 'verse-graph-muted', text: `${suggestion.kind} · ${plural(suggestion.count, 'note', 'notes')}` });
	}

	onChooseSuggestion(suggestion: ReferenceSuggestion): void {
		this.choose(suggestion.chapter === undefined ? { book: suggestion.book } : { book: suggestion.book, chapter: suggestion.chapter });
	}
}

/** Dates (design F1c): Home's years, months and days of the week, never a continuous range. */
export class DatesModal extends Modal {
	constructor(
		app: App,
		private readonly context: FilterContext,
	) {
		super(app);
		this.setTitle('Dates');
	}

	onOpen(): void {
		this.draw();
	}

	private draw(): void {
		const { contentEl } = this;
		contentEl.empty();
		const facets = this.context.dateFacets();
		const dates = this.context.filters().dates;
		const reach = reachableDates(facets, dates);
		const years = [...new Set(facets.map((facet) => facet.year))].sort((a, b) => b - a);

		const group = (
			heading: string,
			values: number[],
			chosen: number[],
			reachable: Set<number>,
			label: (value: number) => string,
			set: (values: number[]) => GraphFilters['dates'],
		) => {
			contentEl.createEl('h6', { cls: 'verse-graph-chips-heading', text: heading });
			const chips = contentEl.createDiv({ cls: 'verse-graph-chips' });
			for (const value of values) {
				const on = chosen.includes(value);
				const chip = chips.createEl('button', { cls: 'verse-graph-chip', text: label(value) });
				chip.toggleClass('is-active', on);
				chip.setAttr('aria-pressed', String(on));
				// A chip that would find nothing is greyed, never hidden; a chosen one can always be let go.
				chip.disabled = !on && !reachable.has(value);
				chip.addEventListener('click', () => {
					const next = on ? chosen.filter((v) => v !== value) : [...chosen, value].sort((a, b) => a - b);
					this.context.setFilters({ ...this.context.filters(), dates: set(next) });
					this.draw();
				});
			}
		};

		group('Year', years, dates.years, reach.years, String, (years) => ({ ...dates, years }));
		group('Month', range(1, 12), dates.months, reach.months, (m) => monthName(m, 'short'), (months) => ({ ...dates, months }));
		group('Day of the week', range(0, 6), dates.weekdays, reach.weekdays, (d) => weekdayName(d, 'short'), (weekdays) => ({ ...dates, weekdays }));

		const foot = contentEl.createDiv({ cls: 'verse-graph-modal-foot' });
		const clear = foot.createEl('button', { text: 'Any date' });
		clear.addEventListener('click', () => {
			this.context.setFilters({ ...this.context.filters(), dates: { years: [], months: [], weekdays: [] } });
			this.draw();
		});
		const done = foot.createEl('button', { cls: 'mod-cta', text: 'Done' });
		done.addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Tags (design F5): a note carrying any one of those ticked. Obsidian's tags. */
export class TagsModal extends Modal {
	private search = '';

	constructor(
		app: App,
		private readonly context: FilterContext,
	) {
		super(app);
		this.setTitle('Tags');
	}

	onOpen(): void {
		const field = this.contentEl.createEl('input', {
			type: 'search',
			cls: 'verse-graph-tags-search',
			attr: { placeholder: 'Find a tag' },
		});
		field.addEventListener('input', () => {
			this.search = field.value.replace(/^#/, '').toLowerCase();
			this.drawList();
		});
		this.contentEl.createDiv({ cls: 'verse-graph-tags-list' });
		const foot = this.contentEl.createDiv({ cls: 'verse-graph-modal-foot' });
		const clear = foot.createEl('button', { text: 'Any tag' });
		clear.addEventListener('click', () => {
			this.context.setFilters({ ...this.context.filters(), tagNames: [] });
			this.drawList();
		});
		const done = foot.createEl('button', { cls: 'mod-cta', text: 'Done' });
		done.addEventListener('click', () => this.close());
		this.drawList();
	}

	private drawList(): void {
		const list = this.contentEl.querySelector<HTMLElement>('.verse-graph-tags-list');
		if (!list) return;
		list.empty();
		const chosen = this.context.filters().tagNames;
		const tags = this.context.tagCounts();
		// A chosen tag stays listed even when the other filters leave no note carrying it.
		for (const name of chosen) if (!tags.some((tag) => tag.name === name)) tags.push({ name, count: 0 });
		const shown = tags.filter((tag) => tag.name.includes(this.search));
		if (shown.length === 0) {
			list.createDiv({ cls: 'verse-graph-muted', text: tags.length === 0 ? 'These notes have no tags.' : 'No tag by that name.' });
			return;
		}
		for (const tag of shown) {
			const row = list.createEl('label', { cls: 'verse-graph-tags-tag' });
			const box = row.createEl('input', { type: 'checkbox' });
			box.checked = chosen.includes(tag.name);
			box.addEventListener('change', () => {
				const tagNames = box.checked ? [...chosen, tag.name] : chosen.filter((name) => name !== tag.name);
				this.context.setFilters({ ...this.context.filters(), tagNames });
				this.drawList();
			});
			row.createSpan({ text: `#${tag.name}` });
			row.createSpan({ cls: 'verse-graph-muted', text: String(tag.count) });
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

function range(from: number, to: number): number[] {
	return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}
