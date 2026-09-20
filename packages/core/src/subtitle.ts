/**
 * Node subtitles.
 *
 * n8n prints a line under the node name — "GET: https://…", "manual" — produced
 * by evaluating a small expression over the node's own parameters. Almost all of
 * them are one of two shapes:
 *
 *     ={{$parameter["method"] + ": " + $parameter["url"]}}
 *     ={{$parameter["mode"]}}
 *
 * This evaluates exactly that much and **gives up on anything else**. It is
 * deliberately not an expression engine: the input is untrusted workflow JSON,
 * so there is no `eval`, no function calls, and no property access beyond a
 * parameter lookup. When a subtitle cannot be resolved faithfully we render
 * none, which is honest, rather than a guess that looks like n8n and isn't.
 */
import type { SubtitleSpec } from 'workflow-render-assets';

/** A parameter reference or a string literal — the only terms we model. */
type Term = { kind: 'param'; name: string } | { kind: 'literal'; value: string };

const PARAM_BRACKET = /^\$parameter\[\s*(['"])(.*?)\1\s*\]/;
const PARAM_DOT = /^\$parameter\.([A-Za-z_$][\w$]*)/;
const STRING = /^(['"])(.*?)\1/;

/** Parse `a + b + c` into terms. Returns undefined for anything unmodelled. */
function parseExpression(source: string): Term[] | undefined {
  const terms: Term[] = [];
  let rest = source.trim();
  let expectTerm = true;

  while (rest.length > 0) {
    if (expectTerm) {
      const bracket = PARAM_BRACKET.exec(rest);
      const dot = bracket ? null : PARAM_DOT.exec(rest);
      const literal = bracket || dot ? null : STRING.exec(rest);

      if (bracket) terms.push({ kind: 'param', name: bracket[2] as string });
      else if (dot) terms.push({ kind: 'param', name: dot[1] as string });
      else if (literal) terms.push({ kind: 'literal', value: literal[2] as string });
      else return undefined; // a call, a ternary, arithmetic — not modelled

      rest = rest.slice((bracket ?? dot ?? literal)![0].length).trimStart();
      expectTerm = false;
      continue;
    }

    if (!rest.startsWith('+')) return undefined; // any other operator: give up
    rest = rest.slice(1).trimStart();
    expectTerm = true;
  }

  return expectTerm && terms.length > 0 ? undefined : terms;
}

/** Only scalars can be printed; anything else means we cannot be faithful. */
function scalar(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return undefined;
}

/**
 * Resolve a node's subtitle, or undefined when it cannot be resolved exactly.
 * Parameters set on the node win; the node type's defaults fill the rest, which
 * is how an unset HTTP method still prints as `GET`.
 */
export function evaluateSubtitle(
  spec: SubtitleSpec,
  parameters: Record<string, unknown>,
): string | undefined {
  const template = spec.expression.startsWith('=') ? spec.expression.slice(1) : spec.expression;
  if (!template.includes('{{')) return undefined;

  let out = '';
  let rest = template;

  while (rest.length > 0) {
    const open = rest.indexOf('{{');
    if (open === -1) {
      out += rest;
      break;
    }
    out += rest.slice(0, open);
    const close = rest.indexOf('}}', open);
    if (close === -1) return undefined; // unbalanced template

    const terms = parseExpression(rest.slice(open + 2, close));
    if (!terms) return undefined;

    for (const term of terms) {
      if (term.kind === 'literal') {
        out += term.value;
        continue;
      }
      const raw = parameters[term.name] ?? spec.defaults[term.name];
      const value = scalar(raw);
      if (value === undefined) return undefined;
      out += value;
    }
    rest = rest.slice(close + 2);
  }

  const text = out.trim();
  return text === '' ? undefined : text;
}
