/**
 * Goldens for the NDV data panes.
 *
 * A whole-panel pixel diff against n8n is not meaningful here: n8n's input pane
 * defaults to its Schema view, which workflow-render deliberately does not implement
 * (spec non-goal), so most differing pixels would be a feature we chose not to
 * build. What is worth pinning is the pane *content* — the columns, rows and
 * per-run splits we derive from an execution — so these goldens lock that down.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inputPane, outputPane } from '../src/inspector/index.js';
import { parseInput } from '../src/adapters/n8n.js';
import type { CanvasModel, DataPaneModel } from '../src/index.js';

const model = (name: string): CanvasModel => {
  const { model: parsed } = parseInput(
    JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')),
  );
  if (!parsed) throw new Error(`fixture ${name} did not parse`);
  return parsed;
};

/** A stable summary: the shape we would regress on, without volatile ids. */
const summarise = (pane: DataPaneModel | undefined) =>
  pane
    ? {
        runIndex: pane.runIndex,
        runCount: pane.runCount,
        items: pane.items.length,
        columns: pane.table.columns,
        truncatedColumns: pane.table.truncatedColumns,
        firstRow: pane.table.rows[0] ?? null,
        error: pane.error?.message ?? null,
      }
    : null;

const CASES: Array<{ fixture: string; node: string; runs: number }> = [
  { fixture: 'execution-success', node: 'Make Items', runs: 1 },
  { fixture: 'execution-success', node: 'Extract Emails', runs: 1 },
  { fixture: 'execution-error', node: 'Fail Here', runs: 1 },
  { fixture: 'execution-loop', node: 'Handle Batch', runs: 3 },
];

describe.each(CASES)('$fixture / $node', ({ fixture, node, runs }) => {
  it('matches its approved pane golden', () => {
    const canvas = model(fixture);
    const snapshot = Array.from({ length: runs }, (_, run) => ({
      run,
      input: summarise(inputPane(canvas, node, run)),
      output: summarise(outputPane(canvas, node, run, 0)),
    }));

    const path = fileURLToPath(
      new URL(`./golden/panes-${fixture}-${node.replace(/\s+/g, '-').toLowerCase()}.json`, import.meta.url),
    );
    const text = `${JSON.stringify(snapshot, null, 2)}\n`;

    if (!existsSync(path)) {
      writeFileSync(path, text);
      expect.fail(`pane golden created: ${path.split('/').pop()} — review it and re-run`);
    }
    expect(text).toBe(readFileSync(path, 'utf8'));
  });
});
