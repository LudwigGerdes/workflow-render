/**
 * The inspector's contract: a node plus its description becomes a FormModel —
 * a resolved, typed tree with visibility already decided — which the element
 * renders. Keeping it pure means the whole reconstruction is unit-testable
 * without a DOM, exactly like the canvas pipeline.
 */

export type FieldKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'options'
  | 'multiOptions'
  | 'json'
  | 'resourceLocator'
  | 'collection'
  | 'fixedCollection'
  | 'credentials'
  | 'notice'
  | 'hidden'
  | 'unknown';

export type FieldValue =
  | { kind: 'text'; text: string }
  /** An n8n expression. Rendered in expression styling and never evaluated. */
  | { kind: 'expression'; text: string }
  | { kind: 'boolean'; on: boolean }
  | { kind: 'json'; text: string }
  | { kind: 'empty' };

export interface ResourceLocatorValue {
  mode: string;
  modeLabel: string;
  value: string;
}

export interface FormField {
  name: string;
  label: string;
  kind: FieldKind;
  /** Dotted path from the node's parameters root, for nested members. */
  path: string;
  hint?: string;
  value: FieldValue;
  /** True when the node never set this and the description's default is shown. */
  isDefault: boolean;
  isExpression: boolean;
  required?: boolean;
  /** For `options`: the label n8n shows for the selected value. */
  optionLabel?: string;
  children?: FormField[];
  resourceLocator?: ResourceLocatorValue;
}

export interface FormHeader {
  name: string;
  type: string;
  schemaVersion: number;
  displayName: string;
  iconKey: string;
  disabled: boolean;
}

export interface FormSettings {
  notes?: string;
  onError?: string;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  executeOnce?: boolean;
  alwaysOutputData?: boolean;
}

export interface FormModel {
  header: FormHeader;
  fields: FormField[];
  credentials: Array<{ type: string; displayName: string; name?: string }>;
  settings: FormSettings;
  /** True when no description was available; fields are then a flat key/value dump. */
  unknownType: boolean;
}

/** What `valueFor` resolves before a field is assembled. */
export interface ResolvedValue {
  value: FieldValue;
  isDefault: boolean;
  isExpression: boolean;
  optionLabel?: string;
  resourceLocator?: ResourceLocatorValue;
}
