/**
 * Node icons, served as a sidecar next to the bundle.
 *
 * Inlining the whole icon set put the bundle at 319 KB gzip, over the 300 KB
 * budget, so the documented fallback applies: `workflow-render-icons.json` is written
 * beside `workflow-render.js` at build time and fetched relative to this module's URL.
 * It is the same origin as the script — no third-party host, nothing to
 * configure — and when it is missing or blocked, every node simply falls back to
 * its monogram tile. The canvas still renders offline either way.
 */
import type { IconEntry, SubtitleSpec } from 'workflow-render-assets';
import { seeded } from './seed.js';
import { sidecarInit } from './integrity.js';

export type IconMap = Record<string, IconEntry>;

const SIDECAR = 'workflow-render-icons.json';

let pending: Promise<IconMap> | undefined;

/** Fetch the icon sidecar once. Never rejects: no icons just means monograms. */
export function loadIcons(): Promise<IconMap> {
  pending ??= (async (): Promise<IconMap> => {
    const inline = seeded('icons');
    if (inline) return inline;
    try {
      const url = new URL(SIDECAR, import.meta.url);
      const response = await fetch(url, sidecarInit(SIDECAR));
      if (!response.ok) return {};
      return (await response.json()) as IconMap;
    } catch {
      return {};
    }
  })();
  return pending;
}

/** Test seam: forget the cached sidecar. */
export function resetIcons(): void {
  pending = undefined;
}


/** Subtitle templates, fetched from the sidecar beside the bundle. */
let pendingSubtitles: Promise<Record<string, SubtitleSpec>> | undefined;

export function loadSubtitles(): Promise<Record<string, SubtitleSpec>> {
  pendingSubtitles ??= (async (): Promise<Record<string, SubtitleSpec>> => {
    const inline = seeded('subtitles');
    if (inline) return inline;
    try {
      const response = await fetch(
        new URL('workflow-render-subtitles.json', import.meta.url),
        sidecarInit('workflow-render-subtitles.json'),
      );
      return response.ok ? ((await response.json()) as Record<string, SubtitleSpec>) : {};
    } catch {
      return {};
    }
  })();
  return pendingSubtitles;
}

/**
 * Register the bundled Inter faces once per document.
 *
 * `@font-face` declared inside a shadow root is ignored, so this has to reach
 * the document. It is additive and idempotent: it defines a privately-named
 * family and never touches the host page's own styles.
 */
export function ensureFonts(): void {
  if (typeof document === 'undefined' || document.getElementById('workflow-render-fonts')) return;
  const style = document.createElement('style');
  style.id = 'workflow-render-fonts';
  // Resolve against a base URL rather than interpolating into `new URL(..., import.meta.url)`
  // directly: the bundler treats that shape as a glob import and refuses it.
  const base = new URL('.', import.meta.url);
  style.textContent = [400, 500, 600]
    .map(
      (weight) =>
        `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};font-display:swap;` +
        `src:url('${new URL('inter-' + String(weight) + '.woff2', base).href}') format('woff2');}`,
    )
    .join('');
  document.head.append(style);
}

export function resetSubtitles(): void {
  pendingSubtitles = undefined;
}


/** The bundled Inter faces as base64 woff2, for embedding in an export. */
let pendingFontData: Promise<Array<{ weight: number; woff2Base64: string }>> | undefined;

export function loadFontData(): Promise<Array<{ weight: number; woff2Base64: string }>> {
  pendingFontData ??= (async () => {
    const base = new URL('.', import.meta.url);
    const faces = await Promise.all(
      [400, 500, 600].map(async (weight) => {
        try {
          const response = await fetch(new URL('inter-' + String(weight) + '.woff2', base));
          if (!response.ok) return undefined;
          const bytes = new Uint8Array(await response.arrayBuffer());
          let binary = '';
          for (const byte of bytes) binary += String.fromCharCode(byte);
          return { weight, woff2Base64: btoa(binary) };
        } catch {
          return undefined;
        }
      }),
    );
    return faces.filter((face): face is { weight: number; woff2Base64: string } => face !== undefined);
  })();
  return pendingFontData;
}

export function resetFontData(): void {
  pendingFontData = undefined;
}
