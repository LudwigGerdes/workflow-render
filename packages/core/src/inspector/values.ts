/**
 * Turning a description property plus the node's parameters into a displayable
 * value.
 *
 * Two rules carry most of the fidelity here. n8n shows the *label* of a selected
 * option, not its stored value; and it shows the description's default, muted,
 * for anything the workflow never set — so "not set" and "set to the default"
 * look different. Expressions are detected and marked, never evaluated.
 */
import type { TrimmedDescription } from 'workflow-render-assets';
import type { FieldValue, ResolvedValue } from './form-model.js';

type Property = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Pick the description entry whose version range covers this node. */
export function selectDescription(
  entries: TrimmedDescription[],
  schemaVersion: number,
): TrimmedDescription | undefined {
  if (entries.length === 0) return undefined;
  const covers = entries.find((entry) =>
    Array.isArray(entry.version) ? entry.version.includes(schemaVersion) : entry.version === schemaVersion,
  );
  if (covers) return covers;

  // An unknown version still deserves a form: use the newest entry we have.
  const newest = (entry: TrimmedDescription): number => {
    const version = Array.isArray(entry.version) ? Math.max(...entry.version) : entry.version;
    return typeof version === 'number' ? version : 0;
  };
  return [...entries].sort((a, b) => newest(b) - newest(a))[0];
}

/** The label n8n shows for a selected option value. */
function optionLabelFor(property: Property, value: unknown): string | undefined {
  const options = property['options'];
  if (!Array.isArray(options)) return undefined;
  const hit = options.find((option) => isRecord(option) && option['value'] === value);
  return isRecord(hit) && typeof hit['name'] === 'string' ? hit['name'] : undefined;
}

/** A resourceLocator carries its own mode; the label comes from the property. */
function resourceLocatorFor(property: Property, value: Record<string, unknown>): ResolvedValue {
  const mode = typeof value['mode'] === 'string' ? value['mode'] : '';
  const modes = Array.isArray(property['modes']) ? property['modes'] : [];
  const match = modes.find((entry) => isRecord(entry) && entry['name'] === mode);
  const modeLabel =
    isRecord(match) && typeof match['displayName'] === 'string' ? match['displayName'] : mode;
  const raw = value['value'];
  const text = typeof raw === 'string' ? raw : raw === undefined ? '' : JSON.stringify(raw);

  return {
    value: text === '' ? { kind: 'empty' } : { kind: 'text', text },
    isDefault: false,
    isExpression: typeof raw === 'string' && raw.startsWith('='),
    resourceLocator: { mode, modeLabel, value: text },
  };
}

function describeValue(value: unknown): FieldValue {
  if (typeof value === 'string') {
    return value === '' ? { kind: 'empty' } : { kind: 'text', text: value };
  }
  if (typeof value === 'boolean') return { kind: 'boolean', on: value };
  if (typeof value === 'number') return { kind: 'text', text: String(value) };
  if (value === null || value === undefined) return { kind: 'empty' };
  // `{}` and `[]` in a code block say nothing; they read as an unset field.
  if (isEmptyContainer(value)) return { kind: 'empty' };
  return { kind: 'json', text: JSON.stringify(value, null, 2) };
}

/** An object or array with nothing in it. Shared with the unknown-type dump. */
export function isEmptyContainer(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === 'object' && value !== null && Object.keys(value).length === 0;
}

/** Resolve what the inspector should show for one property. */
export function valueFor(property: Property, parameters: Record<string, unknown>): ResolvedValue {
  const name = typeof property['name'] === 'string' ? property['name'] : '';
  const set = parameters[name];
  const isDefault = set === undefined;
  const effective = isDefault ? property['default'] : set;

  if (isRecord(effective) && effective['__rl'] === true) {
    return { ...resourceLocatorFor(property, effective), isDefault };
  }

  if (typeof effective === 'string' && effective.startsWith('=')) {
    // n8n stores expressions with a leading '='; it is not part of the text.
    return { value: { kind: 'expression', text: effective.slice(1) }, isDefault, isExpression: true };
  }

  const resolved: ResolvedValue = {
    value: describeValue(effective),
    isDefault,
    isExpression: false,
  };

  if (property['type'] === 'options' || property['type'] === 'multiOptions') {
    const label = optionLabelFor(property, effective);
    if (label !== undefined) resolved.optionLabel = label;
  }

  return resolved;
}
