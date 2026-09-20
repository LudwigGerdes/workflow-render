/**
 * Conformance: our displayOptions evaluator vs n8n's own `displayParameter`.
 *
 * We do not ship n8n-workflow — its graph is ~395 KB gzipped and reaches Node
 * built-ins, against a 300 KB browser budget — so `visibility.ts` implements the
 * displayOptions data format independently. This test is the reason that is
 * safe: it sweeps every property of all 544 bundled node types under several
 * parameter scenarios and asserts the two agree on every single decision.
 *
 * n8n-workflow is a devDependency, imported only here.
 */
import { loadDescriptions } from 'workflow-render-assets';
import { displayParameter } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { isVisible } from '../../src/inspector/visibility.js';
import type { TrimmedDescription } from 'workflow-render-assets';
import type { CanvasNode } from '../../src/types.js';

type Property = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every property in a description, including nested collection members. */
function allProperties(properties: unknown, out: Property[] = []): Property[] {
  for (const property of Array.isArray(properties) ? properties : []) {
    if (!isRecord(property)) continue;
    out.push(property);
    allProperties(property['options'], out);
    allProperties(property['values'], out);
  }
  return out;
}

/**
 * Parameter sets that exercise both branches: nothing set, everything at its
 * default, and one set per clause key driven to a value the clause names.
 */
function scenarios(properties: Property[]): Array<Record<string, unknown>> {
  const empty: Record<string, unknown> = {};
  const defaults: Record<string, unknown> = {};
  for (const property of properties) {
    const name = property['name'];
    if (typeof name === 'string' && property['default'] !== undefined) {
      defaults[name] = property['default'];
    }
  }

  const driven: Record<string, unknown> = {};
  for (const property of properties) {
    const rules = property['displayOptions'];
    if (!isRecord(rules)) continue;
    for (const clause of ['show', 'hide']) {
      const body = rules[clause];
      if (!isRecord(body)) continue;
      for (const [rawKey, expected] of Object.entries(body)) {
        if (rawKey.startsWith('@')) continue;
        // '/'-prefixed keys read from the root; drive the real field name.
        const key = rawKey.startsWith('/') ? rawKey.slice(1) : rawKey;
        if (key.includes('.')) continue; // nested paths are driven via defaults
        const first = (Array.isArray(expected) ? expected : [expected]).find(
          (value) => value === null || typeof value !== 'object',
        );
        if (first !== undefined && driven[key] === undefined) driven[key] = first;
      }
    }
  }

  return [empty, defaults, driven, { ...defaults, ...driven }];
}

describe('displayOptions conformance with n8n-workflow', () => {
  it('agrees with displayParameter on every property of every bundled node type', async () => {
    const descriptions = await loadDescriptions();
    const mismatches: string[] = [];
    let decisions = 0;

    for (const [type, entries] of Object.entries(descriptions)) {
      for (const entry of entries as TrimmedDescription[]) {
        const properties = allProperties(entry.properties);
        if (properties.length === 0) continue;

        const versions = Array.isArray(entry.version) ? entry.version : [entry.version];
        const schemaVersion = typeof versions[0] === 'number' ? (versions.at(-1) as number) : 1;

        for (const parameters of scenarios(properties)) {
          const node: CanvasNode = {
            name: 'Node',
            type,
            schemaVersion,
            position: [0, 0],
            parameters,
            kind: 'regular',
          };

          for (const property of properties) {
            if (!isRecord(property['displayOptions'])) continue;
            decisions += 1;

            const ours = isVisible(property, node, entry, parameters);
            const theirs = displayParameter(
              parameters as Parameters<typeof displayParameter>[0],
              property as unknown as Parameters<typeof displayParameter>[1],
              // n8n's own INode, so it takes n8n's field name, not the model's.
              { typeVersion: schemaVersion } as Parameters<typeof displayParameter>[2],
              entry as unknown as Parameters<typeof displayParameter>[3],
            );

            if (ours !== theirs && mismatches.length < 12) {
              mismatches.push(
                `${type}@${schemaVersion} .${String(property['name'])} ours=${ours} n8n=${theirs} ` +
                  `rules=${JSON.stringify(property['displayOptions'])} params=${JSON.stringify(parameters).slice(0, 160)}`,
              );
            }
          }
        }
      }
    }

    expect(decisions).toBeGreaterThan(10000); // the sweep must actually be broad
    expect(mismatches, `${mismatches.length} disagreements:\n${mismatches.join('\n')}`).toEqual([]);
  });
});
