import { describe, expect, it } from 'vitest';
import { evaluateSubtitle } from '../src/subtitle.js';

const spec = (expression: string, defaults: Record<string, unknown> = {}) => ({ expression, defaults });

describe('evaluateSubtitle', () => {
  it('joins two parameters with a literal, the commonest shape', () => {
    expect(
      evaluateSubtitle(spec('={{$parameter["method"] + ": " + $parameter["url"]}}'), {
        url: 'https://api.example.com/users',
        method: 'POST',
      }),
    ).toBe('POST: https://api.example.com/users');
  });

  it('falls back to the type default for an unset parameter', () => {
    // n8n prints "GET: ..." even though the workflow never set a method.
    expect(
      evaluateSubtitle(spec('={{$parameter["method"] + ": " + $parameter["url"]}}', { method: 'GET' }), {
        url: 'https://api.example.com/users',
      }),
    ).toBe('GET: https://api.example.com/users');
  });

  it('renders a single parameter', () => {
    expect(evaluateSubtitle(spec('={{$parameter["mode"]}}'), { mode: 'manual' })).toBe('manual');
  });

  it('supports dot access and literal text between segments', () => {
    expect(
      evaluateSubtitle(spec('={{$parameter.resource}}:{{$parameter["operation"]}}'), {
        resource: 'message',
        operation: 'post',
      }),
    ).toBe('message:post');
  });

  it('stringifies numbers and booleans', () => {
    expect(evaluateSubtitle(spec('={{$parameter["count"]}}'), { count: 3 })).toBe('3');
    expect(evaluateSubtitle(spec('={{$parameter["all"]}}'), { all: true })).toBe('true');
  });

  it('gives up rather than guess on expressions it does not model', () => {
    for (const expression of [
      '={{$parameter["mode"] === "x" ? "a" : "b"}}',
      '={{ $parameter["a"].toUpperCase() }}',
      '={{ someFunction(1) }}',
    ]) {
      expect(evaluateSubtitle(spec(expression), { mode: 'x', a: 'y' })).toBeUndefined();
    }
  });

  it('gives up when a referenced parameter has no value at all', () => {
    expect(evaluateSubtitle(spec('={{$parameter["missing"]}}'), {})).toBeUndefined();
  });

  it('gives up on a non-scalar parameter rather than printing [object Object]', () => {
    expect(evaluateSubtitle(spec('={{$parameter["conditions"]}}'), { conditions: { a: 1 } })).toBeUndefined();
  });

  it('ignores an expression that is not a template', () => {
    expect(evaluateSubtitle(spec('just text'), {})).toBeUndefined();
  });
});
