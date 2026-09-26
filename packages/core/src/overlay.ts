/**
 * The canvas overlay: annotations another tool lays over a workflow.
 *
 * workflow-lint emits one per run (`--format canvas-overlay`); anything that
 * knows a workflow's node names can. The shape is deliberately small — a
 * badge list and a tint per node, a label and a tint per edge — so a linter,
 * a request recorder and a test runner can all speak it without agreeing on
 * anything else. `source` says which tool wrote it.
 */

export type OverlayBadgeKind = 'error' | 'warn' | 'info';

export interface OverlayBadge {
  kind: OverlayBadgeKind;
  text: string;
}

export interface OverlayNode {
  badges?: OverlayBadge[];
  /** `#rgb` or `#rrggbb`. Colours the ring around the node. */
  tint?: string;
}

export interface OverlayEdge {
  label?: string;
  /** `#rgb` or `#rrggbb`. Colours the connector. */
  tint?: string;
}

export interface CanvasOverlay {
  version: 1;
  /** The tool that produced it, e.g. `workflow-lint 0.1.2`. */
  source?: string;
  /** Keyed by node name. */
  nodes: Record<string, OverlayNode>;
  /** Keyed by `<from node name>-><to node name>`. */
  edges: Record<string, OverlayEdge>;
}

/** `from->to`, the key an edge annotation is looked up under. */
export const edgeKey = (from: string, to: string): string => `${from}->${to}`;

const KINDS: readonly OverlayBadgeKind[] = ['error', 'warn', 'info'];
const RANK: Record<OverlayBadgeKind, number> = { error: 0, warn: 1, info: 2 };
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** The gravest kind among a node's badges. */
export function worstKind(badges: OverlayBadge[]): OverlayBadgeKind | undefined {
  return [...badges].sort((a, b) => RANK[a.kind] - RANK[b.kind])[0]?.kind;
}

/**
 * Validate an overlay. Every problem is reported, with its path, and nothing
 * is rendered from an overlay with a problem: a tint that is not a colour or a
 * badge kind that is not one of the three is a producer bug worth surfacing,
 * not something to draw a guess for.
 */
export function parseOverlay(raw: unknown): { overlay?: CanvasOverlay; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(raw)) return { errors: ['overlay: expected an object'] };
  if (raw['version'] !== 1) errors.push(`overlay.version: expected 1, got ${JSON.stringify(raw['version'])}`);
  if (raw['source'] !== undefined && typeof raw['source'] !== 'string') errors.push('overlay.source: expected a string');

  const nodes: Record<string, OverlayNode> = {};
  const rawNodes = raw['nodes'];
  if (!isRecord(rawNodes)) {
    errors.push('overlay.nodes: expected an object keyed by node name');
  } else {
    for (const [name, entry] of Object.entries(rawNodes)) {
      if (!isRecord(entry)) {
        errors.push(`overlay.nodes["${name}"]: expected an object`);
        continue;
      }
      const node: OverlayNode = {};
      if (entry['badges'] !== undefined) {
        if (!Array.isArray(entry['badges'])) {
          errors.push(`overlay.nodes["${name}"].badges: expected a list`);
        } else {
          node.badges = [];
          entry['badges'].forEach((badge: unknown, i) => {
            if (!isRecord(badge) || !KINDS.includes(badge['kind'] as OverlayBadgeKind) || typeof badge['text'] !== 'string') {
              errors.push(`overlay.nodes["${name}"].badges[${i}]: expected { kind: error | warn | info, text }`);
              return;
            }
            node.badges!.push({ kind: badge['kind'] as OverlayBadgeKind, text: badge['text'] });
          });
        }
      }
      if (entry['tint'] !== undefined) {
        if (typeof entry['tint'] !== 'string' || !HEX.test(entry['tint'])) {
          errors.push(`overlay.nodes["${name}"].tint: expected a #rgb or #rrggbb colour`);
        } else {
          node.tint = entry['tint'];
        }
      }
      nodes[name] = node;
    }
  }

  const edges: Record<string, OverlayEdge> = {};
  const rawEdges = raw['edges'];
  if (rawEdges === undefined) {
    // Producers that annotate nodes only may leave it out.
  } else if (!isRecord(rawEdges)) {
    errors.push('overlay.edges: expected an object keyed by "from->to"');
  } else {
    for (const [key, entry] of Object.entries(rawEdges)) {
      if (!isRecord(entry)) {
        errors.push(`overlay.edges["${key}"]: expected an object`);
        continue;
      }
      if (!key.includes('->')) errors.push(`overlay.edges["${key}"]: the key must be "<from>-><to>"`);
      const edge: OverlayEdge = {};
      if (entry['label'] !== undefined) {
        if (typeof entry['label'] !== 'string') errors.push(`overlay.edges["${key}"].label: expected a string`);
        else edge.label = entry['label'];
      }
      if (entry['tint'] !== undefined) {
        if (typeof entry['tint'] !== 'string' || !HEX.test(entry['tint'])) {
          errors.push(`overlay.edges["${key}"].tint: expected a #rgb or #rrggbb colour`);
        } else {
          edge.tint = entry['tint'];
        }
      }
      edges[key] = edge;
    }
  }

  if (errors.length > 0) return { errors };
  return {
    overlay: {
      version: 1,
      ...(typeof raw['source'] === 'string' ? { source: raw['source'] } : {}),
      nodes,
      edges,
    },
    errors,
  };
}
