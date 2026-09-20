import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GRID,
  LABEL_WIDTH,
  NAME_GAP,
  NODE_SIZE,
  PORT_DOT_RADIUS,
  PORT_OFFSET_Y,
  SUB_NODE_SIZE,
} from '../src/constants.js';
import { layout } from '../src/layout.js';
import { parseInput } from '../src/adapters/n8n.js';
import type { SceneGraph } from '../src/types.js';

const scene = (name: string): SceneGraph => {
  const { model } = parseInput(
    JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')),
  );
  if (!model) throw new Error('no model');
  return layout(model);
};

/** Pull the numbers out of `M sx sy C c1x c1y, c2x c2y, tx ty`. */
const numbers = (path: string): number[] =>
  (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('nodes', () => {
  it('uses JSON positions verbatim at tile size', () => {
    const s = scene('linear');
    expect(s.nodes.map((n) => [n.x, n.y, n.w, n.h])).toEqual([
      [0, 0, NODE_SIZE, NODE_SIZE],
      [224, 0, NODE_SIZE, NODE_SIZE],
      [448, 0, NODE_SIZE, NODE_SIZE],
    ]);
    expect(s.nodes[1]?.iconKey).toBe('n8n-nodes-base.httpRequest');
  });

  it('snaps drawn positions to the grid without touching the model', () => {
    // n8n's canvas draws with snap-to-grid at GRID x GRID, so an off-grid
    // stored position renders snapped. The model itself stays untouched:
    // workflow-render never rewrites a workflow.
    const { model } = parseInput(
      JSON.parse(readFileSync(new URL('./fixtures/linear.json', import.meta.url), 'utf8')),
    );
    model!.nodes[1]!.position = [220, -100];
    model!.stickies[0]!.position = [7, 7];
    const s = layout(model!);
    expect([s.nodes[1]!.x, s.nodes[1]!.y]).toEqual([224, -96]);
    const drawnSticky = s.stickies.find((sticky) => sticky.sticky.name === 'Sticky Note');
    expect([drawnSticky?.x, drawnSticky?.y]).toEqual([0, 0]); // 7 -> nearest grid
    expect(drawnSticky?.sticky.position).toEqual([7, 7]); // model untouched
    expect(model!.nodes[1]!.position).toEqual([220, -100]); // model untouched
    // `-96 % 16` is -0, which toEqual distinguishes from +0; compare loosely.
    expect(s.nodes[1]!.x % GRID === 0 && s.nodes[1]!.y % GRID === 0).toBe(true);
  });

  it('leaves already-aligned positions exactly where they are', () => {
    const s = scene('linear');
    expect(s.nodes.map((n) => [n.x, n.y])).toEqual([
      [0, 0],
      [224, 0],
      [448, 0],
    ]);
  });

  it('draws sub-nodes smaller', () => {
    const sub = scene('branching').nodes.find((n) => n.node.name === 'OpenAI Chat Model');
    expect([sub?.w, sub?.h]).toEqual([SUB_NODE_SIZE, SUB_NODE_SIZE]);
  });
});

describe('edges', () => {
  it('runs a forward edge port-to-port with a horizontal control reach', () => {
    const edge = scene('linear').edges[1];
    const [sx, sy, c1x, c1y, c2x, c2y, tx, ty] = numbers(edge?.path ?? '');
    // HTTP Request (224,0) right port → Extract Emails (448,0) left port.
    // The curve stops at the rim of the target port dot so its arrowhead shows;
    // the recorded endpoint is still the port centre.
    expect([sx, sy]).toEqual([320, 48]);
    expect([tx, ty]).toEqual([448 - PORT_DOT_RADIUS, 48]);
    expect(edge?.endpoints.target).toEqual({ x: 448, y: 48 });
    expect(c1x).toBe(320 + 64); // EDGE_CTRL(dx=128) === 64
    expect(c2x).toBe(448 - 64);
    expect([c1y, c2y]).toEqual([48, 48]);
  });

  it('spreads multiple outputs symmetrically around the tile mid', () => {
    const ifEdges = scene('branching').edges.filter((e) => e.edge.from === 'Valid?');
    const ys = ifEdges.map((e) => numbers(e.path)[1] as number);
    expect(ys[1]! - ys[0]!).toBe(PORT_OFFSET_Y);
    expect((ys[0]! + ys[1]!) / 2).toBe(0 + NODE_SIZE / 2); // Valid? sits at y=0
  });

  it('spreads multiple inputs symmetrically too', () => {
    const intoMerge = scene('branching').edges.filter((e) => e.edge.to === 'Merge' && e.edge.kind === 'main');
    const targetYs = intoMerge.map((e) => e.endpoints.target.y);
    expect(new Set(targetYs).size).toBeGreaterThan(1);
    expect(Math.max(...targetYs) - Math.min(...targetYs)).toBe(PORT_OFFSET_Y);
  });

  it('routes a backwards edge below both nodes', () => {
    // Asserted on the drawn path rather than on control-point indices: those
    // only mean anything while the connector is a cubic, and a backwards edge
    // is now routed orthogonally.
    const s = scene('branching');
    const loop = s.edges.find((e) => e.edge.from === 'Route' && e.edge.to === 'Merge');
    const ys = [...(loop?.path ?? '').matchAll(/-?[\d.]+ (-?[\d.]+)/g)].map((m) => Number(m[1]));
    const bottom = (name: string): number => {
      const n = s.nodes.find((x) => x.node.name === name);
      return (n?.y ?? 0) + (n?.h ?? 0);
    };
    // the run home passes under both tiles
    expect(Math.max(...ys)).toBeGreaterThan(bottom('Route'));
    expect(Math.max(...ys)).toBeGreaterThan(bottom('Merge'));
    // and it is a level run, so two turns share that y
    expect(ys.filter((y) => y === Math.max(...ys)).length).toBeGreaterThanOrEqual(2);
  });

  it('runs ai edges from the sub-node top to the agent bottom', () => {
    const s = scene('branching');
    const ai = s.edges.find((e) => e.edge.from === 'OpenAI Chat Model');
    const sub = s.nodes.find((n) => n.node.name === 'OpenAI Chat Model');
    const agent = s.nodes.find((n) => n.node.name === 'AI Agent');
    const [sx, sy, , , , , tx, ty] = numbers(ai?.path ?? '');
    // Sub-node top-centre up to one of the agent's bottom-edge ai ports.
    expect([sx, sy]).toEqual([sub!.x + sub!.w / 2, sub!.y]);
    expect(ty).toBe(agent!.y + agent!.h);
    expect(Math.abs((tx as number) - (agent!.x + agent!.w / 2))).toBeLessThanOrEqual(48);
  });

  it('puts the label at the curve midpoint', () => {
    const edge = scene('linear').edges[1];
    const [sx, sy, c1x, c1y, c2x, c2y, tx, ty] = numbers(edge?.path ?? '') as number[];
    expect(edge?.labelAt?.x).toBeCloseTo((sx! + 3 * c1x! + 3 * c2x! + tx!) / 8, 6);
    expect(edge?.labelAt?.y).toBeCloseTo((sy! + 3 * c1y! + 3 * c2y! + ty!) / 8, 6);
    expect(edge?.labelAt?.x).toBeCloseTo(383, 6); // middle of the drawn run
  });
});

describe('stickies and bounds', () => {
  it('orders stickies largest first so they sit furthest back', () => {
    const model = parseInput(
      JSON.parse(readFileSync(new URL('./fixtures/linear.json', import.meta.url), 'utf8')),
    ).model!;
    model.stickies.push({ name: 'small', content: '', color: 1, position: [0, 0], width: 100, height: 100 });
    const zs = layout(model).stickies;
    expect(zs.map((s) => s.sticky.name)).toEqual(['Sticky Note', 'small']);
    expect(zs[0]!.z).toBeLessThan(zs[1]!.z);
  });

  it('leaves room for the node name box so long names are never clipped', () => {
    const s = scene('linear');
    const firstNode = s.nodes[0]!;
    // the label box is twice the tile width, centred on it
    expect(s.bounds.x).toBeLessThanOrEqual(firstNode.x - (LABEL_WIDTH - firstNode.w) / 2);
    const lastNode = s.nodes[s.nodes.length - 1]!;
    expect(s.bounds.x + s.bounds.width).toBeGreaterThanOrEqual(
      lastNode.x + lastNode.w + (LABEL_WIDTH - lastNode.w) / 2,
    );
    // and vertical room below the tile for the wrapped name
    expect(s.bounds.y + s.bounds.height).toBeGreaterThan(lastNode.y + lastNode.h + NAME_GAP);
  });

  it('encloses every tile and sticky with grid padding', () => {
    const s = scene('linear');
    // sticky at (0,-192) 304x144, nodes out to (448,0)+96
    expect(s.bounds.y).toBe(-192 - GRID * 2);
    expect(s.bounds.x).toBeLessThanOrEqual(0 - GRID * 2);
    expect(s.bounds.x + s.bounds.width).toBeGreaterThanOrEqual(544 + GRID * 2);
  });

  it('carries view and execution summary through', () => {
    const s = scene('execution-success');
    expect(s.view).toBe('execution');
    expect(s.execution?.status).toBe('success');
  });
});
