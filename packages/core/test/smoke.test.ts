import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from '../src/index.js';

describe('core smoke', () => {
  it('exposes a version', () => {
    expect(CORE_VERSION).toBe('0.2.0');
  });
});
