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
import { exportSVG, layout, parseInput, type ExportOptions } from 'workflow-render-core';
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
  const { embedFonts = true, ...renderOptions } = options;
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
    fonts: webFonts.map((font) => ({ weight: font.weight, woff2Base64: Buffer.from(font.woff2).toString('base64') })),
  });
  return { svg, warnings };
}
