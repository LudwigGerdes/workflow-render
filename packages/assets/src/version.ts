/**
 * The single n8n release workflow-render emulates: the folder under `data/` whose
 * bundles are served, and the version core stamps onto every SVG.
 *
 * This module imports nothing, so it can be pulled into the browser bundle
 * (core, element) without dragging `node:fs` along. Bump it, re-extract the
 * data, regenerate the goldens.
 */
export const EMULATED_VERSION = '2.38.1';
