/**
 * A minimal, deterministic SVG serialiser. No DOM.
 *
 * Determinism rules: attributes are emitted in sorted key order and numbers are
 * rounded to two decimals, so the same scene always produces the same bytes.
 */

/** Round to two decimals and print without trailing zeros. */
export function num(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Escape text and attribute content for XML. */
export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type Attrs = Record<string, string | number | boolean | undefined>;

/** Serialise attributes in sorted key order, each with a leading space. */
export function attrString(attrs: Attrs): string {
  return Object.keys(attrs)
    .sort()
    .flatMap((key) => {
      const value = attrs[key];
      if (value === undefined || value === false || value === null) return [];
      const printed = typeof value === 'number' ? num(value) : value === true ? '' : esc(value);
      return [` ${key}="${printed}"`];
    })
    .join('');
}

/** Serialise one element. Children are already-serialised markup. */
export function el(tag: string, attrs: Attrs = {}, ...children: Array<string | undefined>): string {
  const serialised = attrString(attrs);
  const body = children.filter((child): child is string => child !== undefined && child !== '').join('');
  return body === '' ? `<${tag}${serialised}/>` : `<${tag}${serialised}>${body}</${tag}>`;
}

/** A text element with escaped content. */
export function text(attrs: Attrs, content: string): string {
  return el('text', attrs, esc(content));
}
