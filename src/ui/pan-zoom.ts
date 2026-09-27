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
	pinchTo,
	nextZoomStep,
	openingView,
	samePoint,
	wheelIntent,
	wheelPan,
	wheelZoom,
	zoomAt,
	zoomDelta,
	type Inset,
	type PinchStart,
	type Point,
	type Size,
} from '../graph-zoom-rules';
import { hasStopped, keepRecent, releaseVelocity, slowDown, type Sample, type Velocity } from '../graph-glide-rules';
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

/** Two taps closer together than this, in time and screen pixels, are a double tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 30;

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
	private glideFrame = 0;

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

		/**
		 * Dragging and pinching, as the web app's canvas does them. Every pointer
		 * on the canvas is kept by id; one drags, two pinch (`pinchTo`), and
		 * **whenever the count changes the gesture starts again from where the
		 * graph is**, so lifting one finger out of a pinch carries on as a drag
		 * instead of jumping back to where the pinch began.
		 */
		const pointers = new Map<number, Point>();
		let dragFrom: { point: Point; pan: Point } | null = null;
		let pinch: PinchStart | null = null;
		let pressedAt: Point | null = null;
		let dragged = false;
		let captured = false;
		/** The last 100 ms of where a lone finger was, for the glide when it lifts. */
		let samples: Sample[] = [];
		let lastTap: { at: number; point: Point } | null = null;

		const restartGesture = () => {
			const points = [...pointers.values()];
			dragFrom = null;
			pinch = null;
			const [a, b] = points;
			if (a && !b) dragFrom = { point: a, pan: this.pz.getPan() };
			else if (a && b) {
				pinch = {
					middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
					distance: Math.hypot(a.x - b.x, a.y - b.y),
					scale: this.pz.getScale(),
					pan: this.pz.getPan(),
				};
			}
		};

		register(
			viewport,
			'pointerdown',
			(event) => {
				// A finger landing on a gliding graph catches it, as on any phone.
				this.stopGlide();
				if ((event.target as Element).closest(`.${CONTROL}`)) return;
				if (event.pointerType === 'mouse' && event.button !== 0) return;
				if (pointers.size === 0) {
					dragged = false;
					captured = false;
					pressedAt = this.toViewport(event);
					viewport.focus({ preventScroll: true });
				}
				pointers.set(event.pointerId, this.toViewport(event));
				samples = [];
				restartGesture();
			},
			true,
		);
		register(
			viewport,
			'pointermove',
			(event) => {
				if (!pointers.has(event.pointerId)) return;
				const now = this.toViewport(event);
				pointers.set(event.pointerId, now);
				if (pressedAt && Math.hypot(now.x - pressedAt.x, now.y - pressedAt.y) > DRAG_SLOP) dragged = true;

				if (pinch && pointers.size >= 2) {
					const [a, b] = [...pointers.values()] as [Point, Point];
					this.apply(
						pinchTo(pinch, {
							middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
							distance: Math.hypot(a.x - b.x, a.y - b.y),
						}),
						false,
					);
					samples = [];
					return;
				}
				if (!dragFrom || !dragged) return;
				// Captured only once it is a drag, so a plain click still lands on its node.
				if (!captured) {
					viewport.setPointerCapture(event.pointerId);
					captured = true;
				}
				if (event.pointerType === 'touch') {
					samples = keepRecent(samples, event.timeStamp);
					samples.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
				}
				const scale = this.pz.getScale();
				this.pz.pan(dragFrom.pan.x + (now.x - dragFrom.point.x) / scale, dragFrom.pan.y + (now.y - dragFrom.point.y) / scale, {
					force: true,
					animate: false,
				});
			},
			true,
		);
		const release = (event: PointerEvent) => {
			if (!pointers.has(event.pointerId)) return;
			const wasOnlyFinger = pointers.size === 1;
			pointers.delete(event.pointerId);
			restartGesture();
			if (pointers.size > 0) return;

			// A lone finger flicked: the graph carries on a little and slows (graph-glide-rules.ts).
			const velocity =
				event.type === 'pointerup' && event.pointerType === 'touch' && dragged && wasOnlyFinger && !reducedMotion()
					? releaseVelocity(samples, event.timeStamp)
					: null;
			samples = [];
			if (velocity) this.glide(velocity);
			else if (dragged) this.keepInView();

			// A double tap zooms one step in, on the spot it landed.
			if (event.type !== 'pointerup' || event.pointerType !== 'touch' || dragged) return;
			const at = this.toViewport(event);
			const time = performance.now();
			if (lastTap && time - lastTap.at < DOUBLE_TAP_MS && Math.hypot(at.x - lastTap.point.x, at.y - lastTap.point.y) < DOUBLE_TAP_SLOP) {
				this.zoomAbout(at, nextZoomStep(this.pz.getScale(), 'in'), true);
				lastTap = null;
			} else {
				lastTap = { at: time, point: at };
			}
		};
		register(viewport, 'pointerup', release, true);
		register(viewport, 'pointercancel', release, true);

		// Obsidian on a phone opens its side panels on a sideways swipe. On the canvas a
		// swipe moves the graph, so it goes no further than the canvas.
		for (const type of ['touchstart', 'touchmove'] as const) {
			register(viewport, type, (event) => event.stopPropagation(), { passive: true });
		}

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
		const animate = !reducedMotion();
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
		this.stopGlide();
		this.pz.destroy();
	}

	/** Carries the graph on from a flick, slowing each frame, then eases it back on screen. */
	private glide(initial: Velocity): void {
		let velocity = initial;
		let last = performance.now();
		const frame = (now: number) => {
			const elapsed = Math.min(now - last, 50);
			last = now;
			const scale = this.pz.getScale();
			this.pz.pan((velocity.x * elapsed) / scale, (velocity.y * elapsed) / scale, {
				relative: true,
				force: true,
				animate: false,
			});
			velocity = slowDown(velocity, elapsed);
			if (hasStopped(velocity)) {
				this.glideFrame = 0;
				this.keepInView();
				return;
			}
			this.glideFrame = window.requestAnimationFrame(frame);
		};
		this.glideFrame = window.requestAnimationFrame(frame);
	}

	private stopGlide(): void {
		window.cancelAnimationFrame(this.glideFrame);
		this.glideFrame = 0;
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

function reducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
