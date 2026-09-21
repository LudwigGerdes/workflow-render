import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { exportFile, parseArgs, USAGE, USAGE_EXIT_CODE } from '../src/index.js';

const fixture = (name: string): string => {
  const candidates = [
    resolve(process.cwd(), `packages/core/test/fixtures/${name}.json`),
    resolve(process.cwd(), `../core/test/fixtures/${name}.json`),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) throw new Error(`fixture ${name} not found`);
  return path;
};

const outDir = (): string => mkdtempSync(join(tmpdir(), 'workflow-render-cli-'));

/** A workflow whose only connection points at a node that does not exist. */
const danglingWorkflow = (dir: string): string => {
  const file = join(dir, 'dangling.json');
  writeFileSync(
    file,
    JSON.stringify({
      name: 'Dangling',
      nodes: [
        {
          parameters: {},
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Start',
          type: 'n8n-nodes-base.manualTrigger',
          typeVersion: 1,
          position: [0, 0],
        },
      ],
      connections: { Start: { main: [[{ node: 'Ghost', type: 'main', index: 0 }]] } },
    }),
  );
  return file;
};

/** The built binary, for end-to-end exit-code and stderr checks. */
const builtCli = (): string => {
  const candidates = [
    resolve(process.cwd(), 'packages/cli/dist/cli.js'),
    resolve(process.cwd(), 'dist/cli.js'),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) throw new Error('build the CLI first: pnpm build');
  return path;
};

const runCli = (args: string[]): { status: number | null; stdout: string; stderr: string } => {
  const result = spawnSync(process.execPath, [builtCli(), ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

describe('parseArgs', () => {
  it('reads an export command', () => {
    expect(parseArgs(['export', 'wf.json', '-o', 'wf.svg'])).toEqual({
      kind: 'export',
      file: 'wf.json',
      out: 'wf.svg',
      scale: 2,
    });
  });

  it('refuses --scale with an SVG output, where it would do nothing', () => {
    expect(parseArgs(['export', 'wf.json', '-o', 'wf.svg', '--scale', '3'])).toMatchObject({
      kind: 'error',
      message: '--scale only applies to PNG output',
      exitCode: USAGE_EXIT_CODE,
    });
    expect(parseArgs(['export', 'wf.json', '-o', 'wf.svg'])).toMatchObject({ kind: 'export' });
  });

  it('takes a scale', () => {
    expect(parseArgs(['export', 'wf.json', '-o', 'wf.png', '--scale', '3'])).toMatchObject({
      scale: 3,
    });
  });

  it('reads a view command', () => {
    expect(parseArgs(['view', 'wf.json'])).toMatchObject({ kind: 'view', file: 'wf.json' });
  });

  it('explains itself when asked, and when misused', () => {
    expect(parseArgs(['--help']).kind).toBe('help');
    expect(parseArgs([]).kind).toBe('help');
    expect(parseArgs(['export', 'wf.json']).kind).toBe('error'); // no -o
    expect(parseArgs(['frobnicate']).kind).toBe('error');
  });

  it('rejects a flag it does not know, naming it, with a usage exit code', () => {
    expect(parseArgs(['export', 'wf.json', '-o', 'wf.svg', '--bogus'])).toEqual({
      kind: 'error',
      message: 'unknown flag "--bogus"',
      exitCode: 2,
    });
    // A misspelt flag must not silently produce a 1x PNG.
    expect(parseArgs(['export', 'wf.json', '-o', 'wf.png', '--sclae', '3'])).toMatchObject({
      kind: 'error',
      message: 'unknown flag "--sclae"',
      exitCode: 2,
    });
    // Each command knows only its own flags.
    expect(parseArgs(['view', 'wf.json', '--scale', '3'])).toMatchObject({
      kind: 'error',
      message: 'unknown flag "--scale"',
      exitCode: 2,
    });
    expect(parseArgs(['export', 'wf.json', '-o', 'wf.svg', '--theme', 'dark'])).toMatchObject({
      kind: 'error',
      message: 'unknown flag "--theme"',
      exitCode: 2,
    });
  });
});

describe('the built binary', () => {
  it('exits 2 on every argument error, not only unknown flags', () => {
    // --scale with an SVG path also sits in the existing unknown-flag case below.
    expect(runCli(['export', fixture('linear')]).status).toBe(2);
    expect(runCli(['export', fixture('linear'), '-o', join(outDir(), 'y.svg'), '--scale', '3']).status).toBe(2);
  });

  it('exits 2 with the usage text on an unknown flag, writing nothing', () => {
    const out = join(outDir(), 'x.svg');
    const { status, stderr } = runCli(['export', fixture('linear'), '-o', out, '--bogus']);
    expect(status).toBe(2);
    expect(stderr).toContain('workflow-render: unknown flag "--bogus"');
    expect(stderr).toContain(USAGE);
    expect(existsSync(out)).toBe(false);
  });

  it('prints renderer warnings to stderr after a successful export', () => {
    const dir = outDir();
    const out = join(dir, 'dangling.svg');
    const { status, stdout, stderr } = runCli(['export', danglingWorkflow(dir), '-o', out]);
    expect(status).toBe(0);
    expect(stdout).toContain(`wrote ${out}`);
    expect(stderr).toBe('warning: connection to unknown node "Ghost" dropped\n');
    expect(existsSync(out)).toBe(true);
  });

  it('is silent on stderr when there is nothing to warn about', () => {
    const out = join(outDir(), 'linear.svg');
    const { status, stderr } = runCli(['export', fixture('linear'), '-o', out]);
    expect(status).toBe(0);
    expect(stderr).toBe('');
  });
});

describe('exportFile', () => {
  it('returns the warnings the renderer produced', async () => {
    const dir = outDir();
    const result = await exportFile({
      kind: 'export',
      file: danglingWorkflow(dir),
      out: join(dir, 'dangling.svg'),
      scale: 2,
    });
    expect(result.warnings).toEqual(['connection to unknown node "Ghost" dropped']);
  });

  it('returns no warnings for a clean workflow', async () => {
    const result = await exportFile({ kind: 'export', file: fixture('linear'), out: join(outDir(), 'l.svg'), scale: 2 });
    expect(result.warnings).toEqual([]);
  });

  it('writes a standalone SVG with the font embedded', async () => {
    const out = join(outDir(), 'linear.svg');
    await exportFile({ kind: 'export', file: fixture('linear'), out, scale: 2 });
    const svg = readFileSync(out, 'utf8');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('@font-face');
    expect(svg).toContain('data-descriptions-version=');
  });

  it('writes a PNG at the requested scale', async () => {
    const one = join(outDir(), 'one.png');
    const three = join(outDir(), 'three.png');
    await exportFile({ kind: 'export', file: fixture('linear'), out: one, scale: 1 });
    await exportFile({ kind: 'export', file: fixture('linear'), out: three, scale: 3 });
    const small = PNG.sync.read(readFileSync(one));
    const large = PNG.sync.read(readFileSync(three));
    // The scene's bounds are fractional, so rasterising at different zooms
    // rounds independently -- within a pixel is the honest assertion.
    expect(Math.abs(large.width - small.width * 3)).toBeLessThanOrEqual(1);
    expect(Math.abs(large.height - small.height * 3)).toBeLessThanOrEqual(1);
    expect(large.width).toBeGreaterThan(small.width);
  });

  it('exports an execution the same way', async () => {
    const out = join(outDir(), 'exec.svg');
    await exportFile({ kind: 'export', file: fixture('execution-error'), out, scale: 2 });
    expect(readFileSync(out, 'utf8')).toContain('data-view="execution"');
  });

  it('refuses an output format it cannot write', async () => {
    const out = join(outDir(), 'nope.gif');
    await expect(
      exportFile({ kind: 'export', file: fixture('linear'), out, scale: 2 }),
    ).rejects.toThrow(/svg|png/i);
  });

  it('reports unreadable input rather than writing nothing quietly', async () => {
    const out = join(outDir(), 'x.svg');
    await expect(
      exportFile({ kind: 'export', file: join(outDir(), 'missing.json'), out, scale: 2 }),
    ).rejects.toThrow();
  });

  it('says what is wrong when the JSON is not a workflow', async () => {
    const dir = outDir();
    const bad = join(dir, 'bad.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(bad, JSON.stringify({ hello: 'world' }));
    await expect(
      exportFile({ kind: 'export', file: bad, out: join(dir, 'bad.svg'), scale: 2 }),
    ).rejects.toThrow(/not a workflow/i);
  });
});
