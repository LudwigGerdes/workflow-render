/**
 * The NDV's data panes, as pure models.
 *
 * An execution export already contains everything these panes show, so this
 * only reshapes it: the items a run emitted, a table over their top-level keys,
 * and the same items as JSON. Nothing is fetched and nothing is executed —
 * binary is described from its metadata, never read.
 */
import type { CanvasModel, RunItem } from '../types.js';

export interface TableModel {
  columns: string[];
  /** One record per item, values already formatted for display. */
  rows: Array<Record<string, string>>;
  /** How many columns were dropped past the display cap. */
  truncatedColumns: number;
}

export interface DataPaneModel {
  runIndex: number;
  runCount: number;
  outputIndex: number;
  outputCount: number;
  items: RunItem[];
  table: TableModel;
  jsonText: string;
  error?: { message: string; description?: string; stack?: string };
  /** The items were pinned in the workflow rather than produced by a run. */
  pinned?: boolean;
}

/** n8n shows a bounded number of columns; the rest are reported as dropped. */
const MAX_COLUMNS = 12;
/** Cells are clipped so one long value cannot blow out the table. */
const MAX_CELL = 80;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function clip(text: string): string {
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL)}…` : text;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return clip(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return clip(JSON.stringify(value));
}

/** Binary is summarised from its metadata — never loaded. */
function binaryCell(item: RunItem): string {
  if (!item.binary) return '';
  return Object.entries(item.binary)
    .map(([key, meta]) => {
      const parts = [meta.fileName, meta.mimeType].filter(Boolean);
      return parts.length > 0 ? `binary — ${parts.join(', ')}` : `binary — ${key}`;
    })
    .join('; ');
}

export function buildTable(items: RunItem[]): TableModel {
  const seen: string[] = [];
  for (const item of items) {
    if (!isRecord(item.json)) continue;
    for (const key of Object.keys(item.json)) {
      if (!seen.includes(key)) seen.push(key);
    }
  }
  if (items.some((item) => item.binary && Object.keys(item.binary).length > 0)) {
    if (!seen.includes('binary')) seen.push('binary');
  }

  const columns = seen.slice(0, MAX_COLUMNS);
  const rows = items.map((item) => {
    const row: Record<string, string> = {};
    for (const column of columns) {
      row[column] =
        column === 'binary'
          ? binaryCell(item)
          : cell(isRecord(item.json) ? item.json[column] : undefined);
    }
    return row;
  });

  return { columns, rows, truncatedColumns: Math.max(seen.length - columns.length, 0) };
}

function paneFor(
  model: CanvasModel,
  nodeName: string,
  runIndex: number,
  outputIndex: number,
): DataPaneModel | undefined {
  const node = model.nodes.find((candidate) => candidate.name === nodeName);
  const runs = node?.run?.items;
  const detail = runs?.[runIndex];
  if (!runs || !detail) return undefined;

  const items = detail.outputs[outputIndex] ?? [];
  return {
    runIndex,
    runCount: runs.length,
    outputIndex,
    outputCount: Math.max(detail.outputs.length, 1),
    items,
    table: buildTable(items),
    jsonText: JSON.stringify(
      items.map((item) => item.json),
      null,
      2,
    ),
    ...(detail.error ? { error: detail.error } : {}),
    ...(node?.run?.pinned ? { pinned: true } : {}),
  };
}

/** What this node emitted on the given output, for one run. */
export function outputPane(
  model: CanvasModel,
  nodeName: string,
  runIndex = 0,
  outputIndex = 0,
): DataPaneModel | undefined {
  return paneFor(model, nodeName, runIndex, outputIndex);
}

/**
 * What this node received: the upstream node's output on the connection that
 * feeds it. A trigger has no input, and neither does an unconnected node.
 */
export function inputPane(
  model: CanvasModel,
  nodeName: string,
  runIndex = 0,
): DataPaneModel | undefined {
  const incoming = model.edges.find((edge) => edge.to === nodeName && edge.kind !== 'ai');
  if (!incoming) return undefined;
  return paneFor(model, incoming.from, runIndex, incoming.fromOutput);
}
