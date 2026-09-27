/**
 * The graph toolbar's icons, drawn as the web app draws them
 * (bible-journal-app/src/components/ui/icons.tsx, item 8.3): on a narrow graph
 * *Fit*, *Show all lines*, *Expand*, *Collapse* and *Hide dimmed* are these
 * instead of words, and *Replay* is `replay` in the header. The path data is
 * the app's, on its 24-unit grid; the drawing around it is Obsidian's.
 */
const ICONS = {
	fit: ['M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15'],
	lines: [
		'circle:5,12',
		'circle:19,5.5',
		'circle:19,12',
		'circle:19,18.5',
		'M6.75 12h10.5M6.6 11.2C11 11 12 5.5 17.25 5.5M6.6 12.8C11 13 12 18.5 17.25 18.5',
	],
	expand: ['M7 9.5l5-5 5 5M7 14.5l5 5 5-5'],
	collapse: ['M7 4.5l5 5 5-5M7 19.5l5-5 5 5'],
	hide: ['M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6z', 'circle:12,12,2.5', 'M4.5 19.5l15-15'],
	replay: ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9', 'M19.5 4.5V9H15'],
} as const;

export type ToolbarIcon = keyof typeof ICONS;

/** Draws one icon into `parent`, hidden from screen readers, which read the button's words. */
export function drawIcon(parent: HTMLElement, name: ToolbarIcon): SVGSVGElement {
	const svg = parent.createSvg('svg', {
		cls: 'verse-graph-icon',
		attr: {
			viewBox: '0 0 24 24',
			fill: 'none',
			stroke: 'currentColor',
			'stroke-width': '1.5',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'aria-hidden': 'true',
			focusable: 'false',
		},
	});
	for (const part of ICONS[name]) {
		if (part.startsWith('circle:')) {
			const [cx = '0', cy = '0', r = '1.75'] = part.slice('circle:'.length).split(',');
			svg.createSvg('circle', { attr: { cx, cy, r } });
		} else {
			svg.createSvg('path', { attr: { d: part } });
		}
	}
	return svg;
}
