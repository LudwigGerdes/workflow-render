/**
 * Dev-time extraction of node icons and trimmed node descriptions from the
 * PUBLISHED n8n npm packages. This is the only networked code in workflow-render and
 * never runs at runtime; its outputs under data/<version>/ are committed.
 *
 * Usage: pnpm --filter workflow-render-assets extract 2.38.1
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = [
  { pkg: 'n8n-nodes-base', prefix: 'n8n-nodes-base' },
  { pkg: '@n8n/n8n-nodes-langchain', prefix: '@n8n/n8n-nodes-langchain' },
] as const;

/**
 * n8n names its built-in glyphs `fa:<name>`, but it does not draw FontAwesome:
 * measuring what the canvas actually renders shows 24x24 stroke icons from
 * **Lucide** (ISC). The `fa:* -> lucide` mapping was derived by matching the
 * rendered geometry against the Lucide set, and the resulting glyph bodies are
 * committed in data/<version>/glyphs.json with their attribution.
 */
const GLYPHS_FILE = 'glyphs.json';

/**
 * Largest raster icon worth inlining.
 *
 * The median n8n PNG icon is about a kilobyte, and 64 of the 68 fit inside this
 * cap for roughly 161 KB all told. The remaining four are enormous -- Webex
 * twice at 216 KB, Acuity at 132, FileMaker at 62 -- and a 256 KB ceiling was
 * tried to take them. It cost 835 KB for four icons, five times what the other
 * sixty-four cost together, so the cap came back down. Anything above it is
 * refused and named in meta.json rather than dropped quietly.
 */
const MAX_RASTER_BYTES = 32 * 1024;

const MIME: Record<string, string> = {
  png: 'image/png',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * n8n's shared node icons, named `node:<id>` rather than pointing at a file.
 *
 * These do not ship in any published package: `@n8n/design-system` publishes
 * only `dist`, where the icons survive as compiled Vue render functions with
 * their markup destroyed. The SVGs exist as loose files in the tagged source,
 * so that is where they are read from -- still dev-time only, and still
 * reproducible from a version string alone.
 */
const NODE_ICON_DIR =
  'packages/frontend/@n8n/design-system/src/components/N8nIcon/nodes';
const N8N_TARBALL = (version: string) =>
  `https://codeload.github.com/n8n-io/n8n/tar.gz/refs/tags/n8n%40${version}`;

/** The `node:<id>` icon set, read from n8n's tagged source. */
function fetchNodeIcons(version: string, dest: string): Record<string, string> {
  mkdirSync(dest, { recursive: true });
  const tgz = join(dest, 'n8n-src.tar.gz');
  execFileSync('curl', ['-sL', '--fail', '--max-time', '300', '-o', tgz, N8N_TARBALL(version)], {
    stdio: 'inherit',
  });
  // A plain directory path rather than a glob: tar's wildcard flags differ
  // between the BSD and GNU builds, a literal path does not.
  const inner = `n8n-n8n-${version}/${NODE_ICON_DIR}`;
  execFileSync('tar', ['-xzf', tgz, '-C', dest, inner], { stdio: 'inherit' });

  const dir = join(dest, inner);
  const icons: Record<string, string> = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.svg')) continue;
    icons[file.slice(0, -'.svg'.length)] = sanitiseSvg(readFileSync(join(dir, file), 'utf8'));
  }
  return icons;
}

interface RawEntry {
  name?: string;
  displayName?: string;
  group?: string[];
  version?: number | number[];
  defaultVersion?: number;
  defaults?: Record<string, unknown>;
  inputs?: unknown;
  outputs?: unknown;
  properties?: unknown[];
  credentials?: Array<Record<string, unknown>>;
  icon?: string;
}

type IconEntry =
  | { type: 'svg'; svg: string }
  /** A FontAwesome Free glyph (CC BY 4.0) resolved from the Iconify set. */
  | { type: 'glyph'; body: string; viewBox: string; colorName?: string }
  | { type: 'image'; href: string }
  | { type: 'monogram'; letters: string; color: string };

interface GlyphFile {
  icons: Record<string, { lucide: string; body: string; viewBox: string }>;
}

/** npm pack + untar a package version into `dest`, returning the package dir. */
function fetchPackage(pkg: string, version: string, dest: string): string {
  mkdirSync(dest, { recursive: true });
  execFileSync('npm', ['pack', `${pkg}@${version}`, '--pack-destination', dest], {
    stdio: 'inherit',
  });
  const tgz = readdirSync(dest).find((f) => f.endsWith('.tgz'));
  if (!tgz) throw new Error(`npm pack produced no tarball for ${pkg}@${version}`);
  execFileSync('tar', ['xzf', join(dest, tgz), '-C', dest]);
  return join(dest, 'package');
}

/** Remove scripts, event handlers and off-package references from an SVG. */
function sanitiseSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*\/>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s(?:xlink:)?href\s*=\s*"(?:https?:)?\/\/[^"]*"/gi, '')
    .replace(/\s(?:xlink:)?href\s*=\s*'(?:https?:)?\/\/[^']*'/gi, '')
    .trim();
}

function monogram(entry: RawEntry): IconEntry {
  const words = String(entry.displayName ?? entry.name ?? '?')
    .split(/[\s_-]+/)
    .filter(Boolean);
  const letters = words.slice(0, 2).map((w) => (w[0] ?? '').toUpperCase()).join('') || '?';
  const color = typeof entry.defaults?.['color'] === 'string' ? (entry.defaults['color'] as string) : '#999';
  return { type: 'monogram', letters, color };
}

/** `icons/<pkg>/dist/...` → path inside the package dir, or undefined. */
function iconPath(url: string, prefix: string): string | undefined {
  const head = `icons/${prefix}/`;
  return url.startsWith(head) ? url.slice(head.length) : undefined;
}

function resolveIcon(
  entry: RawEntry,
  prefix: string,
  pkgDir: string,
  pngPending: string[],
  fullType: string,
  glyphs: GlyphFile | undefined,
  nodeIcons: Record<string, string>,
  oversized: string[],
): IconEntry {
  const raw = entry.iconUrl;
  const url = typeof raw === 'string' ? raw : raw?.light;
  if (url) {
    if (url.endsWith('.svg')) {
      const rel = iconPath(url, prefix);
      if (rel) {
        try {
          return { type: 'svg', svg: sanitiseSvg(readFileSync(join(pkgDir, rel), 'utf8')) };
        } catch {
          /* fall through to monogram */
        }
      }
    } else {
      // A raster icon: inline it, so it needs no network at render time.
      const rel = iconPath(url, prefix);
      const ext = url.split('.').pop()?.toLowerCase() ?? '';
      if (rel && MIME[ext]) {
        try {
          const bytes = readFileSync(join(pkgDir, rel));
          if (bytes.byteLength <= MAX_RASTER_BYTES) {
            return { type: 'image', href: `data:${MIME[ext]};base64,${bytes.toString('base64')}` };
          }
          oversized.push(`${fullType} (${Math.round(bytes.byteLength / 1024)} KB)`);
        } catch {
          /* fall through to monogram */
        }
      }
      pngPending.push(fullType);
    }
  }

  // `node:<id>`: n8n's own shared icon, by name rather than by path.
  if (typeof entry.icon === 'string' && entry.icon.startsWith('node:')) {
    const svg = nodeIcons[entry.icon.slice('node:'.length)];
    if (svg) return { type: 'svg', svg };
  }

  // `fa:pen` and friends: the Lucide glyph n8n actually draws.
  if (typeof entry.icon === 'string' && entry.icon.startsWith('fa:') && glyphs) {
    const glyph = glyphs.icons[entry.icon];
    if (glyph) {
      return {
        type: 'glyph',
        body: glyph.body,
        viewBox: glyph.viewBox,
        ...(entry.iconColor ? { colorName: entry.iconColor } : {}),
      };
    }
  }

  return monogram(entry);
}

/** Keep only what form reconstruction needs; drop docs prose and codex. */
function trimProperty(prop: unknown): unknown {
  if (!prop || typeof prop !== 'object') return prop;
  const p = prop as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ['displayName', 'name', 'type', 'default', 'displayOptions', 'placeholder', 'noDataExpression']) {
    if (p[key] !== undefined) out[key] = p[key];
  }
  if (Array.isArray(p['options'])) out['options'] = p['options'].map(trimProperty);
  if (Array.isArray(p['values'])) out['values'] = p['values'].map(trimProperty);
  if (p['typeOptions'] && typeof p['typeOptions'] === 'object') {
    const to = p['typeOptions'] as Record<string, unknown>;
    if (to['multipleValues'] !== undefined) out['typeOptions'] = { multipleValues: to['multipleValues'] };
  }
  if (Array.isArray(p['modes'])) out['modes'] = p['modes'].map(trimProperty);
  if (p['value'] !== undefined) out['value'] = p['value'];
  return out;
}

function trimDescription(entry: RawEntry, fullType: string): Record<string, unknown> {
  const trimmed: Record<string, unknown> = {
    name: fullType,
    displayName: entry.displayName ?? entry.name ?? fullType,
    version: entry.version ?? 1,
    inputs: entry.inputs ?? [],
    outputs: entry.outputs ?? [],
    properties: (entry.properties ?? []).map(trimProperty),
  };
  // n8n prints this under the node name; it is an expression over the node's
  // own parameters, evaluated by core at render time.
  if (entry.subtitle !== undefined) trimmed['subtitle'] = entry.subtitle;
  if (entry.icon !== undefined) trimmed['icon'] = entry.icon;
  if (entry.iconColor !== undefined) trimmed['iconColor'] = entry.iconColor;
  if (entry.defaultVersion !== undefined) trimmed['defaultVersion'] = entry.defaultVersion;
  if (entry.defaults) trimmed['defaults'] = entry.defaults;
  if (entry.group) trimmed['group'] = entry.group;
  if (entry.credentials) {
    trimmed['credentials'] = entry.credentials.map((c) => {
      const cred: Record<string, unknown> = { name: String(c['name'] ?? '') };
      if (typeof c['displayName'] === 'string') cred['displayName'] = c['displayName'];
      return cred;
    });
  }
  return trimmed;
}

function main(): void {
  const version = process.argv[2];
  if (!version) throw new Error('usage: extract <n8n version>');

  const tmp = mkdtempSync(join(tmpdir(), 'workflow-render-extract-'));
  const icons: Record<string, IconEntry> = {};
  const descriptions: Record<string, Array<Record<string, unknown>>> = {};
  const pngIconsPending: string[] = [];
  /** Raster icons refused for size, named so the choice stays visible. */
  const oversizedRasters: string[] = [];
  const sources: Record<string, string> = {};

  // Committed, so extraction needs no icon download.
  const glyphsPath = join(PKG_ROOT, 'data', version, GLYPHS_FILE);
  const glyphs: GlyphFile | undefined = existsSync(glyphsPath)
    ? (JSON.parse(readFileSync(glyphsPath, 'utf8')) as GlyphFile)
    : undefined;
  if (glyphs) sources['glyphs'] = `${GLYPHS_FILE} (Lucide, ISC)`;
  const missingGlyphs: string[] = [];

  const nodeIcons = fetchNodeIcons(version, join(tmp, 'n8n-src'));
  sources['node-icons'] = `n8n-io/n8n@n8n@${version} (${NODE_ICON_DIR})`;

  try {
    for (const { pkg, prefix } of SOURCES) {
      const pkgDir = fetchPackage(pkg, version, join(tmp, prefix.replace(/[@/]/g, '_')));
      sources[pkg] = `${pkg}@${version}`;
      const entries = JSON.parse(
        readFileSync(join(pkgDir, 'dist/types/nodes.json'), 'utf8'),
      ) as RawEntry[];
      for (const entry of entries) {
        if (!entry.name) continue;
        const fullType = entry.name.includes('.') ? entry.name : `${prefix}.${entry.name}`;
        if (!icons[fullType]) {
          icons[fullType] = resolveIcon(
            entry,
            prefix,
            pkgDir,
            pngIconsPending,
            fullType,
            glyphs,
            nodeIcons,
            oversizedRasters,
          );
          if (
            typeof entry.icon === 'string' &&
            entry.icon.startsWith('fa:') &&
            icons[fullType]?.type === 'monogram'
          ) {
            missingGlyphs.push(entry.icon);
          }
        }
        (descriptions[fullType] ??= []).push(trimDescription(entry, fullType));
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // A focused subtitles file: n8n prints these under the node name, and they
  // need the type's scalar defaults because a subtitle often references a
  // parameter the workflow never set (an unset HTTP method still prints GET).
  const subtitles: Record<string, { expression: string; defaults: Record<string, unknown> }> = {};
  for (const [type, entries] of Object.entries(descriptions)) {
    const entry = entries.find((e) => typeof e['subtitle'] === 'string');
    if (!entry) continue;
    const defaults: Record<string, unknown> = {};
    for (const prop of (entry['properties'] as Array<Record<string, unknown>>) ?? []) {
      const name = prop['name'];
      const value = prop['default'];
      if (typeof name === 'string' && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
        defaults[name] = value;
      }
    }
    subtitles[type] = { expression: entry['subtitle'] as string, defaults };
  }

  const outDir = join(PKG_ROOT, 'data', version);
  mkdirSync(outDir, { recursive: true });
  const sorted = <T>(o: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k] as T]));
  writeFileSync(join(outDir, 'icons.json'), `${JSON.stringify(sorted(icons))}\n`);
  writeFileSync(join(outDir, 'subtitles.json'), `${JSON.stringify(sorted(subtitles))}\n`);
  writeFileSync(join(outDir, 'descriptions.json'), `${JSON.stringify(sorted(descriptions))}\n`);
  writeFileSync(
    join(outDir, 'meta.json'),
    `${JSON.stringify(
      {
        n8nVersion: version,
        extractedAt: new Date().toISOString(),
        sources,
        counts: {
          icons: Object.keys(icons).length,
          svgIcons: Object.values(icons).filter((i) => i.type === 'svg').length,
          glyphIcons: Object.values(icons).filter((i) => i.type === 'glyph').length,
          imageIcons: Object.values(icons).filter((i) => i.type === 'image').length,
          monogramIcons: Object.values(icons).filter((i) => i.type === 'monogram').length,
          descriptions: Object.keys(descriptions).length,
          subtitles: Object.keys(subtitles).length,
        },
        attribution: {
          glyphs: 'Lucide (ISC) — https://lucide.dev. Bodies from the Iconify lucide set; the fa:* -> lucide mapping was measured from n8n 2.10.0, not copied from it.',
        },
        iconColors: [...new Set(Object.values(icons).flatMap((i) => (i.type === 'glyph' && i.colorName ? [i.colorName] : [])))].sort(),
        unresolvedGlyphs: [...new Set(missingGlyphs)].sort(),
        pngIconsPending: [...pngIconsPending].sort(),
        oversizedRasters: [...oversizedRasters].sort(),
        /**
         * Every type that fell back to initials. An icon silently becoming a
         * monogram is the failure this file exists to make visible: 166 of them
         * went unnoticed because nothing reported them.
         */
        monogramFallbacks: Object.entries(icons)
          .filter(([, i]) => i.type === 'monogram')
          .map(([type]) => type)
          .sort(),
        nodeIconsAvailable: Object.keys(nodeIcons).length,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`extracted ${Object.keys(icons).length} node types to ${outDir}\n`);
}

main();
