import { n8nAdapter } from './n8n.js';
import type { CanvasAdapter } from './types.js';

/** Every adapter, in detection order. One today; the list is the seam. */
const ADAPTERS: readonly CanvasAdapter[] = [n8nAdapter];

/** The adapter that recognises this payload, or undefined for a format we do not read. */
export function adapterFor(input: unknown): CanvasAdapter | undefined {
  return ADAPTERS.find((adapter) => adapter.detects(input));
}

export { n8nAdapter };
export type { CanvasAdapter };
