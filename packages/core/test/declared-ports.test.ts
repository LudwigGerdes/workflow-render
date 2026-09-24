import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NODE_SIZE, PORT_OFFSET_Y } from '../src/constants.js';
import { layout } from '../src/layout.js';
import { parseInput } from '../src/adapters/n8n.js';
import { renderSVG } from '../src/render.js';

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const model = (name: string) => {
  const { model } = parseInput(load(name));
  if (!model) throw new Error('no model');
  return model;
};

/**
 * n8n draws every output a node type declares, wired or not: a Loop Over Items
 * with nothing on `done` still shows two labelled ports, and the `loop`
 * connector leaves from the lower one. Ports used to exist only where an edge
 * ended, so that node rendered as a single centred port with no labels.
 */
describe('declared outputs', () => {
  it('the adapter lists the fixed outputs of Loop, IF and Switch by label', () => {
    const nodes = new Map(model('loop-done-unwired').nodes.map((n) => [n.name, n]));
    expect(nodes.get('Loop Over Items')?.outputs).toEqual(['done', 'loop']);
    expect(nodes.get('Replace Me')?.outputs).toEqual([undefined]);
    const branching = new Map(model('branching').nodes.map((n) => [n.name, n]));
    const ifNode = [...branching.values()].find((n) => n.type === 'n8n-nodes-base.if');
    expect(ifNode?.outputs).toEqual(['true', 'false']);
  });

  it('layout gives an unwired declared output its own port slot', () => {
    const s = layout(model('loop-done-unwired'));
    const loop = s.nodes.find((n) => n.node.name === 'Loop Over Items')!;
    const ports = s.ports.filter((p) => p.node === 'Loop Over Items' && p.side === 'output');
    expect(ports.map((p) => p.label)).toEqual(['done', 'loop']);
    // Two outputs, 32px apart, centred on the tile: n8n's IF geometry.
    expect(ports[1]!.at.y - ports[0]!.at.y).toBe(PORT_OFFSET_Y);
    expect((ports[0]!.at.y + ports[1]!.at.y) / 2).toBeCloseTo(loop.y + loop.h / 2, 6);
    expect(loop.h).toBe(NODE_SIZE);
    // The one wired edge leaves from the `loop` slot, not from the tile's centre.
    const edge = s.edges.find((e) => e.edge.from === 'Loop Over Items')!;
    expect(edge.endpoints.source.y).toBeCloseTo(ports[1]!.at.y, 6);
  });

  it('a node with one unlabelled output still has one centred port', () => {
    const s = layout(model('loop-done-unwired'));
    const tile = s.nodes.find((n) => n.node.name === 'Replace Me')!;
    const ports = s.ports.filter((p) => p.node === 'Replace Me');
    expect(ports.map((p) => p.side).sort()).toEqual(['input', 'output']);
    const out = ports.find((p) => p.side === 'output')!;
    expect(out.at.y).toBeCloseTo(tile.y + tile.h / 2, 6);
    expect(out.label).toBeUndefined();
  });

  it('renders the unwired port and both labels', () => {
    const svg = renderSVG(layout(model('loop-done-unwired')));
    expect(svg).toContain('>done<');
    expect(svg).toContain('>loop<');
    // Two output dots on the Loop tile plus its input dot: three ports on that node.
    const loopPorts = (svg.match(/class="wr-port"[^>]*data-node="Loop Over Items"/g) ?? []).length;
    expect(loopPorts).toBe(3);
  });

  it('a wired IF still shows true and false once each', () => {
    const svg = renderSVG(layout(model('branching')));
    expect((svg.match(/>true</g) ?? []).length).toBe(1);
    expect((svg.match(/>false</g) ?? []).length).toBe(1);
  });
});
