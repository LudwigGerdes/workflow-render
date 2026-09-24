/**
 * Geometry: everything positional that is not in the workflow JSON.
 *
 * Node positions are used verbatim — workflow-render never re-lays-out a workflow.
 * What is computed here is ports, connector curves, label anchors, sticky
 * z-order and the viewport bounds.
 */
import {
  CONFIGURABLE_NODE_WIDTH,
  EDGE_BACK_STUB,
  EDGE_CORNER_RADIUS,
  EDGE_CTRL,
  GRID,
  LABEL_LINE_HEIGHT,
  LABEL_WIDTH,
  NAME_GAP,
  PORT_DOT_RADIUS,
  SUBTITLE_GAP,
  SUBTITLE_LINE_HEIGHT,
  LOOPBACK_DROP,
  NODE_SIZE,
  PORT_OFFSET_Y,
  SUB_NODE_SIZE,
  nodeHeight,
} from './constants.js';
import { num } from './svg.js';
import { wrapLabel } from './text.js';
import type { CanvasEdge, CanvasModel, SceneEdgePath, SceneGraph, SceneNode, ScenePort } from './types.js';

/** Horizontal spacing of the ai_* ports along an agent's bottom edge. */
const AI_PORT_SPACING = 48; // measured: branching/canvas-light.png

interface Point {
  x: number;
  y: number;
}

/**
 * n8n's canvas draws with snap-to-grid, so a node stored off-grid appears on the
 * nearest grid intersection. We snap at draw time for the same reason: the
 * CanvasModel keeps the workflow's own coordinates untouched — workflow-render never
 * rewrites a workflow — while the scene matches what n8n shows.
 */
const snap = (value: number): number => {
  const snapped = Math.round(value / GRID) * GRID;
  return Object.is(snapped, -0) ? 0 : snapped; // keep scene numbers canonical
};

/** Offset of port `index` when `count` ports share one side, centred on the middle. */
function portShift(index: number, count: number): number {
  return (index - (count - 1) / 2) * PORT_OFFSET_Y;
}

/**
 * A connector that has to double back, routed the way n8n draws it: straight out
 * of the source, down past whichever tile hangs lower, home underneath, then up
 * and into the target. Four square turns, each rounded.
 *
 * This is the Route -> Merge shape, and the only shape n8n squares off. A
 * forward connector stays a curve however far it drops.
 */
function orthogonalBack(p0: Point, p3: Point, under: number, stub: number, radius: number): string {
  const outX = p0.x + stub;
  const inX = p3.x - stub;
  // Never round more than the shortest leg can give up, or the turns overlap.
  const r = Math.max(
    0,
    Math.min(radius, Math.abs(outX - inX) / 2, (under - p0.y) / 2, (under - p3.y) / 2),
  );
  return [
    `M ${num(p0.x)} ${num(p0.y)}`,
    `L ${num(outX - r)} ${num(p0.y)}`,
    `Q ${num(outX)} ${num(p0.y)}, ${num(outX)} ${num(p0.y + r)}`,
    `L ${num(outX)} ${num(under - r)}`,
    `Q ${num(outX)} ${num(under)}, ${num(outX - r)} ${num(under)}`,
    `L ${num(inX + r)} ${num(under)}`,
    `Q ${num(inX)} ${num(under)}, ${num(inX)} ${num(under - r)}`,
    `L ${num(inX)} ${num(p3.y + r)}`,
    `Q ${num(inX)} ${num(p3.y)}, ${num(inX + r)} ${num(p3.y)}`,
    `L ${num(p3.x)} ${num(p3.y)}`,
  ].join(' ');
}

function bezier(p0: Point, c1: Point, c2: Point, p3: Point): string {
  return `M ${num(p0.x)} ${num(p0.y)} C ${num(c1.x)} ${num(c1.y)}, ${num(c2.x)} ${num(c2.y)}, ${num(p3.x)} ${num(p3.y)}`;
}

/** Cubic bezier value at t = 0.5, the anchor for edge labels. */
function midpoint(p0: Point, c1: Point, c2: Point, p3: Point): Point {
  return {
    x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8,
    y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8,
  };
}

export function layout(model: CanvasModel): SceneGraph {
  // n8n grows a tile downwards for a third and further output, and widens a node
  // that accepts ai_* sub-nodes. Both are measured shape rules, not re-layout:
  // the node's own position is still used verbatim.
  // A tile carries every output its type declares plus any a connection uses
  // beyond those (an error output, say), so an unwired `done` still gets a port.
  const outputCount = new Map<string, number>(model.nodes.map((n) => [n.name, n.outputs.length]));
  const acceptsSubNodes = new Set<string>();
  for (const edge of model.edges) {
    if (edge.kind === 'ai') {
      acceptsSubNodes.add(edge.to);
      continue;
    }
    outputCount.set(edge.from, Math.max(outputCount.get(edge.from) ?? 0, edge.fromOutput + 1));
  }

  const nodes: SceneNode[] = model.nodes.map((node) => {
    const isSub = node.kind === 'sub';
    const w = isSub
      ? SUB_NODE_SIZE
      : acceptsSubNodes.has(node.name)
        ? CONFIGURABLE_NODE_WIDTH
        : NODE_SIZE;
    const h = isSub ? SUB_NODE_SIZE : nodeHeight(outputCount.get(node.name) ?? 1);
    return { node, x: snap(node.position[0]), y: snap(node.position[1]), w, h, iconKey: node.type };
  });
  const byName = new Map(nodes.map((scene) => [scene.node.name, scene]));

  // How many ports each side of each node actually carries, so single-port
  // nodes stay centred and multi-port nodes fan out symmetrically.
  const outputsUsed = new Map<string, Set<number>>(
    model.nodes.filter((n) => n.kind !== 'sub').map((n) => [n.name, new Set(n.outputs.keys())]),
  );
  const inputsUsed = new Map<string, Set<number>>();
  for (const edge of model.edges) {
    if (edge.kind === 'ai') continue;
    (outputsUsed.get(edge.from) ?? outputsUsed.set(edge.from, new Set()).get(edge.from)!).add(edge.fromOutput);
    (inputsUsed.get(edge.to) ?? inputsUsed.set(edge.to, new Set()).get(edge.to)!).add(edge.toInput);
  }
  const rank = (used: Map<string, Set<number>>, name: string, index: number): [number, number] => {
    const sorted = [...(used.get(name) ?? new Set([index]))].sort((a, b) => a - b);
    return [Math.max(sorted.indexOf(index), 0), sorted.length];
  };

  // ai_* inputs sit side by side along the agent's bottom edge. Order them by
  // the sub-node's own x so the fan is stable and does not cross needlessly.
  const aiInputs = new Map<string, Set<number>>();
  const aiSlot = new Map<string, number>();
  model.edges
    .filter((edge) => edge.kind === 'ai')
    .map((edge) => ({ edge, x: byName.get(edge.from)?.x ?? 0 }))
    .sort((a, b) => a.x - b.x || a.edge.from.localeCompare(b.edge.from))
    .forEach(({ edge }) => {
      const slots = aiInputs.get(edge.to) ?? aiInputs.set(edge.to, new Set()).get(edge.to)!;
      const slot = slots.size;
      slots.add(slot);
      aiSlot.set(`${edge.from}\u0000${edge.to}`, slot);
    });
  const aiOrder = (edge: CanvasEdge): number => aiSlot.get(`${edge.from}\u0000${edge.to}`) ?? 0;

  // Every port a tile shows, wired or not. Inputs exist only where wired (a
  // trigger has none); outputs come from the declared list plus what is wired.
  const ports: ScenePort[] = [];
  for (const scene of nodes) {
    if (scene.node.kind === 'sub') continue;
    const outs = [...(outputsUsed.get(scene.node.name) ?? [])].sort((a, b) => a - b);
    outs.forEach((index, i) => {
      const label = scene.node.outputs[index];
      ports.push({
        node: scene.node.name,
        side: 'output',
        index,
        at: { x: scene.x + scene.w, y: scene.y + scene.h / 2 + portShift(i, outs.length) },
        ...(label !== undefined ? { label } : {}),
      });
    });
    const ins = [...(inputsUsed.get(scene.node.name) ?? [])].sort((a, b) => a - b);
    ins.forEach((index, i) => {
      ports.push({
        node: scene.node.name,
        side: 'input',
        index,
        at: { x: scene.x, y: scene.y + scene.h / 2 + portShift(i, ins.length) },
      });
    });
  }

  const edges: SceneEdgePath[] = [];
  for (const edge of model.edges) {
    const source = byName.get(edge.from);
    const target = byName.get(edge.to);
    if (!source || !target) continue;

    let p0: Point;
    let c1: Point;
    let c2: Point;
    /** Set for a backwards edge: the y it runs home along. */
    let backUnder: number | undefined;
    let p3: Point;

    if (edge.kind === 'ai') {
      // Sub-node top-centre up to one of the agent's bottom-edge ports.
      const [aiIndex, aiCount] = rank(aiInputs, edge.to, edge.toInput === 0 ? aiOrder(edge) : edge.toInput);
      p0 = { x: source.x + source.w / 2, y: source.y };
      p3 = {
        x: target.x + target.w / 2 + (aiIndex - (aiCount - 1) / 2) * AI_PORT_SPACING,
        y: target.y + target.h,
      };
      const reach = EDGE_CTRL(p3.y - p0.y);
      c1 = { x: p0.x, y: p0.y - reach };
      c2 = { x: p3.x, y: p3.y + reach };
    } else {
      const [outIndex, outCount] = rank(outputsUsed, edge.from, edge.fromOutput);
      const [inIndex, inCount] = rank(inputsUsed, edge.to, edge.toInput);
      p0 = { x: source.x + source.w, y: source.y + source.h / 2 + portShift(outIndex, outCount) };
      p3 = { x: target.x, y: target.y + target.h / 2 + portShift(inIndex, inCount) };
      const reach = EDGE_CTRL(p3.x - p0.x);
      if (p3.x < p0.x) {
        // Backwards edge: route below whichever node hangs lower.
        backUnder = Math.max(source.y + source.h, target.y + target.h) + LOOPBACK_DROP;
        c1 = { x: p0.x + reach, y: backUnder };
        c2 = { x: p3.x - reach, y: backUnder };
      } else {
        // Forward: a curve, whatever the drop. Measured against n8n 2.38.3 --
        // it bends a connector through a 260px descent rather than squaring it.
        c1 = { x: p0.x + reach, y: p0.y };
        c2 = { x: p3.x - reach, y: p3.y };
      }
    }

    // Stop the drawn curve at the rim of the target's port dot. The dot is
    // opaque and painted over the connectors, so a path running to its centre
    // hides its own arrowhead. The endpoints stay the true port positions.
    const tip =
      edge.kind === 'ai' ? p3 : { x: p3.x - Math.sign(p3.x - c2.x || 1) * PORT_DOT_RADIUS, y: p3.y };

    edges.push({
      edge,
      path:
        backUnder !== undefined
          ? orthogonalBack(p0, tip, backUnder, EDGE_BACK_STUB, EDGE_CORNER_RADIUS)
          : bezier(p0, c1, c2, tip),
      // Sit on the path that is drawn: the long runs, not a curve's midpoint.
      labelAt:
        backUnder !== undefined
          ? { x: (p0.x + tip.x) / 2, y: backUnder }
          : midpoint(p0, c1, c2, tip),
      endpoints: { source: p0, target: p3 },
    });
  }

  // Bigger stickies sit further back so smaller ones stay readable on top.
  const stickies = [...model.stickies]
    .map((sticky, index) => ({ sticky, index }))
    .sort((a, b) =>
      b.sticky.width * b.sticky.height - a.sticky.width * a.sticky.height || a.index - b.index,
    )
    .map(({ sticky }, z) => ({ sticky, z, x: snap(sticky.position[0]), y: snap(sticky.position[1]) }));

  // A node's name is drawn in a box wider than its tile and below it, so the
  // viewport has to cover that too or long names get clipped at the edge.
  const labelBoxes = nodes.map((n) => {
    const width = Math.max(LABEL_WIDTH, n.w);
    return {
      x: n.x + n.w / 2 - width / 2,
      y: n.y + n.h,
      w: width,
      // room for the wrapped name plus a possible subtitle line
      // An executed node carries an item count beneath its subtitle, and the
      // viewport has to cover it or the bottom row is clipped.
      h:
        NAME_GAP +
        wrapLabel(n.node.name).length * LABEL_LINE_HEIGHT +
        SUBTITLE_GAP +
        SUBTITLE_LINE_HEIGHT +
        ((n.node.run?.itemsOut ?? []).some((c) => c > 0) ? SUBTITLE_GAP + SUBTITLE_LINE_HEIGHT : 0),
    };
  });

  const boxes = [
    ...nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h })),
    ...labelBoxes,
    ...stickies.map((s) => ({ x: s.x, y: s.y, w: s.sticky.width, h: s.sticky.height })),
  ];
  const pad = GRID * 2;
  const minX = boxes.length ? Math.min(...boxes.map((b) => b.x)) : 0;
  const minY = boxes.length ? Math.min(...boxes.map((b) => b.y)) : 0;
  const maxX = boxes.length ? Math.max(...boxes.map((b) => b.x + b.w)) : 0;
  const maxY = boxes.length ? Math.max(...boxes.map((b) => b.y + b.h)) : 0;

  return {
    view: model.view,
    nodes,
    edges,
    ports,
    stickies,
    bounds: {
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    },
    ...(model.execution ? { execution: model.execution } : {}),
  };
}
