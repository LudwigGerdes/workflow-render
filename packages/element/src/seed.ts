/**
 * Assets supplied inline instead of fetched.
 *
 * Normally the icon, subtitle and description sets ship as sidecars beside the
 * bundle and are fetched relative to it. That works when the canvas is served
 * from somewhere it controls, and not at all when someone pastes an embed into
 * a page on another host: the sidecars would resolve against their site.
 *
 * A self-contained embed seeds the assets on the page before the element loads.
 * Because only the node types a given workflow uses need to be present, the
 * seeded sets are a fraction of the full ones -- icons for a fifty-node
 * workflow come to about 27 KB against 1.2 MB for the whole set.
 */
import type { IconEntry, SubtitleSpec, TrimmedDescription } from 'workflow-render-assets';

export interface SeededAssets {
  icons?: Record<string, IconEntry>;
  subtitles?: Record<string, SubtitleSpec>;
  descriptions?: Record<string, TrimmedDescription[]>;
}

/** The global an embed sets before the bundle runs. */
export const SEED_KEY = '__WORKFLOW_RENDER_ASSETS__';

/** What was seeded for `key`, if anything. Never throws on a hostile value. */
export function seeded<K extends keyof SeededAssets>(key: K): SeededAssets[K] | undefined {
  try {
    const bag = (globalThis as Record<string, unknown>)[SEED_KEY];
    if (!bag || typeof bag !== 'object') return undefined;
    const value = (bag as SeededAssets)[key];
    return value && typeof value === 'object' ? value : undefined;
  } catch {
    return undefined;
  }
}
