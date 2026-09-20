import { describe, expect, it, vi } from 'vitest';
import { copyText } from '../src/ndv/panel.js';

describe('copyText', () => {
  it('writes the text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyText('{"a":1}', { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('{"a":1}');
  });

  it('reports failure rather than throwing, so the pane can say so', async () => {
    // Clipboard access is denied outright in some embedding contexts, and an
    // embedded viewer must not break the host page over it.
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    expect(await copyText('{}', { writeText })).toBe(false);
  });

  it('reports failure when the context has no clipboard at all', async () => {
    // `navigator.clipboard` is undefined on an insecure origin, which is a
    // plausible way to serve an embedded viewer.
    expect(await copyText('{}', undefined)).toBe(false);
  });
});
