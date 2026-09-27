import Panzoom, { type PanzoomObject } from '@panzoom/panzoom';
import {
	MAX_ZOOM,
	MIN_ZOOM,
	bringIntoView,
	centerEachAxis,
	centerView,
	fitView,
	keepInView,
	keepStill,
	nextZoomStep,
	openingView,
	samePoint,
	wheelIntent,
	wheelPan,
	wheelZoom,
	zoomAt,
	zoomDelta,
	type Inset,
	type Point,
	type Size,
} from '../graph-zoom-rules';
import { EASE_OUT_CSS, OPEN_CLOSE_MS } from '../graph-layout';

/**
 * Pan and zoom over the graph, the desktop half of the web app's
 * `GraphCanvas.tsx`. `@panzoom/panzoom` only applies the transform: its own
 * dragging and zooming are off, as in the app, and every move here goes through
 * `graph-zoom-rules.ts` and passes `force`.
 */

/** A pointer that moves further than this, in screen pixels, was a drag. */
const DRAG_SLOP = 6;

/** How long a wheel has to be still before the graph is eased back on screen. */
const WHEEL_SETTLE_MS = 200;

/** Marks what the canvas must not pan from or treat as empty space. */
export const CONTROL = 'verse-graph-control';

export type Sizes = { content: Size; viewport: Size; inset: Inset };

type Register = <K extends keyof HTMLElementEventMap>(
	el: HTMLElement,
	type: K,
	callback: (event: HTMLElementEventMap[K]) => void,
	options?: boolean | AddEventListenerOptions,
) => void;

export class PanZoom {
	private readonly pz: PanzoomObject;
	private wheelSettled = 0;

	constructor(
		private readonly viewport: HTMLElement,
		surface: HTMLElement,
		private readonly sizes: () => Sizes,
		register: Register,
		/** On every move and zoom, with the zoom it is at. */
		onChange: (scale: number) => void,
		onClickEmpty: () => void,
	) {
		this.pz = Panzoom(surface, {
			origin: '0 0',
			minScale: MIN_ZOOM,
			maxScale: MAX_ZOOM,
			disablePan: true,
			disableZoom: true,
			noBind: true,
		});
		surface.addEventListener('panzoomchange', (event) => {
			onChange((event as CustomEvent<{ scale: number }>).detail.scale);
		});

		let down: { point: Point; pan: Point; id: number } | null = null;
		let dragged = false;

		register(
			viewport,
			'pointerdown',
			(event) => {
				dragged = false;
				if ((event.target as Element).closest(`.${CONTROL}`)) return;
				if (event.button !== 0) return;
				viewport.focus({ preventScroll: true });
				down = { point: this.toViewport(event), pan: this.pz.getPan(), id: event.pointerId };
			},
			true,
		);
		register(
			viewport,
			'pointermove',
			(event) => {
				if (!down || event.pointerId !== down.id) return;
				const now = this.toViewport(event);
				if (!dragged && Math.hypot(now.x - down.point.x, now.y - down.point.y) <= DRAG_SLOP) return;
				// Captured only once it is a drag, so a plain click still lands on its node.
				if (!dragged) viewport.setPointerCapture(event.pointerId);
				dragged = true;
				const scale = this.pz.getScale();
				this.pz.pan(down.pan.x + (now.x - down.point.x) / scale, down.pan.y + (now.y - down.point.y) / scale, {
					force: true,
					animate: false,
				});
			},
			true,
		);
		const release = (event: PointerEvent) => {
			if (!down || event.pointerId !== down.id) return;
			down = null;
			if (dragged) this.keepInView();
		};
		register(viewport, 'pointerup', release, true);
		register(viewport, 'pointercancel', release, true);

		register(
			viewport,
			'click',
			(event) => {
				// A drag never selects what it ended on.
				if (dragged) {
					dragged = false;
					event.stopPropagation();
					event.preventDefault();
					return;
				}
				const target = event.target as Element;
				if (!target.closest(`[data-graph-node], .${CONTROL}`)) onClickEmpty();
			},
			true,
		);

		register(
			viewport,
			'wheel',
			(event) => {
				if ((event.target as Element).closest(`.${CONTROL}`)) return;
				event.preventDefault();
				// Scrolling moves the graph; Shift or Ctrl (a trackpad pinch) zooms it.
				if (wheelIntent(event) === 'pan') {
					const move = wheelPan(event.deltaX, event.deltaY, event.deltaMode);
					const scale = this.pz.getScale();
					this.pz.pan(move.x / scale, move.y / scale, { relative: true, force: true, animate: false });
				} else {
					const delta = zoomDelta(event.deltaX, event.deltaY);
					this.zoomAbout(this.toViewport(event), wheelZoom(this.pz.getScale(), delta, event.deltaMode), false);
				}
				window.clearTimeout(this.wheelSettled);
				this.wheelSettled = window.setTimeout(() => this.keepInView(), WHEEL_SETTLE_MS);
			},
			{ passive: false },
		);
	}

	get scale(): number {
		return this.pz.getScale();
	}

	/** How far the graph is moved, in unscaled pixels. */
	get pan(): Point {
		return this.pz.getPan();
	}

	/** Where the graph opens: fitted to the room, up to a readable size. */
	showOpening(): void {
		const { content, viewport, inset } = this.sizes();
		this.apply(openingView(content, viewport, inset), false);
	}

	fit(): void {
		const { content, viewport, inset } = this.sizes();
		this.apply(fitView(content, viewport, inset), true);
	}

	/**
	 * Back to where the graph opens, at the zoom it is at now. While Hide dimmed
	 * is taking things away, the middle of what is left instead, each axis on
	 * its own (`centerEachAxis`, the web app's item 8.7).
	 */
	center(hiding = false): void {
		const { content, viewport, inset } = this.sizes();
		const { pan } = (hiding ? centerEachAxis : centerView)(content, viewport, this.pz.getScale(), inset);
		this.pz.pan(pan.x, pan.y, { force: true, animate: true });
	}

	/**
	 * Moves the view by as much as one box moved down the drawing, the other
	 * way, over the same slide as the boxes, so the box stays where it was on
	 * screen (`keepStill`). `beforeY` and `afterY` are in rem.
	 */
	keepStill(beforeY: number, afterY: number, remPx: number): void {
		const next = keepStill(this.pz.getPan(), beforeY, afterY, remPx);
		const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		this.pz.pan(next.x, next.y, { force: true, animate, duration: OPEN_CLOSE_MS, easing: EASE_OUT_CSS });
	}

	/** − and +, about the middle of the canvas. */
	zoomStep(direction: 'in' | 'out'): void {
		const { viewport } = this.sizes();
		this.zoomAbout(
			{ x: viewport.width / 2, y: viewport.height / 2 },
			nextZoomStep(this.pz.getScale(), direction),
			true,
		);
	}

	/** Pans as little as it can for one box, in unscaled pixels, to be on screen. */
	showBox(box: { x: number; y: number; width: number; height: number }): void {
		const pan = this.pz.getPan();
		const next = bringIntoView(pan, this.pz.getScale(), box, this.sizes().viewport);
		if (!samePoint(pan, next)) this.pz.pan(next.x, next.y, { force: true, animate: true });
	}

	/** Released past the edge, it eases back until some of the graph shows. */
	keepInView(): void {
		const { content, viewport } = this.sizes();
		const pan = this.pz.getPan();
		const back = keepInView(pan, this.pz.getScale(), content, viewport);
		if (!samePoint(pan, back)) this.pz.pan(back.x, back.y, { force: true, animate: true });
	}

	destroy(): void {
		window.clearTimeout(this.wheelSettled);
		this.pz.destroy();
	}

	private zoomAbout(at: Point, toScale: number, animate: boolean): void {
		this.apply(zoomAt(at, this.pz.getScale(), this.pz.getPan(), toScale), animate);
	}

	private apply(view: { scale: number; pan: Point }, animate: boolean): void {
		this.pz.zoom(view.scale, { force: true, animate });
		this.pz.pan(view.pan.x, view.pan.y, { force: true, animate });
	}

	/** A pointer's position in the canvas, in screen pixels from its top-left corner. */
	private toViewport(event: { clientX: number; clientY: number }): Point {
		const rect = this.viewport.getBoundingClientRect();
		return {
			x: event.clientX - rect.left - this.viewport.clientLeft,
			y: event.clientY - rect.top - this.viewport.clientTop,
		};
	}
}
