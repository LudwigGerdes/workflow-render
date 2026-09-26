/**
 * `workflow-render/core` — render a workflow in Node, without the CLI.
 *
 *   import { renderToSVG } from 'workflow-render/core';
 *   const { svg } = await renderToSVG(JSON.parse(await readFile('wf.json', 'utf8')));
 *
 * Re-exports the pure pipeline (`parseInput → layout → renderSVG`, `exportSVG`,
 * the inspector model) and the data loaders, and adds the one-call path the CLI
 * itself uses. The icon, subtitle and font data ship inside this package and
 * are found through `dataRoot()`; set `WORKFLOW_RENDER_DATA` to use another copy.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { exportSVG, layout, parseInput, type ExportOptions, type Provenance } from 'workflow-render-core';
import { loadIcons, loadSubtitles, loadWebFonts } from 'workflow-render-assets';

export * from 'workflow-render-core';
export {
  DATA_ENV,
  EMULATED_VERSION,
  dataFile,
  dataRoot,
  fontFiles,
  loadDescriptions,
  loadIcons,
  loadMeta,
  loadSubtitles,
  loadWebFonts,
} from 'workflow-render-assets';
export type { AssetsMeta, IconEntry, SubtitleSpec, TrimmedDescription } from 'workflow-render-assets';

export interface RenderToSVGOptions extends Omit<ExportOptions, 'fonts'> {
  /** Inline the Inter faces so the file stands alone. Default true. */
  embedFonts?: boolean;
  /**
   * Override the provenance stamp. By default the tool name and version, a
   * hash of the input and the workflow's `id`, `name` and `versionId` are
   * written; fields given here replace the computed ones.
   */
  provenance?: Provenance;
}

/**
 * The version of the package this code shipped in. `package.json` is one level
 * above both `src/` and the bundled `dist/`, in a checkout and in a tarball.
 */
export function packageVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  if (typeof manifest === 'object' && manifest !== null && 'version' in manifest && typeof manifest.version === 'string') {
    return manifest.version;
  }
  throw new Error('package.json carries no version');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** JSON with every object's keys sorted, so two exports of the same workflow hash alike whatever their key order. */
function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** `sha256:` + the first 16 hex characters of the canonical input. */
export function inputHash(json: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJSON(json)).digest('hex').slice(0, 16)}`;
}

/**
 * The workflow's identity as an n8n export carries it: `id`, `name` and
 * `versionId` at the top level, or under `workflowData` in an execution.
 * `meta.instanceId` is deliberately not read.
 */
function workflowIdentity(json: unknown): Provenance['workflow'] {
  if (!isRecord(json)) return {};
  const workflow = isRecord(json['workflowData']) ? json['workflowData'] : json;
  const str = (key: string): string | undefined => {
    const value = workflow[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  return {
    ...(str('id') !== undefined ? { id: str('id') } : {}),
    ...(str('name') !== undefined ? { name: str('name') } : {}),
    ...(str('versionId') !== undefined ? { versionId: str('versionId') } : {}),
  };
}

/** The stamp `renderToSVG` writes unless told otherwise. */
export function provenanceFor(json: unknown): Provenance {
  return {
    tool: { name: 'workflow-render', version: packageVersion() },
    inputHash: inputHash(json),
    workflow: workflowIdentity(json),
  };
}

export interface RenderedSVG {
  svg: string;
  /** What the adapter dropped or defaulted while reading the input. */
  warnings: string[];
}

/**
 * Workflow or execution JSON (already parsed) → a standalone SVG string, drawn
 * exactly as the viewer draws it. Rejects when the input is not a workflow.
 * Deterministic: the same input and package version give the same bytes.
 */
export async function renderToSVG(json: unknown, options: RenderToSVGOptions = {}): Promise<RenderedSVG> {
  const { embedFonts = true, provenance, ...renderOptions } = options;
  const { model, warnings, errors } = parseInput(json);
  if (!model) throw new Error(errors[0] ?? 'could not read this workflow');

  const [icons, subtitles, webFonts] = await Promise.all([
    renderOptions.icons ?? loadIcons(),
    renderOptions.subtitles ?? loadSubtitles(),
    embedFonts ? loadWebFonts() : [],
  ]);
  const svg = exportSVG(layout(model), {
    ...renderOptions,
    icons,
    subtitles,
    provenance: { ...provenanceFor(json), ...provenance },
    fonts: webFonts.map((font) => ({ weight: font.weight, woff2Base64: Buffer.from(font.woff2).toString('base64') })),
  });
  return { svg, warnings };
}
