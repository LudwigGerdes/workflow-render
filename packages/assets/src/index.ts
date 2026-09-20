/**
 * Offline access to the icon and node-description data extracted at build time
 * from the published n8n packages (see scripts/extract.ts). No network I/O.
 */
import { readFile } from 'node:fs/promises';

import { dataFile } from './data-root.js';
import { EMULATED_VERSION } from './version.js';

export { DATA_ENV, dataFile, dataRoot } from './data-root.js';

export { EMULATED_VERSION } from './version.js';

export type IconEntry =
  | { type: 'svg'; svg: string }
  /** A FontAwesome Free glyph (CC BY 4.0), taken from the Iconify fa-solid set. */
  | { type: 'glyph'; body: string; viewBox: string; colorName?: string }
  /**
   * A raster vendor icon, inlined as a data URI. n8n ships some node icons as
   * PNG rather than SVG; they are embedded so the bundle stays self-contained
   * and nothing is fetched at render time.
   */
  | { type: 'image'; href: string }
  | { type: 'monogram'; letters: string; color: string };

export interface TrimmedDescription {
  name: string;
  displayName: string;
  defaults?: { name?: string; color?: string };
  version: number | number[];
  defaultVersion?: number;
  inputs: unknown;
  outputs: unknown;
  group?: string[];
  properties: unknown[];
  credentials?: Array<{ name: string; displayName?: string }>;
}

export interface AssetsMeta {
  n8nVersion: string;
  extractedAt: string;
  sources: Record<string, string>;
  counts: Record<string, number>;
  pngIconsPending: string[];
}

/** Absolute paths to the bundled Inter faces, for renderers that need files. */
export function fontFiles(): string[] {
  return ['400', '500', '600'].map((weight) => dataFile('fonts', `inter-${weight}.ttf`));
}

/**
 * The bundled Inter faces as woff2 bytes, for `@font-face` in a browser. Typed
 * as `Uint8Array` (they are Buffers) so the published declarations do not make
 * a consumer install `@types/node`.
 */
export function loadWebFonts(): Promise<Array<{ weight: number; woff2: Uint8Array }>> {
  return Promise.all(
    [400, 500, 600].map(async (weight) => ({
      weight,
      woff2: await readFile(dataFile('fonts', `inter-${weight}.woff2`)),
    })),
  );
}

const cache = new Map<string, Promise<unknown>>();

/**
 * Read one data file. When `fallback` is given and the file does not exist,
 * resolve to it instead of rejecting: the n8n-derived bundles are optional,
 * and a checkout without them renders monogram tiles and blank subtitles
 * rather than failing. Any other error (unreadable, malformed JSON) still
 * rejects.
 */
function load<T>(version: string, file: string, fallback?: T): Promise<T> {
  // Keyed by the resolved path, so a changed data root is not served from cache.
  const path = dataFile(version, file);
  const key = path;
  let pending = cache.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = readFile(path, 'utf8').then(
      (raw) => JSON.parse(raw) as T,
      (error: NodeJS.ErrnoException) => {
        if (fallback !== undefined && error.code === 'ENOENT') return fallback;
        throw error;
      },
    );
    cache.set(key, pending);
  }
  return pending;
}

export function loadIcons(version: string = EMULATED_VERSION): Promise<Record<string, IconEntry>> {
  return load<Record<string, IconEntry>>(version, 'icons.json', {});
}

export function loadDescriptions(
  version: string = EMULATED_VERSION,
): Promise<Record<string, TrimmedDescription[]>> {
  return load<Record<string, TrimmedDescription[]>>(version, 'descriptions.json', {});
}

export interface SubtitleSpec {
  /** n8n's subtitle template, e.g. `={{$parameter["method"] + ": " + $parameter["url"]}}`. */
  expression: string;
  /** Scalar property defaults, so an unset parameter still resolves. */
  defaults: Record<string, unknown>;
}

export function loadSubtitles(
  version: string = EMULATED_VERSION,
): Promise<Record<string, SubtitleSpec>> {
  return load<Record<string, SubtitleSpec>>(version, 'subtitles.json', {});
}

export function loadMeta(version: string = EMULATED_VERSION): Promise<AssetsMeta> {
  return load<AssetsMeta>(version, 'meta.json');
}
