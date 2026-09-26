/**
 * Node descriptions, served as a sidecar beside the bundle.
 *
 * The trimmed corpus is several megabytes — far too big to inline — so it ships
 * next to the JS like the icons do and is fetched only when the inspector first
 * needs it. If it is missing or blocked, the inspector still opens and falls
 * back to a flat key/value view, which is a degraded panel rather than an error.
 */
import type { TrimmedDescription } from 'workflow-render-assets';
import { seeded } from './seed.js';
import { sidecarInit } from './integrity.js';

export type DescriptionMap = Record<string, TrimmedDescription[]>;

let pending: Promise<DescriptionMap> | undefined;

export function loadDescriptions(): Promise<DescriptionMap> {
  pending ??= (async (): Promise<DescriptionMap> => {
    const inline = seeded('descriptions');
    if (inline) return inline;
    try {
      const response = await fetch(
        new URL('workflow-render-descriptions.json', import.meta.url),
        sidecarInit('workflow-render-descriptions.json'),
      );
      return response.ok ? ((await response.json()) as DescriptionMap) : {};
    } catch {
      return {};
    }
  })();
  return pending;
}

/** Test seam: forget the cached sidecar. */
export function resetDescriptions(): void {
  pending = undefined;
}
