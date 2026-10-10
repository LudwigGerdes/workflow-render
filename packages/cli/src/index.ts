/**
 * The workflow-render CLI: render a workflow or execution to a file, or look at it.
 *
 *   workflow-render export wf.json -o wf.svg
 *   workflow-render export wf.json -o wf.png [--scale 3]
 *   workflow-render view wf.json
 *   workflow-render redact wf.json -o wf.public.json
 *
 * Export uses the same pipeline the viewer does, so a file on disk is what the
 * canvas shows. Nothing here reaches the network.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { fontFiles } from 'workflow-render-assets';
import { parseOverlay, redactWorkflow } from 'workflow-render-core';
import type { RedactKind, RedactOptions, RedactReport } from 'workflow-render-core';
import { renderToSVG } from './core.js';

export { packageVersion } from './core.js';


export interface ExportCommand {
  kind: 'export';
  file: string;
  out: string;
  scale: number;
  /** A canvas-overlay JSON file (workflow-lint `--format canvas-overlay`) to draw over the workflow. */
  overlay?: string;
  /** Render from a redacted copy (see redact.ts in core). */
  redact?: RedactSpec;
}

/** What to mask beyond the built-in rules, as given on the command line. */
export interface RedactSpec {
  mask: string[];
  keep: string[];
  keepData: boolean;
}

export interface RedactCommand extends RedactSpec {
  kind: 'redact';
  file: string;
  /** A path, or `-` for stdout. */
  out: string;
}

export interface ViewCommand {
  kind: 'view';
  file: string;
  port?: number;
}

export type Command =
  | ExportCommand
  | ViewCommand
  | RedactCommand
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'error'; message: string; exitCode?: number };

/** Exit status for a command line that could not be understood. */
export const USAGE_EXIT_CODE = 2;

/** The flags each command accepts; anything else is a typo, not a no-op. */
const KNOWN_FLAGS: Record<string, ReadonlySet<string>> = {
  export: new Set(['o', 'out', 'scale', 'overlay', 'redact', 'mask', 'keep', 'keep-data']),
  redact: new Set(['o', 'out', 'mask', 'keep', 'keep-data']),
  view: new Set(['port']),
};

/** Flags that take no value. */
const BOOLEAN_FLAGS: ReadonlySet<string> = new Set(['redact', 'keep-data']);
/** Flags that may be given more than once. */
const REPEATABLE: ReadonlySet<string> = new Set(['mask', 'keep']);

export const USAGE = `workflow-render — offline canvas for workflow JSON (n8n supported)

  workflow-render export <file.json> -o <out.svg|out.png> [--scale N] [--overlay findings.json]
                         [--redact [--mask RE]... [--keep RE]... [--keep-data]]
  workflow-render view   <file.json> [--port N]
  workflow-render redact <file.json> -o <out.json|-> [--mask RE]... [--keep RE]... [--keep-data]
  workflow-render --version | --help

Reads a workflow or execution JSON and renders it exactly as the viewer does.`;


export function parseArgs(argv: string[]): Command {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return { kind: 'help' };
  if (argv[0] === '--version' || argv[0] === '-v') return { kind: 'version' };

  const [command, ...rest] = argv;
  const known = command === undefined ? undefined : KNOWN_FLAGS[command];
  if (known === undefined) return { kind: 'error', message: `unknown command "${String(command)}"` };

  const positional: string[] = [];
  const flags = new Map<string, string[]>();

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i] as string;
    if (token.startsWith('-')) {
      const key = token.replace(/^--?/, '');
      if (!known.has(key)) {
        return { kind: 'error', message: `unknown flag "${token}"`, exitCode: USAGE_EXIT_CODE };
      }
      if (BOOLEAN_FLAGS.has(key)) {
        flags.set(key, ['true']);
        continue;
      }
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('-')) return { kind: 'error', message: `${token} needs a value` };
      flags.set(key, REPEATABLE.has(key) ? [...(flags.get(key) ?? []), next] : [next]);
      i += 1;
    } else {
      positional.push(token);
    }
  }

  const file = positional[0];
  if (file === undefined) return { kind: 'error', message: 'no input file given' };
  const one = (key: string): string | undefined => flags.get(key)?.[0];

  for (const flag of ['mask', 'keep']) {
    for (const pattern of flags.get(flag) ?? []) {
      try {
        new RegExp(pattern);
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        return { kind: 'error', message: `invalid --${flag} "${pattern}": ${why}`, exitCode: USAGE_EXIT_CODE };
      }
    }
  }
  const spec: RedactSpec = { mask: flags.get('mask') ?? [], keep: flags.get('keep') ?? [], keepData: flags.has('keep-data') };

  if (command === 'redact') {
    const out = one('o') ?? one('out');
    if (out === undefined) return { kind: 'error', message: 'redact needs -o <out.json> (or -o - for stdout)' };
    return { kind: 'redact', file, out, ...spec };
  }

  if (command === 'export') {
    const out = one('o') ?? one('out');
    if (out === undefined) return { kind: 'error', message: 'export needs -o <out.svg|out.png>' };
    const redact = flags.has('redact');
    if (!redact && (flags.has('mask') || flags.has('keep') || flags.has('keep-data'))) {
      return { kind: 'error', message: '--mask, --keep and --keep-data need --redact', exitCode: USAGE_EXIT_CODE };
    }

    // An SVG has no pixel size, so a scale would be accepted and do nothing.
    if (flags.has('scale') && !out.toLowerCase().endsWith('.png')) {
      return { kind: 'error', message: '--scale only applies to PNG output', exitCode: USAGE_EXIT_CODE };
    }

    const scale = Number(one('scale') ?? 2);
    if (!Number.isFinite(scale) || scale <= 0) {
      return { kind: 'error', message: `scale must be a positive number` };
    }

    const overlay = one('overlay');
    return {
      kind: 'export',
      file,
      out,
      scale,
      ...(overlay === undefined ? {} : { overlay }),
      ...(redact ? { redact: spec } : {}),
    };
  }

  const port = flags.has('port') ? Number(one('port')) : undefined;
  if (port !== undefined && !Number.isInteger(port)) {
    return { kind: 'error', message: 'port must be a whole number' };
  }
  return port === undefined ? { kind: 'view', file } : { kind: 'view', file, port };
}

export interface Rendered {
  svg: string;
  /** What the adapter dropped or defaulted while reading the file. */
  warnings: string[];
  /** What was masked, when rendering from a redacted copy. */
  report?: RedactReport;
}

const compile = (spec: RedactSpec): RedactOptions => ({
  mask: spec.mask.map((p) => new RegExp(p)),
  keep: spec.keep.map((p) => new RegExp(p)),
  keepData: spec.keepData,
});

/**
 * Render a file to an SVG string, exactly as the viewer would draw it, with
 * the parser's warnings alongside so a caller can show them.
 */
export async function renderFile(file: string, overlayFile?: string, redact?: RedactSpec): Promise<Rendered> {
  let source: unknown = JSON.parse(await readFile(file, 'utf8'));
  let report: RedactReport | undefined;
  if (redact !== undefined) {
    const result = redactWorkflow(source, compile(redact));
    source = result.json;
    report = result.report;
  }
  const withReport = (r: Rendered): Rendered => (report === undefined ? r : { ...r, report });
  if (overlayFile === undefined) return withReport(await renderToSVG(source));
  let overlaySource: unknown = JSON.parse(await readFile(overlayFile, 'utf8'));
  if (redact !== undefined) {
    // Finding texts can quote the values being hidden.
    const masked = redactWorkflow(overlaySource, compile(redact));
    overlaySource = masked.json;
    if (report !== undefined) report = { ...report, hits: [...report.hits, ...masked.report.hits] };
  }
  const { overlay, errors } = parseOverlay(overlaySource);
  if (overlay === undefined) {
    throw new Error(`${overlayFile} is not a canvas overlay:\n  ${errors.join('\n  ')}`);
  }
  return withReport(await renderToSVG(source, { overlay }));
}

/** Write a redacted copy of a workflow or execution; the JSON is returned for `-o -`. */
export async function redactFile(command: RedactCommand): Promise<{ json: string; report: RedactReport }> {
  if (command.out !== '-' && resolve(command.out) === resolve(command.file)) {
    throw new Error('-o is the input file; write the masked copy somewhere else');
  }
  const result = redactWorkflow(JSON.parse(await readFile(command.file, 'utf8')), compile(command));
  const json = `${JSON.stringify(result.json, null, 2)}\n`;
  if (command.out !== '-') await writeFile(command.out, json);
  return { json, report: result.report };
}

const REPORT_ORDER: RedactKind[] = ['credential', 'identifier', 'secret field', 'token', 'email', 'url credentials', 'data', 'custom'];

/** The human summary printed after a redaction: counts per kind, where, and the hosts left in. */
export function formatReport(file: string, report: RedactReport): string {
  const lines = [`masked ${report.hits.length} values in ${file}`];
  for (const kind of REPORT_ORDER) {
    const hits = report.hits.filter((h) => h.kind === kind);
    if (hits.length === 0) continue;
    const wheres = [...new Set(hits.map((h) => h.where))];
    lines.push(`  ${kind.padEnd(16)}${String(hits.length).padEnd(3)}${wheres.slice(0, 2).join(', ')}${wheres.length > 2 ? ', …' : ''}`);
  }
  if (report.hostsKept.length > 0) lines.push(`hosts kept: ${report.hostsKept.join(', ')}`);
  if (!report.recognised) lines.push('warning: not a workflow or execution; scanned as plain JSON');
  return lines.join('\n');
}

export async function exportFile(command: ExportCommand): Promise<{ warnings: string[]; report?: RedactReport }> {
  const target = command.out.toLowerCase();
  if (!target.endsWith('.svg') && !target.endsWith('.png')) {
    throw new Error(`cannot write "${command.out}" — the output must be .svg or .png`);
  }

  const { svg, warnings, report } = await renderFile(command.file, command.overlay, command.redact);
  const done = report === undefined ? { warnings } : { warnings, report };

  if (target.endsWith('.svg')) {
    await writeFile(command.out, svg);
    return done;
  }

  // Pin the fonts so a rasterised export does not depend on the machine's.
  const png = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: command.scale },
    font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: 'Inter' },
  })
    .render()
    .asPng();
  await writeFile(command.out, png);
  return done;
}

export { serve } from './view.js';
export type { ViewServer } from './view.js';
