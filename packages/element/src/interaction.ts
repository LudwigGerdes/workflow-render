/**
 * Pan/zoom over an SVG viewBox. Pure arithmetic, no DOM, so it is testable on
 * its own — the element only feeds it pointer events.
 *
 * The rendered SVG is never re-rendered while panning or zooming; only the
 * viewBox attribute changes.
 */

export interface ViewState {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PanZoomOptions {
  /** Furthest zoom out, as an absolute scale (viewport px per canvas unit). */
  minScale?: number;
  /** Furthest zoom in, as an absolute scale. */
  maxScale?: number;
}

/** Padding added around the scene when fitting, as a fraction. */
const FIT_PAD = 0.05;

/**
 * Zoom limits, measured from n8n 2.10.0's own zoom controls: clicking zoom-in
 * stops dead at 400%, while 30 zoom-out clicks never hit a floor (they reached
 * 1.7%), so the lower limit is effectively unbounded.
 */
const MAX_SCALE = 4;
const MIN_SCALE = 0.01;

const round = (value: number): number => Math.round(value * 100) / 100;

export class PanZoom {
  #view: ViewState;
  readonly #bounds: ViewState;
  readonly #minScale: number;
  readonly #maxScale: number;

  constructor(initial: ViewState, bounds: ViewState, opts: PanZoomOptions = {}) {
    this.#view = { ...initial };
    this.#bounds = { ...bounds };
    this.#minScale = opts.minScale ?? MIN_SCALE;
    this.#maxScale = opts.maxScale ?? MAX_SCALE;
  }

  state(): ViewState {
    return { ...this.#view };
  }

  /**
   * Absolute zoom: viewport pixels per canvas unit, so 1 is n8n's "100%".
   * Clamping is on this value, not on a ratio to the fitted view, because
   * n8n's ceiling is an absolute 400%.
   */
  scaleFor(viewportPx: { w: number; h: number }): number {
    return viewportPx.w / this.#view.w;
  }

  /** Zoom to an absolute scale, keeping the current centre. */
  zoomTo(scale: number, viewportPx: { w: number; h: number }): void {
    const clamped = Math.min(Math.max(scale, this.#minScale), this.#maxScale);
    const width = viewportPx.w / clamped;
    const height = this.#view.h * (width / this.#view.w);
    this.#view = {
      x: this.#view.x + this.#view.w / 2 - width / 2,
      y: this.#view.y + this.#view.h / 2 - height / 2,
      w: width,
      h: height,
    };
  }

  /** Drag by a screen-pixel delta. */
  pan(dxPx: number, dyPx: number, viewportPx: { w: number; h: number }): void {
    if (viewportPx.w <= 0 || viewportPx.h <= 0) return;
    this.#view = {
      ...this.#view,
      x: this.#view.x - dxPx * (this.#view.w / viewportPx.w),
      y: this.#view.y - dyPx * (this.#view.h / viewportPx.h),
    };
  }

  /** Zoom by `factor` about a screen point, which stays over the same world point. */
  zoomAt(factor: number, atPx: { x: number; y: number }, viewportPx: { w: number; h: number }): void {
    if (factor <= 0 || viewportPx.w <= 0 || viewportPx.h <= 0) return;
    const { x, y, w, h } = this.#view;

    // Clamp on the absolute scale (viewport px per canvas unit).
    const minWidth = viewportPx.w / this.#maxScale;
    const maxWidth = viewportPx.w / this.#minScale;
    const width = Math.min(Math.max(w / factor, minWidth), maxWidth);
    const height = h * (width / w);

    // Anchor: the world point under the cursor must not move.
    const ratioX = atPx.x / viewportPx.w;
    const ratioY = atPx.y / viewportPx.h;
    this.#view = {
      x: x + ratioX * w - ratioX * width,
      y: y + ratioY * h - ratioY * height,
      w: width,
      h: height,
    };
  }

  /** Back to the whole scene, with a little breathing room. */
  fit(): void {
    const w = this.#bounds.w * (1 + FIT_PAD);
    const h = this.#bounds.h * (1 + FIT_PAD);
    this.#view = {
      x: this.#bounds.x + this.#bounds.w / 2 - w / 2,
      y: this.#bounds.y + this.#bounds.h / 2 - h / 2,
      w,
      h,
    };
  }

  viewBox(): string {
    const { x, y, w, h } = this.#view;
    return `${round(x)} ${round(y)} ${round(w)} ${round(h)}`;
  }
}
