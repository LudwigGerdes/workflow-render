/**
 * The element is a bare canvas, not a picture of one inside a frame.
 *
 * No margin, no border, no padding, no card. Content runs edge to edge and is
 * clipped to the element's own bounds, and the ground is painted rather than
 * inherited — embedded in a dark page, an inherited background renders dark
 * text on dark.
 *
 * On reading these assertions: happy-dom does not apply `:host` rules to the
 * host element, so `getComputedStyle(el)` reports nothing for them. The rules
 * are instead read from the shadow root's adopted stylesheet, which is the CSS
 * the component actually ships. One exception: happy-dom's parser drops any
 * declaration whose value contains `var()`, which is every themed colour, so
 * the painted ground is asserted against Lit's authored `cssText`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import '../src/workflow-render.js';
import { WorkflowRender } from '../src/workflow-render.js';

const mount = async (): Promise<HTMLElement> => {
  document.body.style.margin = '0';
  const host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '600px';
  host.appendChild(document.createElement('workflow-render'));
  document.body.appendChild(host);
  const el = host.firstElementChild as HTMLElement;
  await (el as HTMLElement & { updateComplete?: Promise<unknown> }).updateComplete;
  return el;
};

/** The `:host` rule as the component ships it. */
const hostRule = (el: HTMLElement): CSSStyleDeclaration => {
  const sheet = el.shadowRoot?.adoptedStyleSheets[0];
  if (!sheet) throw new Error('no adopted stylesheet');
  const rule = (Array.from(sheet.cssRules) as CSSStyleRule[]).find(
    (r) => r.selectorText === ':host',
  );
  if (!rule) throw new Error('no :host rule');
  return rule.style;
};

const authoredCss = (): string =>
  ([] as { cssText?: string }[]).concat(WorkflowRender.styles as never).map((s) => s.cssText ?? '').join('\n');

describe('the element is a bare canvas', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('fills the box it is given', async () => {
    const style = hostRule(await mount());
    expect(style.getPropertyValue('display')).toBe('block');
    expect(style.getPropertyValue('width')).toBe('100%');
    expect(style.getPropertyValue('height')).toBe('100%');
  });

  it('adds no frame of its own', async () => {
    const style = hostRule(await mount());
    // No card, no border, no inset. The canvas runs edge to edge.
    expect(style.getPropertyValue('border-top-width')).toBe('0px');
    expect(style.getPropertyValue('padding-top')).toBe('0px');
    expect(style.getPropertyValue('margin-top')).toBe('0px');
  });

  it('clips its content to its own bounds', async () => {
    const el = await mount();
    // A workflow larger than the viewport must not paint over the host page.
    expect(hostRule(el).getPropertyValue('overflow')).toBe('hidden');
    const viewport = el.shadowRoot?.querySelector('.wr-viewport') as HTMLElement | null;
    expect(viewport).not.toBeNull();
    expect(getComputedStyle(viewport as HTMLElement).overflow).toBe('hidden');
  });

  it('paints a ground, so a dark host page does not show through', async () => {
    await mount();
    const host = /:host\s*\{[^}]*\}/.exec(authoredCss())?.[0] ?? '';
    expect(host).toMatch(/background-color:\s*var\(--wr-canvas-bg/);
  });
});

describe('sticky images', () => {
  /**
   * Only the attribute contract is asserted here. happy-dom renders no SVG for
   * this element at all, so any assertion about what the canvas contains would
   * pass whether or not anything was drawn. What the flag actually does to the
   * output is covered by core's sticky-markdown tests, and both paths were
   * checked in a real browser.
   */
  it('is safe by default and redraws when the embedder opts in', async () => {
    const el = document.createElement('workflow-render') as HTMLElement & { images?: string };
    document.body.appendChild(el);
    await (el as HTMLElement & { updateComplete?: Promise<unknown> }).updateComplete;
    expect(el.images).toBe('safe');

    el.setAttribute('images', 'remote');
    await (el as HTMLElement & { updateComplete?: Promise<unknown> }).updateComplete;
    expect(el.images).toBe('remote');
  });
});

describe('selection', () => {
  it('looks different when a node is selected', async () => {
    // The class was toggled and the event fired, but nothing styled it, so a
    // click was indistinguishable from a miss.
    const el = await mount();
    const css = ([] as { cssText?: string }[])
      .concat(WorkflowRender.styles as never)
      .map((s) => s.cssText ?? '')
      .join('\n');
    expect(css).toMatch(/\.wr-selected[^{]*\{[^}]*stroke:/);
    expect(el.shadowRoot).not.toBeNull();
  });
});

describe('the canvas SVG rule stays off the panel', () => {
  const sheet = (): string =>
    ([] as { cssText?: string }[])
      .concat(WorkflowRender.styles as never)
      .map((s) => s.cssText ?? '')
      .join('\n');

  /**
   * `.wr-viewport svg` sizes the canvas to fill its box. As a descendant
   * selector it also caught every svg inside the NDV -- and it out-specifies
   * their own classes, so the panel's icons stretched to whatever box they sat
   * in: a 16px magnifier rendered 188px wide.
   *
   * No unit test could see that, because happy-dom performs no layout and
   * reports no such thing. Asserting the combinator is the part that is
   * checkable here; the sizes themselves were verified in a real browser.
   */
  it('sizes only its own direct child, not every nested svg', () => {
    expect(sheet()).toMatch(/\.wr-viewport\s*>\s*svg/);
    expect(sheet()).not.toMatch(/\.wr-viewport\s+svg\s*\{/);
  });
});

describe('canvas chrome', () => {
  it('steps the controls aside when the pointer is still, and brings them back', async () => {
    const el = await mount();
    const css = ([] as { cssText?: string }[])
      .concat(WorkflowRender.styles as never)
      .map((s) => s.cssText ?? '')
      .join('\n');
    // Idle dims both clusters. It must not erase them: a control that vanishes
    // two seconds after load is a control nobody finds.
    expect(css).toMatch(/\.wr-idle[^{]*\.wr-(controls|export)/);
    expect(css).not.toMatch(/\.wr-idle[^{]*\.wr-controls[^{]*\{[^}]*opacity:\s*0\s*[;}]/);
    expect(el.shadowRoot?.querySelector('.wr-viewport')).not.toBeNull();
  });
});

describe('seeded assets', () => {
  it('uses assets supplied on the page instead of fetching sidecars', async () => {
    // An embed pasted onto another host cannot fetch sidecars: they would
    // resolve against that host. It seeds them on the page instead.
    const { loadIcons, resetIcons } = await import('../src/icons.js');
    resetIcons();
    (globalThis as Record<string, unknown>)['__WORKFLOW_RENDER_ASSETS__'] = {
      icons: { 'n8n-nodes-base.code': { type: 'monogram', letters: 'ZZ', color: '#123456' } },
    };
    const icons = await loadIcons();
    expect(icons['n8n-nodes-base.code']).toEqual({ type: 'monogram', letters: 'ZZ', color: '#123456' });
    delete (globalThis as Record<string, unknown>)['__WORKFLOW_RENDER_ASSETS__'];
    resetIcons();
  });

  it('ignores a hostile seed rather than throwing', async () => {
    const { loadIcons, resetIcons } = await import('../src/icons.js');
    resetIcons();
    (globalThis as Record<string, unknown>)['__WORKFLOW_RENDER_ASSETS__'] = 'not an object';
    await expect(loadIcons()).resolves.toBeTypeOf('object');
    delete (globalThis as Record<string, unknown>)['__WORKFLOW_RENDER_ASSETS__'];
    resetIcons();
  });
});
