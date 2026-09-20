/**
 * Connector routing.
 *
 * Measured 2026-09-13 against a real n8n 2.38.3, by laying out a workflow with
 * one level edge, one dropping 260px, one rising 260px and one running
 * backwards, then looking at what n8n drew: **every forward edge is a curve,
 * however far it drops.** Only a backwards edge squares off.
 *
 * This file previously asserted the opposite -- that a forward edge changing
 * row steps orthogonally -- on the strength of a guessed 8px threshold. That
 * turned nearly every connector in a real workflow into a rectangle, because
 * real nodes rarely sit on exactly the same y.
 */
import { describe, expect, it } from 'vitest';
import { layout } from '../src/layout.js';
import { parseInput } from '../src/adapters/n8n.js';

const pathsFor = (nodes: Array<[string, number, number]>, connections: Record<string, unknown>) => {
  const { model } = parseInput({
    nodes: nodes.map(([name, x, y]) => ({
      name, type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [x, y], parameters: {},
    })),
    connections,
  });
  if (!model) throw new Error('no model');
  return layout(model).edges.map((e) => e.path);
};

const wire = (from: string, to: string) => ({
  [from]: { main: [[{ node: to, type: 'main', index: 0 }]] },
});

describe('connector routing', () => {
  it('keeps a gentle curve when the ports line up', () => {
    const [path] = pathsFor([['A', 0, 0], ['B', 320, 0]], wire('A', 'B'));
    expect(path).toContain('C'); // a single cubic
    expect(path).not.toContain('Q');
  });

  it('keeps a forward connector curved however far the target drops', () => {
    const [path] = pathsFor([['A', 0, 0], ['B', 320, 240]], wire('A', 'B'));
    expect(path).toMatch(/\bC\b/);
    expect(path).not.toContain('Q');
  });

  it('keeps a forward connector curved when the target rises instead', () => {
    const [path] = pathsFor([['A', 0, 240], ['B', 320, 0]], wire('A', 'B'));
    expect(path).toMatch(/\bC\b/);
    expect(path).not.toContain('Q');
  });

  it('squares off a target sitting directly below, where a curve would loop', () => {
    // Straight down is not "forward": the target's input port is behind the
    // source's output, so this takes the backwards route, as n8n's does.
    const [path] = pathsFor([['A', 0, 0], ['B', 0, 240]], wire('A', 'B'));
    expect(path).toContain('Q');
    expect(path).not.toMatch(/\bC\b/);
  });

  it('routes a backwards edge orthogonally, with rounded corners', () => {
    // A Route -> Merge loopback is the shape n8n squares off most visibly, and
    // it was the one case left as a bezier: `stepped` was only ever set on the
    // forward branch, so the connector that prompted the work kept swooping.
    const [path] = pathsFor([['A', 320, 0], ['B', 0, 0]], wire('A', 'B'));
    expect(path).toContain('Q'); // rounded turns
    expect(path).not.toMatch(/\bC\b/); // and no cubic anywhere
  });

  it('drops a backwards edge below both nodes rather than through them', () => {
    const [path] = pathsFor([['A', 320, 0], ['B', 0, 0]], wire('A', 'B'));
    const ys = [...path.matchAll(/-?[\d.]+ (-?[\d.]+)/g)].map((m) => Number(m[1]));
    // the run home passes under the tiles, not across them
    expect(Math.max(...ys)).toBeGreaterThan(96);
  });
});
