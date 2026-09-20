import type { ParsedInput } from '../types.js';

/**
 * One source format.
 *
 * A canvas adapter is a *mapping*: payload in, neutral model out. It does not
 * interpret behaviour, trace branches, or read inside code — that would be an
 * interpreter, and a different product. Nothing downstream of `ParsedInput`
 * knows which adapter produced it, which is what lets a second one be added
 * without touching the renderer.
 */
export interface CanvasAdapter {
  /** Stable identifier, e.g. `n8n`. */
  readonly id: string;
  /** True when this adapter recognises the payload. */
  detects(input: unknown): boolean;
  /** Platform payload in, neutral model out. */
  parse(input: unknown): ParsedInput;
}
