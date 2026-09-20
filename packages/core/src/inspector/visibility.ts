/**
 * Whether the NDV would show a property.
 *
 * n8n's own `displayParameter` is the authority on these rules, but its import
 * graph is ~395 KB gzipped and reaches Node built-ins, so it cannot ship in a
 * browser bundle whose whole budget is 300 KB. This is an independent
 * implementation of the `displayOptions` **data format** — not a port of n8n's
 * code — and `test/inspector/conformance.test.ts` proves it agrees with
 * `displayParameter` across every property of all 544 bundled node types.
 * If the two ever diverge, that test fails; correctness is enforced by
 * measurement rather than by shipping the dependency.
 *
 * The format, as observed across the corpus:
 *   displayOptions: { show?: Clause, hide?: Clause }
 *   Clause: { [key]: Array<scalar | { _cnd: Condition }> }
 *   key: a sibling parameter, '@version', '@tool', or a '/'-prefixed dotted
 *        path resolved against the *root* node parameters — which is how a
 *        nested collection member depends on a top-level field.
 *   Condition: one of gte, gt, lte, lt, eq, not, exists, between, regex, includes
 */
import type { TrimmedDescription } from 'workflow-render-assets';
import type { CanvasNode } from '../types.js';

type Property = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Evaluate one `{ _cnd: … }` condition against the parameter's actual value. */
function condition(actual: unknown, cnd: Record<string, unknown>): boolean {
  if ('exists' in cnd) {
    // An empty string does not count as existing: n8n hides a field whose
    // driving parameter is present but blank.
    const present = actual !== undefined && actual !== null && actual !== '';
    return present === (cnd['exists'] !== false);
  }
  if ('eq' in cnd) return actual === cnd['eq'];
  if ('not' in cnd) return actual !== cnd['not'];

  if ('regex' in cnd) {
    if (typeof actual !== 'string' || typeof cnd['regex'] !== 'string') return false;
    try {
      return new RegExp(cnd['regex']).test(actual);
    } catch {
      return false; // a malformed pattern must not take the renderer down
    }
  }

  if ('includes' in cnd) {
    if (typeof actual === 'string' && typeof cnd['includes'] === 'string') {
      return actual.includes(cnd['includes']);
    }
    return Array.isArray(actual) ? actual.includes(cnd['includes']) : false;
  }

  const value = asNumber(actual);
  if ('between' in cnd) {
    const range = cnd['between'];
    if (value === undefined || !isRecord(range)) return false;
    const from = asNumber(range['from']);
    const to = asNumber(range['to']);
    return from !== undefined && to !== undefined && value >= from && value <= to;
  }

  if (value === undefined) return false;
  for (const [op, operand] of Object.entries(cnd)) {
    const limit = asNumber(operand);
    if (limit === undefined) return false;
    if (op === 'gte' && !(value >= limit)) return false;
    if (op === 'gt' && !(value > limit)) return false;
    if (op === 'lte' && !(value <= limit)) return false;
    if (op === 'lt' && !(value < limit)) return false;
  }
  return true;
}

/** Does the actual value satisfy one entry of a clause's expected list? */
function matches(actual: unknown, expected: unknown): boolean {
  if (isRecord(expected) && isRecord(expected['_cnd'])) {
    return condition(actual, expected['_cnd']);
  }
  // multiOptions hold arrays; n8n treats the clause as satisfied by membership.
  if (Array.isArray(actual)) return actual.includes(expected);
  return actual === expected;
}

/** Walk a dotted path, e.g. `options.group.values.method`. */
function atPath(source: Record<string, unknown>, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

/** The value a clause key refers to: a parameter, a root path, or a pseudo-key. */
function valueForKey(
  key: string,
  node: CanvasNode,
  parameters: Record<string, unknown>,
  root: Record<string, unknown>,
): unknown {
  if (key === '@version') return node.schemaVersion;
  // A read-only canvas never renders a node in its "used as tool" form.
  if (key === '@tool') return false;
  // A leading '/' escapes the local scope and reads from the node's root.
  if (key.startsWith('/')) return atPath(root, key.slice(1));
  return parameters[key];
}

function clauseHolds(
  clause: Record<string, unknown>,
  node: CanvasNode,
  parameters: Record<string, unknown>,
  root: Record<string, unknown>,
  everyKey: boolean,
): boolean {
  const entries = Object.entries(clause);
  const test = (entry: [string, unknown]): boolean => {
    const [key, expected] = entry;
    const actual = valueForKey(key, node, parameters, root);
    const options = Array.isArray(expected) ? expected : [expected];
    return options.some((option) => matches(actual, option));
  };
  return everyKey ? entries.every(test) : entries.some(test);
}

export function isVisible(
  property: Property,
  node: CanvasNode,
  _description?: TrimmedDescription,
  parameters: Record<string, unknown> = node.parameters,
  root: Record<string, unknown> = node.parameters,
): boolean {
  const rules = property['displayOptions'];
  if (!isRecord(rules)) return true;

  const show = rules['show'];
  if (isRecord(show) && !clauseHolds(show, node, parameters, root, true)) return false;

  const hide = rules['hide'];
  if (isRecord(hide) && clauseHolds(hide, node, parameters, root, false)) return false;

  return true;
}
