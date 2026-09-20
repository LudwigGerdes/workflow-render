/**
 * NDV styling, driven by the measured constants so the panel and the canvas
 * cannot drift apart.
 */
import {
  NDV_BACKDROP_OPACITY,
  NDV_CALLOUT_PADDING,
  NDV_CHIP_BG,
  NDV_CHIP_BORDER,
  NDV_CHIP_HEIGHT,
  NDV_CHIP_PADDING_X,
  NDV_CHIP_RADIUS,
  NDV_CHIP_TEXT,
  NDV_COUNT_COLOR,
  NDV_COUNT_FONT_SIZE,
  NDV_FIELD_HEIGHT,
  NDV_ICON_MUTED,
  NDV_INSET,
  NDV_LABEL_FONT_SIZE,
  NDV_LABEL_FONT_WEIGHT,
  NDV_LABEL_HEIGHT,
  NDV_LIGHT,
  NDV_NEST_INDENT,
  NDV_PANEL_PADDING_BOTTOM,
  NDV_PANEL_PADDING_X,
  NDV_PANEL_WIDTH,
  NDV_PINNED_BG,
  NDV_PINNED_TEXT,
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

/** The hairline n8n separates panes and header with. */
const NDV_LINE = 'rgba(0, 0, 0, 0.09)';

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
  border-left: 1px solid ${NDV_LINE};
  border-right: 1px solid ${NDV_LINE};
}
.wr-ndv-pane-header { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.wr-ndv-pane-title {
  font-size: 11px; letter-spacing: 0.09em; text-transform: uppercase;
  color: ${NDV_LIGHT.label};
}
/* n8n puts the count on its own line beneath the header, not beside the title. */
.wr-ndv-pane-count {
  font-size: ${NDV_COUNT_FONT_SIZE}px;
  color: ${NDV_COUNT_COLOR};
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
  color: ${NDV_LIGHT.text};
  background: none;
  border: 0;
  outline: none;
}
.wr-ndv-search input::placeholder { color: ${NDV_ICON_MUTED}; }
/* min-width matters: as a flex item the svg otherwise stretches to whatever
   space is going, which drew the magnifier at 188px wide. */
.wr-ndv-search-icon {
  flex: 0 0 ${NDV_SEARCH_ICON_SIZE}px;
  width: ${NDV_SEARCH_ICON_SIZE}px;
  min-width: ${NDV_SEARCH_ICON_SIZE}px;
  height: ${NDV_SEARCH_ICON_SIZE}px;
  color: ${NDV_ICON_MUTED};
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
  background: ${NDV_PINNED_BG};
  color: ${NDV_PINNED_TEXT};
  border-radius: 4px;
  font-size: 12px;
}
/* A segmented control: one grey trough, the active mode a raised white pill. */
.wr-ndv-modes {
  margin-left: auto; display: flex; gap: 2px;
  background: #f0f0f2; border-radius: 6px; padding: 2px;
}
.wr-ndv-modes button {
  height: 22px; padding: 0 10px; font: inherit; font-size: 12px;
  background: none; border: 0; border-radius: 4px;
  color: ${NDV_LIGHT.label}; cursor: pointer;
}
.wr-ndv-modes button[aria-selected='true'] {
  background: ${NDV_LIGHT.fieldBg};
  color: ${NDV_LIGHT.text};
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.wr-ndv-pane-body { overflow: auto; flex: 1; }
.wr-ndv-table { border-collapse: collapse; width: 100%; font-size: 12px; }
.wr-ndv-table th {
  height: 32px; text-align: left; font-weight: 700; padding: 4px 6px;
  background: #f5f5f5; color: #2b2b2b; border-bottom: 1px solid #e0e0e0;
}
.wr-ndv-table td { height: 23px; padding: 4px 6px; color: #757575; border-bottom: 1px solid #e0e0e0; }
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
  background: ${NDV_CHIP_BG};
  border: 1px solid ${NDV_CHIP_BORDER};
  border-radius: ${NDV_CHIP_RADIUS}px;
  color: ${NDV_CHIP_TEXT};
  font-size: 12px;
  max-width: 60%;
}
.wr-ndv-chip-key { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wr-ndv-type-icon {
  flex: 0 0 auto;
  width: ${NDV_TYPE_ICON_SIZE}px;
  height: ${NDV_TYPE_ICON_SIZE}px;
  color: ${NDV_ICON_MUTED};
  /* A letter, not a pictogram -- so it needs the metrics to sit centred in the
     same 12px slot n8n gives its type glyph. */
  font-size: 10px;
  line-height: ${NDV_TYPE_ICON_SIZE}px;
  font-weight: 600;
  text-align: center;
}
.wr-ndv-schema-value {
  flex: 1 1 auto; min-width: 0; color: ${NDV_SCHEMA_VALUE_COLOR};
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
.wr-ndv-resize:hover { background: ${NDV_LINE}; }
.wr-ndv-runs { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 12px; }
.wr-ndv-pager { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 12px; }
.wr-ndv-error { padding: 8px; }
.wr-ndv-error-message { font-size: 14px; margin: 0 0 4px; }
.wr-ndv-error-detail { font-size: 12px; opacity: 0.8; margin: 0 0 4px; }
.wr-ndv-error-stack pre { font-size: 11px; white-space: pre-wrap; }

.wr-ndv-backdrop {
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
  background: ${NDV_LIGHT.panelBg};
  color: ${NDV_LIGHT.text};
  border-radius: 8px;
  overflow: hidden;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.wr-ndv-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px ${NDV_PANEL_PADDING_X}px;
  border-bottom: 1px solid ${NDV_LINE};
}
.wr-ndv-title { font-size: 16px; font-weight: 600; }
.wr-ndv-sub { color: ${NDV_LIGHT.label}; font-size: 13px; }
.wr-ndv-close { margin-left: auto; background: none; border: 0; cursor: pointer; font-size: 18px; color: inherit; }

/* The strip carries the hairline; each tab's underline sits on top of it, so
   the active accent reads as part of the same line rather than floating. */
.wr-ndv-tabs {
  display: flex;
  gap: 0;
  padding: 12px 0 0;
  border-bottom: 1px solid ${NDV_LINE};
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
  color: ${NDV_TAB_IDLE_COLOR};
  cursor: pointer;
}
.wr-ndv-tabs button[aria-selected='true'] {
  color: ${NDV_TAB_ACCENT};
  padding-bottom: ${NDV_TAB_PADDING_BOTTOM_ACTIVE}px;
  border-bottom: ${NDV_TAB_UNDERLINE_WIDTH}px solid ${NDV_TAB_ACCENT};
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
  color: ${NDV_LIGHT.fieldLabel};
}
.wr-ndv-value {
  min-height: ${NDV_FIELD_HEIGHT}px;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: ${NDV_LIGHT.fieldBg};
  border: 1px solid rgba(0, 0, 0, 0.16);
  border-radius: 6px;
  font-size: 14px;
  word-break: break-word;
}
/* Read-only by construction: a default is shown muted, exactly as n8n does. */
.wr-ndv-field.is-default .wr-ndv-value { color: ${NDV_LIGHT.muted}; }
.wr-ndv-expression {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  background: ${NDV_LIGHT.expressionBg};
  border: 1px solid ${NDV_LIGHT.expressionBorder};
  border-radius: 4px;
  padding: 2px 6px;
}
.wr-ndv-children { margin-left: ${NDV_NEST_INDENT}px; }
.wr-ndv-toggle { width: 34px; height: 18px; border-radius: 9px; background: #c6ccd4; position: relative; }
.wr-ndv-toggle[data-on='true'] { background: #29a360; }
.wr-ndv-toggle::after {
  content: '';
  position: absolute;
  top: 2px; left: 2px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #fff;
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
  color: ${NDV_LIGHT.text};
  background: ${NDV_LIGHT.fieldBg};
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  cursor: pointer;
}
.wr-ndv-copy:hover {
  border-color: rgba(0, 0, 0, 0.25);
}
.wr-ndv-note {
  font-size: 12px;
  color: ${NDV_LIGHT.label};
  border: 1px dashed rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 12px;
}
`;
