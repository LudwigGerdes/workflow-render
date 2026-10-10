/**
 * NDV styling, driven by the measured constants so the panel and the canvas
 * cannot drift apart.
 */
import {
  NDV_PINNED_BG,
  NDV_PINNED_BG_DARK,
  NDV_PINNED_TEXT,
  NDV_PINNED_TEXT_DARK,
  NDV_TEXT_VALUE_DARK,
  ndvChromeFor,
  ndvPaneFor,
  ndvTokensFor,
  type ThemeName,
  NDV_BACKDROP_OPACITY,
  NDV_CALLOUT_PADDING,
  NDV_CHIP_HEIGHT,
  NDV_CHIP_PADDING_X,
  NDV_CHIP_RADIUS,
  NDV_COUNT_FONT_SIZE,
  NDV_FIELD_HEIGHT,
  NDV_INSET,
  NDV_LABEL_FONT_SIZE,
  NDV_LABEL_FONT_WEIGHT,
  NDV_LABEL_HEIGHT,
  NDV_NEST_INDENT,
  NDV_PANEL_PADDING_BOTTOM,
  NDV_PANEL_PADDING_X,
  NDV_PANEL_WIDTH,
  NDV_RESIZE_HANDLE_WIDTH,
  NDV_ROW_GAP,
  NDV_SCHEMA_ROW_GAP,
  NDV_SCHEMA_VALUE_COLOR,
  NDV_SEARCH_FONT_SIZE,
  NDV_SEARCH_GAP,
  NDV_SEARCH_HEIGHT,
  NDV_SEARCH_ICON_SIZE,
  NDV_SEARCH_RADIUS,
  NDV_TAB_ACCENT,
  NDV_TAB_FONT_SIZE,
  NDV_TAB_FONT_WEIGHT,
  NDV_TAB_HEIGHT,
  NDV_TAB_IDLE_COLOR,
  NDV_TAB_PADDING_BOTTOM_ACTIVE,
  NDV_TAB_PADDING_BOTTOM_IDLE,
  NDV_TAB_PADDING_X,
  NDV_TAB_UNDERLINE_WIDTH,
  NDV_TYPE_ICON_SIZE,
} from 'workflow-render-core';

/**
 * The inspector's colours for one theme, as custom property declarations. The
 * stylesheet below only ever reads these variables, so switching theme is a
 * matter of which block applies.
 */
export function ndvThemeVars(theme: ThemeName): string {
  const n = ndvTokensFor(theme);
  const c = ndvChromeFor(theme);
  const p = ndvPaneFor(theme);
  const dark = theme === 'dark';
  return [
    ['panel-bg', n.panelBg],
    ['input-panel-bg', n.inputPanelBg],
    ['field-bg', n.fieldBg],
    ['label', n.label],
    ['field-label', n.fieldLabel],
    ['text', n.text],
    ['muted', n.muted],
    ['expression-bg', n.expressionBg],
    ['expression-border', n.expressionBorder],
    ['line', c.line],
    ['segment-bg', c.segmentBg],
    ['segment-active-bg', c.segmentActiveBg],
    ['table-head-bg', c.tableHeadBg],
    ['table-head-text', c.tableHeadText],
    ['table-line', c.tableLine],
    ['table-cell-text', c.tableCellText],
    ['toggle-off', c.toggleOff],
    ['toggle-off-border', c.toggleOffBorder],
    ['toggle-on', c.toggleOn],
    ['toggle-knob', c.toggleKnob],
    ['field-border', c.fieldBorder],
    ['input-border', c.inputBorder],
    ['input-hover-border', c.inputHoverBorder],
    ['dashed-border', c.dashedBorder],
    ['chip-bg', p.chipBg],
    ['chip-border', p.chipBorder],
    ['chip-text', p.chipText],
    ['count', p.count],
    ['icon-muted', p.iconMuted],
    // n8n's light #444444 value text became #e5e5e5 in every dark measurement (table cells, idle view switcher).
    ['schema-value', dark ? NDV_TEXT_VALUE_DARK : NDV_SCHEMA_VALUE_COLOR],
    ['tab-idle', dark ? NDV_TEXT_VALUE_DARK : NDV_TAB_IDLE_COLOR],
    // n8n's orange accent: the active Parameters tab measured #ff6900 in dark too.
    ['tab-accent', NDV_TAB_ACCENT],
    ['pinned-bg', dark ? NDV_PINNED_BG_DARK : NDV_PINNED_BG],
    ['pinned-text', dark ? NDV_PINNED_TEXT_DARK : NDV_PINNED_TEXT],
  ]
    .map(([k, v]) => `--wr-ndv-${k}: ${v};`)
    .join(' ');
}

export const ndvStyles = `
.wr-ndv-panes { display: flex; align-items: stretch; flex: 1; min-height: 0; }
/* Columns are separated by a rule, not by empty space: with only a gap the
   three panes read as one wide sheet. */
.wr-ndv-pane {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px 16px;
}
/* The measured 419px is the parameters column, not the whole panel. It used to
   sit on .wr-ndv-body, which is the modal's full-width child -- so the middle
   column filled the body and both side panes flexed to zero. They rendered and
   were invisible, which is why the execution view looked like it had none. */
.wr-ndv-middle {
  flex: 0 0 auto;
  width: ${NDV_PANEL_WIDTH}px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--wr-ndv-line);
  border-right: 1px solid var(--wr-ndv-line);
}
.wr-ndv-pane-header { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.wr-ndv-pane-title {
  font-size: 11px; letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--wr-ndv-label);
}
/* n8n puts the count on its own line beneath the header, not beside the title. */
.wr-ndv-pane-count {
  font-size: ${NDV_COUNT_FONT_SIZE}px;
  color: var(--wr-ndv-count);
  padding: 6px 0 8px;
}

/* The search field. It sits in the pane header beside the mode control, and is
   a bare input on the pane's own ground -- no filled box, just the glyph. */
.wr-ndv-search {
  display: flex;
  align-items: center;
  gap: ${NDV_SEARCH_GAP}px;
  height: ${NDV_SEARCH_HEIGHT}px;
  padding: 0 8px;
  border-radius: ${NDV_SEARCH_RADIUS}px;
}
.wr-ndv-search input {
  flex: 1 1 auto;
  min-width: 0;
  height: ${NDV_SEARCH_HEIGHT}px;
  font: inherit;
  font-size: ${NDV_SEARCH_FONT_SIZE}px;
  color: var(--wr-ndv-text);
  background: none;
  border: 0;
  outline: none;
}
.wr-ndv-search input::placeholder { color: var(--wr-ndv-icon-muted); }
/* min-width matters: as a flex item the svg otherwise stretches to whatever
   space is going, which drew the magnifier at 188px wide. */
.wr-ndv-search-icon {
  flex: 0 0 ${NDV_SEARCH_ICON_SIZE}px;
  width: ${NDV_SEARCH_ICON_SIZE}px;
  min-width: ${NDV_SEARCH_ICON_SIZE}px;
  height: ${NDV_SEARCH_ICON_SIZE}px;
  color: var(--wr-ndv-icon-muted);
}

/* Data that came with the payload rather than from a run. n8n says so in a
   callout across the top of the pane, and a snapshot has the same distinction
   to draw -- pinned data is not evidence that the node executed. */
.wr-ndv-pinned {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: ${NDV_CALLOUT_PADDING}px;
  margin-bottom: 8px;
  background: var(--wr-ndv-pinned-bg);
  color: var(--wr-ndv-pinned-text);
  border-radius: 4px;
  font-size: 12px;
}
/* A segmented control: one grey trough, the active mode a raised white pill. */
.wr-ndv-modes {
  margin-left: auto; display: flex; gap: 2px;
  background: var(--wr-ndv-segment-bg); border-radius: 6px; padding: 2px;
}
.wr-ndv-modes button {
  height: 22px; padding: 0 10px; font: inherit; font-size: 12px;
  background: none; border: 0; border-radius: 4px;
  color: var(--wr-ndv-label); cursor: pointer;
}
.wr-ndv-modes button[aria-selected='true'] {
  background: var(--wr-ndv-segment-active-bg);
  color: var(--wr-ndv-text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.wr-ndv-pane-body { overflow: auto; flex: 1; }
.wr-ndv-table { border-collapse: collapse; width: 100%; font-size: 12px; }
.wr-ndv-table th {
  height: 32px; text-align: left; font-weight: 700; padding: 4px 6px;
  background: var(--wr-ndv-table-head-bg); color: var(--wr-ndv-table-head-text); border-bottom: 1px solid var(--wr-ndv-table-line);
}
.wr-ndv-table td { height: 23px; padding: 4px 6px; color: var(--wr-ndv-table-cell-text); border-bottom: 1px solid var(--wr-ndv-table-line); }
.wr-ndv-stack { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.wr-ndv-schema { font-size: 12px; }
.wr-ndv-schema-row {
  display: flex;
  align-items: center;
  gap: ${NDV_SCHEMA_ROW_GAP}px;
  padding: 0 0 ${NDV_SCHEMA_ROW_GAP}px;
}
/* The key travels in a raised pill carrying its type glyph, which is what makes
   a schema row legible against the pane's grey ground. */
.wr-ndv-chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  /* The measured 24px is the outer box: without this the border adds on top
     and the pill stands 26px tall. */
  box-sizing: border-box;
  height: ${NDV_CHIP_HEIGHT}px;
  padding: 0 ${NDV_CHIP_PADDING_X}px;
  background: var(--wr-ndv-chip-bg);
  border: 1px solid var(--wr-ndv-chip-border);
  border-radius: ${NDV_CHIP_RADIUS}px;
  color: var(--wr-ndv-chip-text);
  font-size: 12px;
  max-width: 60%;
}
.wr-ndv-chip-key { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wr-ndv-type-icon {
  flex: 0 0 auto;
  width: ${NDV_TYPE_ICON_SIZE}px;
  height: ${NDV_TYPE_ICON_SIZE}px;
  color: var(--wr-ndv-icon-muted);
  /* A letter, not a pictogram -- so it needs the metrics to sit centred in the
     same 12px slot n8n gives its type glyph. */
  font-size: 10px;
  line-height: ${NDV_TYPE_ICON_SIZE}px;
  font-weight: 600;
  text-align: center;
}
.wr-ndv-schema-value {
  flex: 1 1 auto; min-width: 0; color: var(--wr-ndv-schema-value);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* The strip between the parameters column and a side pane. n8n makes it a bare
   grab target: no fill of its own, just the cursor telling you it is draggable. */
.wr-ndv-resize {
  flex: 0 0 auto;
  width: ${NDV_RESIZE_HANDLE_WIDTH}px;
  cursor: col-resize;
  background: none;
  border: 0;
  padding: 0;
  align-self: stretch;
}
.wr-ndv-resize:hover { background: var(--wr-ndv-line); }
.wr-ndv-runs { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 12px; }
.wr-ndv-pager { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 12px; }
.wr-ndv-error { padding: 8px; }
.wr-ndv-error-message { font-size: 14px; margin: 0 0 4px; }
.wr-ndv-error-detail { font-size: 12px; opacity: 0.8; margin: 0 0 4px; }
.wr-ndv-error-stack pre { font-size: 11px; white-space: pre-wrap; }

/* The backdrop is exactly the element's box, so it is what the narrow layout
   below measures: the panel adapts to the space it is given, not to the screen,
   because an embed can be a narrow column on a wide page. */
.wr-ndv-backdrop {
  container-type: inline-size;
  container-name: wr-ndv;
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, ${NDV_BACKDROP_OPACITY});
  display: grid;
  place-items: center;
  z-index: 10;
}
.wr-ndv {
  position: absolute;
  inset: ${NDV_INSET}px;
  display: flex;
  flex-direction: column;
  background: var(--wr-ndv-panel-bg);
  color: var(--wr-ndv-text);
  border-radius: 8px;
  overflow: hidden;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.wr-ndv-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px ${NDV_PANEL_PADDING_X}px;
  border-bottom: 1px solid var(--wr-ndv-line);
}
.wr-ndv-title { font-size: 16px; font-weight: 600; }
.wr-ndv-sub { color: var(--wr-ndv-label); font-size: 13px; }
.wr-ndv-close { margin-left: auto; background: none; border: 0; cursor: pointer; font-size: 18px; color: inherit; }

/* The strip carries the hairline; each tab's underline sits on top of it, so
   the active accent reads as part of the same line rather than floating. */
.wr-ndv-tabs {
  display: flex;
  gap: 0;
  padding: 12px 0 0;
  border-bottom: 1px solid var(--wr-ndv-line);
}
.wr-ndv-tabs button {
  height: ${NDV_TAB_HEIGHT}px;
  font-size: ${NDV_TAB_FONT_SIZE}px;
  font-weight: ${NDV_TAB_FONT_WEIGHT};
  background: none;
  border: 0;
  /* Idle tabs take back the space the active tab's underline occupies, so the
     labels sit on one baseline instead of shifting as you switch tabs. */
  padding: 0 ${NDV_TAB_PADDING_X}px ${NDV_TAB_PADDING_BOTTOM_IDLE}px;
  color: var(--wr-ndv-tab-idle);
  cursor: pointer;
}
.wr-ndv-tabs button[aria-selected='true'] {
  color: var(--wr-ndv-tab-accent);
  padding-bottom: ${NDV_TAB_PADDING_BOTTOM_ACTIVE}px;
  border-bottom: ${NDV_TAB_UNDERLINE_WIDTH}px solid var(--wr-ndv-tab-accent);
}

.wr-ndv-body {
  flex: 1;
  min-height: 0;
  padding: 12px ${NDV_PANEL_PADDING_X}px ${NDV_PANEL_PADDING_BOTTOM}px;
  overflow: auto;
}
.wr-ndv-field { margin-bottom: ${NDV_ROW_GAP}px; }
.wr-ndv-field > label {
  display: block;
  height: ${NDV_LABEL_HEIGHT}px;
  font-size: ${NDV_LABEL_FONT_SIZE}px;
  font-weight: ${NDV_LABEL_FONT_WEIGHT};
  color: var(--wr-ndv-field-label);
}
.wr-ndv-value {
  min-height: ${NDV_FIELD_HEIGHT}px;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--wr-ndv-field-bg);
  border: 1px solid var(--wr-ndv-field-border);
  border-radius: 6px;
  font-size: 14px;
  word-break: break-word;
}
/* Read-only by construction: a default is shown muted, exactly as n8n does. */
.wr-ndv-field.is-default .wr-ndv-value { color: var(--wr-ndv-muted); }
.wr-ndv-expression {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  background: var(--wr-ndv-expression-bg);
  border: 1px solid var(--wr-ndv-expression-border);
  border-radius: 4px;
  padding: 2px 6px;
}
.wr-ndv-children { margin-left: ${NDV_NEST_INDENT}px; }
.wr-ndv-toggle { width: 34px; height: 18px; border-radius: 9px; background: var(--wr-ndv-toggle-off); box-shadow: inset 0 0 0 1px var(--wr-ndv-toggle-off-border); position: relative; }
.wr-ndv-toggle[data-on='true'] { background: var(--wr-ndv-toggle-on); box-shadow: none; }
.wr-ndv-toggle::after {
  content: '';
  position: absolute;
  top: 2px; left: 2px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--wr-ndv-toggle-knob);
}
.wr-ndv-toggle[data-on='true']::after { left: auto; right: 2px; }
.wr-ndv-json, .wr-ndv-markdown {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
/* The raw pane exists to be taken away, so the copy sits with the text. */
.wr-ndv-raw {
  position: relative;
}
.wr-ndv-raw .wr-ndv-json {
  margin-top: 0;
}
.wr-ndv-copy {
  position: absolute;
  top: 0;
  right: 0;
  height: 24px;
  padding: 0 10px;
  font-size: 12px;
  color: var(--wr-ndv-text);
  background: var(--wr-ndv-field-bg);
  border: 1px solid var(--wr-ndv-input-border);
  border-radius: 4px;
  cursor: pointer;
}
.wr-ndv-copy:hover {
  border-color: var(--wr-ndv-input-hover-border);
}
.wr-ndv-note {
  font-size: 12px;
  color: var(--wr-ndv-label);
  border: 1px dashed var(--wr-ndv-dashed-border);
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 12px;
}

/* Shown only in the narrow layout. */
.wr-ndv-switch { display: none; }
.wr-ndv-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wr-ndv-sub { white-space: nowrap; }

/* Below this width the parameters column alone (${NDV_PANEL_WIDTH}px) leaves the
   side panes a few words wide. Show one column at a time, full width. */
@container wr-ndv (max-width: 760px) {
  .wr-ndv { inset: 8px; }
  .wr-ndv-header { padding: 10px 12px; }
  .wr-ndv-title { font-size: 15px; }
  .wr-ndv-switch {
    display: flex;
    gap: 4px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--wr-ndv-line);
  }
  .wr-ndv-switch button {
    flex: 1 1 0;
    min-height: 36px;
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--wr-ndv-tab-idle);
    background: none;
    border: 1px solid var(--wr-ndv-line);
    border-radius: 6px;
    cursor: pointer;
  }
  .wr-ndv-switch button[aria-pressed='true'] {
    color: var(--wr-ndv-tab-accent);
    border-color: var(--wr-ndv-tab-accent);
  }
  .wr-ndv-resize { display: none; }
  .wr-ndv-panes > .wr-ndv-pane,
  .wr-ndv-panes > .wr-ndv-middle { display: none; }
  .wr-ndv-middle { width: auto !important; flex: 1 1 auto; border-left: 0; border-right: 0; }
  .wr-ndv-panes[data-pane='node'] > .wr-ndv-middle,
  .wr-ndv-panes[data-pane='input'] > .wr-ndv-pane-input,
  .wr-ndv-panes[data-pane='output'] > .wr-ndv-pane-output { display: flex; flex: 1 1 auto; }
  .wr-ndv-pane { padding: 12px; }
  .wr-ndv-tabs { overflow-x: auto; }
  .wr-ndv-tabs button { white-space: nowrap; }
  .wr-ndv-body { padding-left: 12px; padding-right: 12px; }
}
`;
