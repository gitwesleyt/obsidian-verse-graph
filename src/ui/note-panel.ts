import { Component, Keymap, MarkdownRenderer, TFile, moment, setIcon, type App } from 'obsidian';
import { parseBibleLink } from '../bible-link';
import { rangeKey, rangeLabel, type GraphEntry, type VerseRange } from '../graph-rules';
import { plural } from '../graph-selection';
import { rangesOf } from '../vault-graph';

/**
 * The read-only note panel beside the canvas, as the web app's
 * `GraphEntryPanel.tsx`: the chosen note's title, date and the verses it cites,
 * then the note itself, scrolled to the first paragraph citing the selected
 * verse, with Open note at the bottom. On a narrow graph, a sheet along the
 * bottom that opens from its title, as the app's is below its line.
 *
 * It reads only the one chosen note's text. The graph itself never does.
 */

export type PanelActions = {
	/** Back to the verse's column (‹). */
	back(): void;
	/** Hides the panel and keeps the note chosen (×). */
	close(): void;
	selectVerse(range: VerseRange): void;
	hoverLink(event: MouseEvent, el: HTMLElement, linktext: string, sourcePath: string): void;
};

export class NotePanel {
	readonly el: HTMLElement;
	private rendered: Component | null = null;
	private shown: string | null = null;
	private renderCount = 0;

	constructor(
		parent: HTMLElement,
		private readonly app: App,
		private readonly owner: Component,
		private readonly actions: PanelActions,
	) {
		this.el = parent.createDiv({ cls: 'verse-graph-panel' });
		this.el.hide();
	}

	/** Shows `entry`, or hides the panel for null. Redraws only when something it shows changed. */
	async show(entry: GraphEntry | null, verse: VerseRange | null): Promise<void> {
		const file = entry ? this.app.vault.getFileByPath(entry.id) : null;
		if (!entry || !file) {
			this.clear();
			this.el.hide();
			return;
		}

		const shown = JSON.stringify([entry, verse, file.stat.mtime]);
		this.el.show();
		if (shown === this.shown) return;
		this.shown = shown;

		const renderId = ++this.renderCount;
		const text = await this.app.vault.cachedRead(file);
		// A newer choice started its own render while this one was reading.
		if (renderId !== this.renderCount) return;
		await this.draw(entry, verse, file, text);
	}

	/** Forgets what it drew, so the next `show` draws again. */
	clear(): void {
		this.renderCount++;
		this.shown = null;
		if (this.rendered) this.owner.removeChild(this.rendered);
		this.rendered = null;
		this.el.empty();
	}

	private async draw(entry: GraphEntry, verse: VerseRange | null, file: TFile, text: string): Promise<void> {
		if (this.rendered) this.owner.removeChild(this.rendered);
		const rendered = this.owner.addChild(new Component());
		this.rendered = rendered;
		this.el.empty();

		// On a narrow graph the panel is a sheet along the bottom that arrives as its bar,
		// so the lines to the note's verses stay in sight; its title opens the rest, and
		// closes it again. Each note chosen arrives as a bar. Wide, the bar's title is not shown.
		this.el.removeClass('is-open');
		const bar = this.el.createDiv({ cls: 'verse-graph-panel-bar' });
		const title = bar.createEl('button', { cls: 'verse-graph-panel-title', text: entry.title });
		title.addEventListener('click', () => {
			this.el.toggleClass('is-open', !this.el.hasClass('is-open'));
			title.setAttr('aria-expanded', String(this.el.hasClass('is-open')));
		});
		title.setAttr('aria-expanded', 'false');
		if (verse) {
			const back = bar.createEl('button', { cls: 'clickable-icon verse-graph-back', text: `‹ ${rangeLabel(verse)}` });
			back.addEventListener('click', () => this.actions.back());
		} else {
			bar.createSpan({ cls: 'verse-graph-panel-kind', text: 'Note' });
		}
		bar.createDiv({ cls: 'verse-graph-spacer' });
		const close = bar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Close the note' } });
		setIcon(close, 'x');
		close.addEventListener('click', () => this.actions.close());

		const body = this.el.createDiv({ cls: 'verse-graph-panel-body' });
		const head = body.createDiv({ cls: 'verse-graph-panel-head' });
		head.createEl('h2', { text: entry.title });
		head.createDiv({ cls: 'verse-graph-panel-date', text: moment(entry.entryDate).format('dddd D MMMM YYYY') });
		head.createDiv({ cls: 'verse-graph-panel-cites', text: `Cites ${plural(entry.cites.length, 'verse', 'verses')}` });
		const chips = head.createDiv({ cls: 'verse-graph-chips' });
		for (const range of entry.cites) {
			const chip = chips.createEl('button', { cls: 'verse-graph-chip', text: rangeLabel(range) });
			chip.addEventListener('click', () => this.actions.selectVerse(range));
		}

		const page = body.createDiv({ cls: 'verse-graph-panel-page markdown-rendered' });
		await MarkdownRenderer.render(this.app, text, page, file.path, rendered);
		this.wireLinks(page, file.path);

		const landed = verse ? this.landOn(page, verse) : null;
		if (landed) {
			body.scrollTop += landed.getBoundingClientRect().top - body.getBoundingClientRect().top - 24;
		}

		const foot = this.el.createDiv({ cls: 'verse-graph-panel-foot' });
		foot.createSpan({ cls: 'verse-graph-muted', text: 'Read-only preview' });
		const open = foot.createEl('button', { cls: 'mod-cta', text: 'Open note' });
		open.addEventListener('click', (event) => void this.open(file, verse, event));
	}

	/** Links in the rendered note open and preview as they do in a note. */
	private wireLinks(page: HTMLElement, sourcePath: string): void {
		page.querySelectorAll<HTMLAnchorElement>('a.internal-link').forEach((link) => {
			const linktext = link.dataset.href ?? link.getAttr('href') ?? '';
			link.addEventListener('click', (event) => {
				event.preventDefault();
				void this.app.workspace.openLinkText(linktext, sourcePath, Keymap.isModEvent(event));
			});
			link.addEventListener('mouseover', (event) => this.actions.hoverLink(event, link, linktext, sourcePath));
		});
	}

	/** Marks the first paragraph linking to `verse`, and returns it. */
	private landOn(page: HTMLElement, verse: VerseRange): HTMLElement | null {
		const key = rangeKey(verse);
		for (const link of Array.from(page.querySelectorAll<HTMLAnchorElement>('a.internal-link'))) {
			const parsed = parseBibleLink((link.dataset.href ?? '').split('#')[0] ?? '');
			if (!parsed || !rangesOf(parsed).some((range) => rangeKey(range) === key)) continue;
			const block = link.closest<HTMLElement>('p, li, blockquote, td, h1, h2, h3, h4, h5, h6') ?? link;
			block.addClass('verse-graph-landed');
			return block;
		}
		return null;
	}

	/** Opens the note at the first line linking to `verse`, from Obsidian's link index. */
	private async open(file: TFile, verse: VerseRange | null, event: MouseEvent): Promise<void> {
		const leaf = this.app.workspace.getLeaf(Keymap.isModEvent(event) || 'tab');
		const line = verse ? this.lineCiting(file, verse) : undefined;
		await leaf.openFile(file, line === undefined ? {} : { eState: { line } });
	}

	private lineCiting(file: TFile, verse: VerseRange): number | undefined {
		const key = rangeKey(verse);
		const links = this.app.metadataCache.getFileCache(file)?.links ?? [];
		const link = links.find((candidate) => {
			const target = this.app.metadataCache.getFirstLinkpathDest(candidate.link.split('#')[0] ?? '', file.path);
			const parsed = parseBibleLink(target?.path ?? candidate.link.split('#')[0] ?? '');
			return parsed !== null && rangesOf(parsed).some((range) => rangeKey(range) === key);
		});
		return link?.position.start.line;
	}
}
