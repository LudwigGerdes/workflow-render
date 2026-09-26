/**
 * The workflow-render CLI: render a workflow or execution to a file, or look at it.
 *
 *   workflow-render export wf.json -o wf.svg
 *   workflow-render export wf.json -o wf.png [--scale 3]
 *   workflow-render view wf.json
 *
 * Export uses the same pipeline the viewer does, so a file on disk is what the
 * canvas shows. Nothing here reaches the network.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { fontFiles } from 'workflow-render-assets';
import { parseOverlay } from 'workflow-render-core';
import { renderToSVG } from './core.js';

export { packageVersion } from './core.js';


export interface ExportCommand {
  kind: 'export';
  file: string;
  out: string;
  scale: number;
  /** A canvas-overlay JSON file (workflow-lint `--format canvas-overlay`) to draw over the workflow. */
  overlay?: string;
}

export interface ViewCommand {
  kind: 'view';
  file: string;
  port?: number;
}

export type Command =
  | ExportCommand
  | ViewCommand
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'error'; message: string; exitCode?: number };

/** Exit status for a command line that could not be understood. */
export const USAGE_EXIT_CODE = 2;

/** The flags each command accepts; anything else is a typo, not a no-op. */
const KNOWN_FLAGS: Record<string, ReadonlySet<string>> = {
  export: new Set(['o', 'out', 'scale', 'overlay']),
  view: new Set(['port']),
};

export const USAGE = `workflow-render — offline canvas for workflow JSON (n8n supported)

  workflow-render export <file.json> -o <out.svg|out.png> [--scale N] [--overlay findings.json]
  workflow-render view   <file.json> [--port N]
  workflow-render --version | --help

Reads a workflow or execution JSON and renders it exactly as the viewer does.`;


export function parseArgs(argv: string[]): Command {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return { kind: 'help' };
  if (argv[0] === '--version' || argv[0] === '-v') return { kind: 'version' };

  const [command, ...rest] = argv;
  const known = command === undefined ? undefined : KNOWN_FLAGS[command];
  if (known === undefined) return { kind: 'error', message: `unknown command "${String(command)}"` };

  const positional: string[] = [];
  const flags = new Map<string, string>();

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i] as string;
    if (token.startsWith('-')) {
      const key = token.replace(/^--?/, '');
      if (!known.has(key)) {
        return { kind: 'error', message: `unknown flag "${token}"`, exitCode: USAGE_EXIT_CODE };
      }
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('-')) return { kind: 'error', message: `${token} needs a value` };
      flags.set(key, next);
      i += 1;
    } else {
      positional.push(token);
    }
  }

  const file = positional[0];
  if (file === undefined) return { kind: 'error', message: 'no input file given' };

  if (command === 'export') {
    const out = flags.get('o') ?? flags.get('out');
    if (out === undefined) return { kind: 'error', message: 'export needs -o <out.svg|out.png>' };

    // An SVG has no pixel size, so a scale would be accepted and do nothing.
    if (flags.has('scale') && !out.toLowerCase().endsWith('.png')) {
      return { kind: 'error', message: '--scale only applies to PNG output', exitCode: USAGE_EXIT_CODE };
    }

    const scale = Number(flags.get('scale') ?? 2);
    if (!Number.isFinite(scale) || scale <= 0) {
      return { kind: 'error', message: `scale must be a positive number` };
    }

    const overlay = flags.get('overlay');
    return { kind: 'export', file, out, scale, ...(overlay === undefined ? {} : { overlay }) };
  }

  const port = flags.has('port') ? Number(flags.get('port')) : undefined;
  if (port !== undefined && !Number.isInteger(port)) {
    return { kind: 'error', message: 'port must be a whole number' };
  }
  return port === undefined ? { kind: 'view', file } : { kind: 'view', file, port };
}

export interface Rendered {
  svg: string;
  /** What the adapter dropped or defaulted while reading the file. */
  warnings: string[];
}

/**
 * Render a file to an SVG string, exactly as the viewer would draw it, with
 * the parser's warnings alongside so a caller can show them.
 */
export async function renderFile(file: string, overlayFile?: string): Promise<Rendered> {
  const source: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (overlayFile === undefined) return renderToSVG(source);
  const { overlay, errors } = parseOverlay(JSON.parse(await readFile(overlayFile, 'utf8')));
  if (overlay === undefined) {
    throw new Error(`${overlayFile} is not a canvas overlay:\n  ${errors.join('\n  ')}`);
  }
  return renderToSVG(source, { overlay });
}

export async function exportFile(command: ExportCommand): Promise<{ warnings: string[] }> {
  const target = command.out.toLowerCase();
  if (!target.endsWith('.svg') && !target.endsWith('.png')) {
    throw new Error(`cannot write "${command.out}" — the output must be .svg or .png`);
  }

  const { svg, warnings } = await renderFile(command.file, command.overlay);

  if (target.endsWith('.svg')) {
    await writeFile(command.out, svg);
    return { warnings };
  }

  // Pin the fonts so a rasterised export does not depend on the machine's.
  const png = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: command.scale },
    font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: 'Inter' },
  })
    .render()
    .asPng();
  await writeFile(command.out, png);
  return { warnings };
}

export { serve } from './view.js';
export type { ViewServer } from './view.js';
