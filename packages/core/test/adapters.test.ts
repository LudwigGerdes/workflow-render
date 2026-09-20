import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adapterFor, n8nAdapter } from '../src/adapters/index.js';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

describe('adapter registry', () => {
  it('recognises an n8n workflow', () => {
    expect(adapterFor(fixture('linear'))?.id).toBe('n8n');
  });

  it('recognises an n8n execution', () => {
    expect(adapterFor(fixture('execution-success'))?.id).toBe('n8n');
  });

  it('recognises nothing in a payload from no tool it knows', () => {
    expect(adapterFor({ some: 'other tool' })).toBeUndefined();
  });

  it('survives input that is not an object at all', () => {
    for (const junk of [null, undefined, 42, 'nodes', []]) {
      expect(adapterFor(junk)).toBeUndefined();
    }
  });
});

describe('the n8n adapter', () => {
  it('detects on structure rather than a version field', () => {
    // The guarantee that matters when a second adapter arrives: this one must
    // not claim payloads that are not its own.
    expect(n8nAdapter.detects({ nodes: [], connections: {} })).toBe(true);
    expect(n8nAdapter.detects({ nodes: [] })).toBe(false);
  });

  it('detects the execution envelope too', () => {
    expect(n8nAdapter.detects({ workflowData: { nodes: [], connections: {} }, runData: {} })).toBe(
      true,
    );
  });

  it('parses through to a model, unchanged from before the move', () => {
    const { model } = n8nAdapter.parse(fixture('linear'));
    expect(model?.nodes.length).toBeGreaterThan(0);
  });
});

describe('the source payload', () => {
  it('keeps each node exactly as the payload contained it', () => {
    // The inspector's JSON tab exists so a reader can take the node away and
    // paste it back into n8n. The model is not that: it renames typeVersion to
    // schemaVersion and adds fields of its own (kind, run). So the adapter
    // keeps the original alongside it.
    const { model } = n8nAdapter.parse(fixture('linear'));
    const node = model?.nodes.find((n) => n.schemaVersion !== undefined);
    const source = node?.source as Record<string, unknown> | undefined;
    expect(source).toBeDefined();
    expect(source).toHaveProperty('typeVersion');
    expect(source).not.toHaveProperty('schemaVersion');
    expect(source).not.toHaveProperty('kind');
  });
});
