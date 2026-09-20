import { describe, expect, it } from 'vitest';
import { PanZoom, type ViewState } from '../src/interaction.js';

const BOUNDS: ViewState = { x: 0, y: 0, w: 1000, h: 500 };
const VIEWPORT = { w: 800, h: 400 };

const fresh = (): PanZoom => new PanZoom({ ...BOUNDS }, { ...BOUNDS });

describe('pan', () => {
  it('converts screen pixels to viewBox units at the current scale', () => {
    const pz = fresh(); // 1000 units across 800 px => 1.25 units per px
    pz.pan(-80, -40, VIEWPORT);
    const s = pz.state();
    expect(s.x).toBeCloseTo(100, 6);
    expect(s.y).toBeCloseTo(50, 6);
    expect([s.w, s.h]).toEqual([1000, 500]);
  });

  it('pans in the drag direction', () => {
    const pz = fresh();
    pz.pan(80, 0, VIEWPORT);
    expect(pz.state().x).toBeCloseTo(-100, 6);
  });
});

describe('zoomAt', () => {
  it('halves the viewBox and keeps the centre fixed', () => {
    const pz = fresh();
    pz.zoomAt(2, { x: VIEWPORT.w / 2, y: VIEWPORT.h / 2 }, VIEWPORT);
    const s = pz.state();
    expect([s.w, s.h]).toEqual([500, 250]);
    expect(s.x + s.w / 2).toBeCloseTo(500, 6);
    expect(s.y + s.h / 2).toBeCloseTo(250, 6);
  });

  it('keeps the world point under the cursor stationary', () => {
    const pz = fresh();
    const at = { x: 0, y: 0 }; // top-left corner of the viewport
    const before = pz.state();
    const worldX = before.x + (at.x / VIEWPORT.w) * before.w;
    const worldY = before.y + (at.y / VIEWPORT.h) * before.h;
    pz.zoomAt(2.5, at, VIEWPORT);
    const after = pz.state();
    expect(after.x + (at.x / VIEWPORT.w) * after.w).toBeCloseTo(worldX, 2);
    expect(after.y + (at.y / VIEWPORT.h) * after.h).toBeCloseTo(worldY, 2);
  });

  it('keeps an off-centre point stationary too', () => {
    const pz = fresh();
    const at = { x: 620, y: 310 };
    const b = pz.state();
    const worldX = b.x + (at.x / VIEWPORT.w) * b.w;
    pz.zoomAt(0.5, at, VIEWPORT);
    const a = pz.state();
    expect(a.x + (at.x / VIEWPORT.w) * a.w).toBeCloseTo(worldX, 2);
  });

  it('clamps zoom on the absolute scale, as n8n does', () => {
    // measured: n8n's ceiling is 4 (400%), independent of the fitted scale.
    const pz = fresh();
    for (let i = 0; i < 30; i += 1) pz.zoomAt(1.2, { x: 400, y: 200 }, VIEWPORT);
    expect(pz.scaleFor(VIEWPORT)).toBeCloseTo(4, 6);
    expect(pz.state().w).toBeCloseTo(VIEWPORT.w / 4, 6);
  });

  it('reports the absolute scale: viewport pixels per canvas unit', () => {
    const pz = fresh(); // 1000 units across an 800px viewport
    expect(pz.scaleFor(VIEWPORT)).toBeCloseTo(0.8, 6);
  });

  it('zooms to an absolute scale about the centre', () => {
    const pz = fresh();
    const before = pz.state();
    pz.zoomTo(1, VIEWPORT); // "reset zoom to 100%"
    const after = pz.state();
    expect(after.w).toBeCloseTo(VIEWPORT.w, 6);
    expect(after.h).toBeCloseTo(VIEWPORT.h, 6);
    expect(after.x + after.w / 2).toBeCloseTo(before.x + before.w / 2, 6);
    expect(after.y + after.h / 2).toBeCloseTo(before.y + before.h / 2, 6);
  });
});

describe('fit and viewBox', () => {
  it('restores padded bounds', () => {
    const pz = fresh();
    pz.pan(-300, -200, VIEWPORT);
    pz.zoomAt(3, { x: 10, y: 10 }, VIEWPORT);
    pz.fit();
    const s = pz.state();
    expect(s.w).toBeCloseTo(1050, 6); // 5% padding
    expect(s.h).toBeCloseTo(525, 6);
    expect(s.x + s.w / 2).toBeCloseTo(500, 6);
    expect(s.y + s.h / 2).toBeCloseTo(250, 6);
  });

  it('formats the viewBox attribute', () => {
    expect(fresh().viewBox()).toBe('0 0 1000 500');
  });

  it('rounds the viewBox to two decimals', () => {
    const pz = fresh();
    pz.pan(-1, 0, { w: 3, h: 3 });
    expect(pz.viewBox().split(' ')[0]).toBe('333.33');
  });
});
