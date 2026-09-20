/**
 * Reconstructing the NDV's parameters pane as a pure model.
 *
 * The order is the description's own; visibility is n8n's own; the values are
 * whatever the workflow set, or the description's default shown muted. What we
 * cannot reconstruct faithfully we say so about, rather than approximating: an
 * unknown node type falls back to a flat key/value dump.
 */
import type { TrimmedDescription } from 'workflow-render-assets';
import type { CanvasNode } from '../types.js';
import type { FieldKind, FormField, FormModel, FormSettings } from './form-model.js';
import { isEmptyContainer, valueFor } from './values.js';
import { isVisible } from './visibility.js';

type Property = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** n8n property types we render distinctly; anything else renders generically. */
const KINDS: Record<string, FieldKind> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  options: 'options',
  multiOptions: 'multiOptions',
  json: 'json',
  resourceLocator: 'resourceLocator',
  collection: 'collection',
  fixedCollection: 'fixedCollection',
  credentialsSelect: 'credentials',
  notice: 'notice',
  hidden: 'hidden',
};

const kindOf = (property: Property): FieldKind =>
  KINDS[String(property['type'])] ?? 'unknown';

/**
 * Members of a collection that the workflow actually set. n8n only shows the
 * options a user added, not every option the type offers.
 */
function childrenOf(property: Property, value: unknown, path: string): FormField[] | undefined {
  if (!isRecord(value)) return undefined;
  const members = Array.isArray(property['options'])
    ? (property['options'] as Property[])
    : Array.isArray(property['values'])
      ? (property['values'] as Property[])
      : [];
  if (members.length === 0) return undefined;

  const children = members
    .filter((member) => typeof member['name'] === 'string' && value[member['name'] as string] !== undefined)
    .map((member) => {
      const name = member['name'] as string;
      const resolved = valueFor(member, value);
      return {
        name,
        label: typeof member['displayName'] === 'string' ? member['displayName'] : name,
        kind: kindOf(member),
        path: `${path}.${name}`,
        ...resolved,
      } satisfies FormField;
    });

  return children.length > 0 ? children : undefined;
}

/** Credentials the type declares, filtered by their own displayOptions. */
function credentialsOf(
  node: CanvasNode,
  description: TrimmedDescription,
): FormModel['credentials'] {
  return (description.credentials ?? [])
    .filter((credential) => {
      const rule = (credential as unknown as Property)['displayOptions'];
      if (!rule) return true;
      return isVisible(credential as unknown as Property, node, description);
    })
    .map((credential) => ({
      type: credential.name,
      displayName: credential.displayName ?? credential.name,
    }));
}

function settingsOf(node: CanvasNode): FormSettings {
  return {
    ...(node.notes !== undefined ? { notes: node.notes } : {}),
    ...(node.settings ?? {}),
  };
}

/** A node whose type we do not know still deserves its parameters shown. */
function unknownModel(node: CanvasNode): FormModel {
  const fields: FormField[] = Object.entries(node.parameters).map(([name, value]) => ({
    name,
    label: humanise(name),
    kind: 'unknown',
    path: name,
    ...valueFor({ name, type: 'unknown' }, node.parameters),
    value:
      isRecord(value) || Array.isArray(value)
        ? isEmptyContainer(value)
          ? { kind: 'empty' }
          : { kind: 'json', text: JSON.stringify(value, null, 2) }
        : valueFor({ name, type: 'unknown' }, node.parameters).value,
  }));

  return {
    header: {
      name: node.name,
      type: node.type,
      schemaVersion: node.schemaVersion,
      displayName: node.type,
      iconKey: node.type,
      disabled: node.disabled === true,
    },
    fields,
    credentials: [],
    settings: settingsOf(node),
    unknownType: true,
  };
}

/** Initialisms that read wrong in Title Case. */
const ACRONYMS = new Set([
  'api', 'css', 'csv', 'db', 'ftp', 'html', 'http', 'https', 'id', 'imap', 'ip',
  'json', 'jwt', 'pdf', 'png', 'rss', 'smtp', 'sql', 'ssl', 'svg', 'tls', 'ui',
  'uri', 'url', 'uuid', 'xml',
]);

/**
 * A parameter key read as a label: `sendQueryParameters` becomes
 * `Send Query Parameters`.
 *
 * Only for node types the bundle has never seen, where there is no display name
 * to use. Whatever n8n ships next will land here, and a panel full of raw keys
 * reads as a dump rather than as a node.
 */
export function humanise(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      ACRONYMS.has(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

export function buildFormModel(node: CanvasNode, description?: TrimmedDescription): FormModel {
  if (!description) return unknownModel(node);

  const fields: FormField[] = [];
  for (const raw of (description.properties ?? []) as Property[]) {
    const kind = kindOf(raw);
    if (kind === 'hidden') continue;
    // A property with no displayName is chrome, not a field: n8n renders
    // curlImport as an import button, for instance, never as a labelled row.
    if (typeof raw['displayName'] !== 'string' || raw['displayName'] === '') continue;
    if (!isVisible(raw, node, description)) continue;

    const name = typeof raw['name'] === 'string' ? raw['name'] : '';
    const resolved = valueFor(raw, node.parameters);
    const children = childrenOf(raw, node.parameters[name], name);

    fields.push({
      name,
      label: raw['displayName'],
      kind,
      path: name,
      ...resolved,
      ...(children ? { children } : {}),
      ...(raw['required'] === true ? { required: true } : {}),
    });
  }

  return {
    header: {
      name: node.name,
      type: node.type,
      schemaVersion: node.schemaVersion,
      displayName: description.displayName,
      iconKey: node.type,
      disabled: node.disabled === true,
    },
    fields,
    credentials: credentialsOf(node, description),
    settings: settingsOf(node),
    unknownType: false,
  };
}
