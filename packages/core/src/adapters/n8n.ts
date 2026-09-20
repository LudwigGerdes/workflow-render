/**
 * Tolerant parsing of n8n workflow or execution JSON into a CanvasModel.
 *
 * Never throws on user input: anything unusable becomes a warning (or, when the
 * input is not a workflow at all, an error) and the rest still renders.
 */
import {
  DEFAULT_STICKY_COLOR,
  DEFAULT_STICKY_HEIGHT,
  DEFAULT_STICKY_WIDTH,
} from '../constants.js';
import { isHexColor } from '../color.js';
import type { CanvasAdapter } from './types.js';
import type {
  CanvasEdge,
  CanvasNodeSettings,
  RunDetail,
  RunItem,
  CanvasExecution,
  CanvasModel,
  CanvasNode,
  CanvasSticky,
  NodeKind,
  NodeRun,
  ParsedInput,
} from '../types.js';

const STICKY_TYPE = 'n8n-nodes-base.stickyNote';
const IF_TYPES = new Set(['n8n-nodes-base.if', 'n8n-nodes-base.filter']);
const SWITCH_TYPE = 'n8n-nodes-base.switch';
const SPLIT_IN_BATCHES_TYPE = 'n8n-nodes-base.splitInBatches';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

interface RawConnectionTarget {
  node: string;
  type: string;
  index: number;
}

/**
 * n8n serialises execution data with an index pool: the payload is an array in
 * which every string is the index of another entry, which lets it store cyclic
 * structures. A payload straight from the REST API therefore has `data` as a
 * string. Revive it so the rest of the pipeline sees the ordinary nested shape.
 */
function reviveFlatted(text: string): unknown {
  let pool: unknown;
  try {
    pool = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!Array.isArray(pool)) return undefined;

  const built = new Map<number, unknown>();
  const revive = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= pool.length) return value;
    if (built.has(index)) return built.get(index);

    const target = (pool as unknown[])[index];
    if (target === null || typeof target !== 'object') {
      built.set(index, target);
      return target;
    }
    const shell: unknown = Array.isArray(target) ? [] : {};
    built.set(index, shell);
    if (Array.isArray(target)) {
      for (const entry of target) (shell as unknown[]).push(revive(entry));
    } else {
      for (const [key, entry] of Object.entries(target)) {
        (shell as Record<string, unknown>)[key] = revive(entry);
      }
    }
    return shell;
  };

  return revive('0');
}

/** Accept a REST payload whose `data` is still index-encoded. */
function decodeExecution(json: unknown): unknown {
  if (!isRecord(json) || typeof json['data'] !== 'string') return json;
  const revived = reviveFlatted(json['data']);
  return revived === undefined ? json : { ...json, data: revived };
}

/** Shape check: does this look like a workflow (nodes array + connections)? */
function isWorkflow(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Array.isArray(value['nodes']) && isRecord(value['connections']);
}

/** Shape check: does this look like an execution (workflowData + runData)? */
function isExecution(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const resultData = isRecord(value['data']) ? value['data']['resultData'] : undefined;
  return isWorkflow(value['workflowData']) && isRecord(resultData) && isRecord(resultData['runData']);
}

/** Node-level settings live beside `parameters`, not inside them. */
function settingsOf(raw: Record<string, unknown>): CanvasNodeSettings | undefined {
  const settings: CanvasNodeSettings = {};
  if (asString(raw['onError']) !== undefined) settings.onError = asString(raw['onError']);
  if (raw['retryOnFail'] === true) settings.retryOnFail = true;
  if (asNumber(raw['maxTries']) !== undefined) settings.maxTries = asNumber(raw['maxTries']);
  if (asNumber(raw['waitBetweenTries']) !== undefined) {
    settings.waitBetweenTries = asNumber(raw['waitBetweenTries']);
  }
  if (raw['executeOnce'] === true) settings.executeOnce = true;
  if (raw['alwaysOutputData'] === true) settings.alwaysOutputData = true;
  return Object.keys(settings).length > 0 ? settings : undefined;
}

function positionOf(raw: unknown): [number, number] {
  if (Array.isArray(raw)) {
    return [asNumber(raw[0]) ?? 0, asNumber(raw[1]) ?? 0];
  }
  return [0, 0];
}

function classify(type: string, name: string, subNodes: Set<string>): NodeKind {
  if (subNodes.has(name)) return 'sub';
  if (type.endsWith('Trigger') || type === 'n8n-nodes-base.webhook') return 'trigger';
  return 'regular';
}

/**
 * A sticky's colour: a palette index, or a custom `#RRGGBB`.
 *
 * Both arrive in the same field. Reading it as a number alone discarded every
 * custom colour without a word -- a board of 41 distinct hexes parsed to one
 * yellow -- so anything unusable now says so instead of vanishing.
 */
function stickyColorFrom(raw: unknown, name: string, warnings: string[]): number | string {
  const index = asNumber(raw);
  if (index !== undefined) return index;
  if (isHexColor(raw)) return raw;
  if (raw !== undefined && raw !== null) {
    warnings.push(`sticky "${name}" has an unusable color; defaulted to ${DEFAULT_STICKY_COLOR}`);
  }
  return DEFAULT_STICKY_COLOR;
}

function stickyFrom(
  raw: Record<string, unknown>,
  name: string,
  warnings: string[],
): CanvasSticky {
  const parameters = isRecord(raw['parameters']) ? raw['parameters'] : {};
  const width = asNumber(parameters['width']);
  const height = asNumber(parameters['height']);
  if (width === undefined || height === undefined) {
    warnings.push(`sticky "${name}" has no usable size; defaulted to ${DEFAULT_STICKY_WIDTH}x${DEFAULT_STICKY_HEIGHT}`);
  }
  return {
    name,
    content: asString(parameters['content']) ?? '',
    color: stickyColorFrom(parameters['color'], name, warnings),
    position: positionOf(raw['position']),
    width: width ?? DEFAULT_STICKY_WIDTH,
    height: height ?? DEFAULT_STICKY_HEIGHT,
  };
}

/** Output labels n8n shows on a node's outgoing ports, by output index. */
function outputLabel(node: CanvasNode | undefined, outputIndex: number): string | undefined {
  if (!node) return undefined;
  if (IF_TYPES.has(node.type)) return outputIndex === 0 ? 'true' : 'false';
  if (node.type === SPLIT_IN_BATCHES_TYPE) return outputIndex === 0 ? 'done' : 'loop';
  if (node.type === SWITCH_TYPE) {
    const rules = node.parameters['rules'];
    const values = isRecord(rules) && Array.isArray(rules['values']) ? rules['values'] : undefined;
    const rule = values?.[outputIndex];
    return isRecord(rule) ? asString(rule['outputKey']) : undefined;
  }
  return undefined;
}

function connectionTargets(raw: unknown): RawConnectionTarget[][] {
  if (!Array.isArray(raw)) return [];
  return raw.map((outputs) =>
    (Array.isArray(outputs) ? outputs : []).flatMap((target) => {
      if (!isRecord(target)) return [];
      const node = asString(target['node']);
      if (node === undefined) return [];
      return [{ node, type: asString(target['type']) ?? 'main', index: asNumber(target['index']) ?? 0 }];
    }),
  );
}

/** Items exactly as the execution carries them, binary described not fetched. */
function itemsFrom(raw: unknown): RunItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((item) => {
    const binary = isRecord(item['binary'])
      ? Object.fromEntries(
          Object.entries(item['binary']).map(([key, meta]) => [
            key,
            isRecord(meta)
              ? {
                  ...(asString(meta['fileName']) !== undefined ? { fileName: asString(meta['fileName']) as string } : {}),
                  ...(asString(meta['mimeType']) !== undefined ? { mimeType: asString(meta['mimeType']) as string } : {}),
                  ...(asString(meta['fileSize']) !== undefined ? { fileSize: asString(meta['fileSize']) as string } : {}),
                }
              : {},
          ]),
        )
      : undefined;
    return {
      json: item['json'],
      ...(binary && Object.keys(binary).length > 0 ? { binary } : {}),
      ...(item['pairedItem'] !== undefined ? { pairedItem: item['pairedItem'] } : {}),
    };
  });
}

/**
 * Items pinned to a node in the workflow file.
 *
 * n8n keeps `pinData` beside the nodes, as a bare array per node name. Entries
 * are normally `{ json: ... }`, but data pinned by hand can be the object
 * itself, so both are accepted.
 *
 * The result is deliberately `status: 'none'`: pinning is not executing, and
 * colouring the tile as a success would claim a run that never happened. The
 * items still ride along so the output pane and the canvas count can show them,
 * flagged `pinned` so every consumer can say where they came from.
 */
function pinnedRun(raw: unknown): NodeRun | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const items: RunItem[] = raw.map((entry) =>
    isRecord(entry) && 'json' in entry ? { json: entry['json'] } : { json: entry },
  );
  return {
    status: 'none',
    runs: 1,
    itemsOut: [items.length],
    items: [{ outputs: [items] }],
    pinned: true,
  };
}

/** Per-node run summary from an execution's runData entry list. */
function runFrom(entries: unknown): NodeRun {
  const runs = Array.isArray(entries) ? entries : [];
  const itemsOut: number[] = [];
  const detail: RunDetail[] = [];
  let error: NodeRun['error'] | undefined;

  for (const entry of runs) {
    if (!isRecord(entry)) continue;
    const rawError = entry['error'];
    if (!error && isRecord(rawError)) {
      error = {
        message: asString(rawError['message']) ?? 'error',
        ...(asString(rawError['description']) !== undefined
          ? { description: asString(rawError['description']) as string }
          : {}),
        ...(asString(rawError['stack']) !== undefined ? { stack: asString(rawError['stack']) as string } : {}),
      };
    }
    const data = isRecord(entry['data']) ? entry['data'] : undefined;
    const main = data && Array.isArray(data['main']) ? data['main'] : [];
    main.forEach((items, index) => {
      const count = Array.isArray(items) ? items.length : 0;
      itemsOut[index] = (itemsOut[index] ?? 0) + count;
    });

    const runError = isRecord(entry['error'])
      ? {
          message: asString(entry['error']['message']) ?? 'error',
          ...(asString(entry['error']['description']) !== undefined
            ? { description: asString(entry['error']['description']) as string }
            : {}),
          ...(asString(entry['error']['stack']) !== undefined
            ? { stack: asString(entry['error']['stack']) as string }
            : {}),
        }
      : undefined;

    detail.push({
      outputs: main.map(itemsFrom),
      ...(runError ? { error: runError } : {}),
      ...(asNumber(entry['executionTime']) !== undefined
        ? { executionTime: asNumber(entry['executionTime']) as number }
        : {}),
    });
  }

  return {
    status: error ? 'error' : runs.length > 0 ? 'success' : 'none',
    runs: runs.length,
    itemsOut,
    ...(error ? { error } : {}),
    items: detail,
  };
}

function executionSummary(
  raw: Record<string, unknown>,
  anyNodeErrored: boolean,
): CanvasExecution {
  const started = Date.parse(asString(raw['startedAt']) ?? '');
  const stopped = Date.parse(asString(raw['stoppedAt']) ?? '');
  const declared = asString(raw['status']);
  const status: CanvasExecution['status'] =
    declared === 'success' || declared === 'error' ? declared : anyNodeErrored ? 'error' : 'success';
  return {
    status,
    ...(Number.isFinite(started) && Number.isFinite(stopped) ? { durationMs: stopped - started } : {}),
    ...(asString(raw['mode']) !== undefined ? { mode: asString(raw['mode']) as string } : {}),
  };
}

export function parseInput(input: unknown): ParsedInput {
  const warnings: string[] = [];
  const json = decodeExecution(input);
  const execution = isExecution(json) ? (json as Record<string, unknown>) : undefined;
  const workflow = execution ? (execution['workflowData'] as Record<string, unknown>) : json;

  if (!isWorkflow(workflow)) {
    return { warnings, errors: ['not a workflow or execution'] };
  }

  const rawNodes = (workflow['nodes'] as unknown[]).filter(isRecord);
  const runData = execution
    ? (((execution['data'] as Record<string, unknown>)['resultData'] as Record<string, unknown>)[
        'runData'
      ] as Record<string, unknown>)
    : undefined;
  const pinData = isRecord(workflow['pinData']) ? workflow['pinData'] : undefined;
  const connections = workflow['connections'] as Record<string, unknown>;

  // Sub-nodes are the sources of ai_* connections; collect them before classifying.
  const subNodes = new Set<string>();
  for (const [source, byType] of Object.entries(connections)) {
    if (!isRecord(byType)) continue;
    if (Object.keys(byType).some((type) => type.startsWith('ai_'))) subNodes.add(source);
  }

  const nodes: CanvasNode[] = [];
  const stickies: CanvasSticky[] = [];

  for (const raw of rawNodes) {
    const name = asString(raw['name']);
    const type = asString(raw['type']);
    if (name === undefined || type === undefined) {
      warnings.push('node without a name or type dropped');
      continue;
    }
    if (type === STICKY_TYPE) {
      stickies.push(stickyFrom(raw, name, warnings));
      continue;
    }
    const node: CanvasNode = {
      name,
      type,
      schemaVersion: asNumber(raw['typeVersion']) ?? 1,
      position: positionOf(raw['position']),
      parameters: isRecord(raw['parameters']) ? raw['parameters'] : {},
      kind: classify(type, name, subNodes),
      ...(raw['disabled'] === true ? { disabled: true } : {}),
      ...(asString(raw['notes']) !== undefined ? { notes: asString(raw['notes']) as string } : {}),
      ...(settingsOf(raw) ? { settings: settingsOf(raw) } : {}),
      source: raw,
    };
    if (runData) node.run = runFrom(runData[name]);
    // Real run data wins: if the node executed, what it actually produced is
    // the truth, and the pin is only what would have been substituted.
    if (!node.run && pinData) node.run = pinnedRun(pinData[name]);
    nodes.push(node);
  }

  const byName = new Map(nodes.map((node) => [node.name, node]));
  const edges: CanvasEdge[] = [];

  for (const [source, byType] of Object.entries(connections)) {
    if (!isRecord(byType)) continue;
    const sourceNode = byName.get(source);
    if (!sourceNode) {
      warnings.push(`connection from unknown node "${source}" dropped`);
      continue;
    }
    const continuesOnError = sourceNode.parameters['onError'] === 'continueErrorOutput' ||
      (isRecord(sourceNode.parameters['options']) &&
        sourceNode.parameters['options']['onError'] === 'continueErrorOutput');

    for (const [connectionType, raw] of Object.entries(byType)) {
      const outputs = connectionTargets(raw);
      const lastUsedOutput = outputs.reduce((last, targets, index) => (targets.length ? index : last), -1);

      outputs.forEach((targets, fromOutput) => {
        for (const target of targets) {
          if (!byName.has(target.node)) {
            warnings.push(`connection to unknown node "${target.node}" dropped`);
            continue;
          }
          const isError =
            connectionType === 'main' && continuesOnError && fromOutput === lastUsedOutput && lastUsedOutput > 0;
          const label = connectionType === 'main' ? outputLabel(sourceNode, fromOutput) : undefined;
          const itemCount = sourceNode.run?.itemsOut[fromOutput];
          edges.push({
            from: source,
            fromOutput,
            to: target.node,
            toInput: target.index,
            kind: connectionType.startsWith('ai_') ? 'ai' : isError ? 'error' : 'main',
            ...(label !== undefined ? { label } : {}),
            ...(itemCount !== undefined ? { itemCount } : {}),
          });
        }
      });
    }
  }

  const model: CanvasModel = {
    view: execution ? 'execution' : 'design',
    ...(asString(workflow['name']) !== undefined ? { name: asString(workflow['name']) as string } : {}),
    nodes,
    edges,
    stickies,
    ...(execution
      ? { execution: executionSummary(execution, nodes.some((n) => n.run?.status === 'error')) }
      : {}),
  };

  return { model, warnings, errors: [] };
}

/**
 * Detects on the keys an n8n export actually carries — a design payload has
 * `nodes` and `connections`; an execution wraps them in `workflowData`. Keying
 * on structure rather than a version field is what stops this adapter claiming
 * payloads belonging to a format added later.
 */
export const n8nAdapter: CanvasAdapter = {
  id: 'n8n',
  detects(input: unknown): boolean {
    if (!isRecord(input)) return false;
    const design = isRecord(input) && 'nodes' in input && 'connections' in input;
    const wrapped = isRecord(input['workflowData'])
      && 'nodes' in (input['workflowData'] as Record<string, unknown>);
    return design || wrapped;
  },
  parse: parseInput,
};
