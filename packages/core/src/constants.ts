/**
 * Layout and visual constants for the renderer.
 *
 * These are this project's own values. They produce a canvas that reads the way
 * a workflow canvas should — left-to-right flow, tiles on a grid, curved edges
 * between ports — which is a convention of the category rather than any one
 * product's design.
 *
 * There is no longer a provenance vocabulary here. `measured` and `provisional`
 * tracked whether a value had been checked against a captured reference, and
 * that target is retired: measured against what? A value is right when the
 * canvas reads well, which a golden diff and a human eye settle between them.
 */

import { EMULATED_VERSION } from 'workflow-render-assets/version';

/**
 * The n8n release whose node descriptions are bundled. Stamped onto every SVG.
 * Derived from the assets package so the two cannot drift; `version.test.ts`
 * checks it against the committed `meta.json` as well.
 */
export const DESCRIPTIONS_VERSION: string = EMULATED_VERSION;

/** Side length of a regular node tile. */
export const NODE_SIZE = 96; // measured: tile box 96x96 on a live canvas
/** Corner radius of a regular node tile. */
export const NODE_RADIUS = 8; // measured: border-radius 8px

/**
 * The halo n8n draws around a selected node.
 *
 * Measured 2026-09-13 off a real n8n 2.38.3 canvas, by reading the computed
 * style of a genuinely selected node and diffing it against an unselected one:
 * the only difference is `box-shadow: 0 0 0 6px rgba(41, 65, 112, 0.1)`. No
 * offset, no blur, pure spread -- so it sits entirely outside the tile edge and
 * its corners follow the tile's radius grown by the same 6px.
 *
 * A tile is SVG, where box-shadow does not exist, so the equivalent is a path
 * expanded by half the width and stroked at the full width: the stroke then
 * straddles that path to cover exactly 0..6px outside the tile.
 */
export const SELECTION_RING_WIDTH = 6;

/** Overlay: the ring an annotated node wears, and the count badge at its top-right corner. */
export const OVERLAY_RING_WIDTH = 4;
export const OVERLAY_BADGE_SIZE = 18;
export const OVERLAY_BADGE_FONT_SIZE = 11;
export const OVERLAY_COLORS = { error: '#e5484d', warn: '#f5a623', info: '#3b82f6' } as const;
export const SELECTION_RING_COLOR = 'rgba(41, 65, 112, 0.1)';

/**
 * The marquee rectangle, measured in the same session by dragging a real
 * selection box and sampling it while it was on screen (three samples, the last
 * two matching the 320x100 drag exactly, which is what proves it was really
 * rendered rather than a synthetic artifact). Square corners.
 */
export const SELECTION_BOX_FILL = 'rgba(0, 89, 220, 0.08)';
export const SELECTION_BOX_STROKE = 'rgba(0, 89, 220, 0.8)';
export const SELECTION_BOX_STROKE_WIDTH = 1;
export const SELECTION_BOX_STROKE_STYLE = 'dotted';
/** Corner radius on the leading edge of a trigger tile (its rounded "nose"). */
export const TRIGGER_RADIUS = 36; // measured: trigger border-radius 36px 8px 8px 36px
/** Side length of a sub-node (LLM / tool / memory) tile; drawn as a circle. */
export const SUB_NODE_SIZE = 80; // measured: 80x80, radius 40px
/** Width of a node that accepts ai_* sub-node inputs (an agent). */
export const CONFIGURABLE_NODE_WIDTH = 224; // measured: AI Agent tile 224x96
/** Stroke width of a node tile's border. */
export const NODE_BORDER_WIDTH = 1.5; // measured
/** Canvas grid unit. n8n renders node positions snapped to this grid. */
export const GRID = 16; // measured: fixture x=220 rendered at x=224
/** Vertical spacing between two adjacent ports on the same side. */
export const PORT_OFFSET_Y = 32; // measured: IF outputs 32px apart, centred on the tile
/** Radius of the port dot drawn at each connection point. */
export const PORT_DOT_RADIUS = 8; // measured: 16x16 handle
/** Stroke width of a connector. */
export const EDGE_WIDTH = 2; // measured
/** Corner radius where a connector turns. */
export const EDGE_CORNER_RADIUS = 16; // measured 2.38.3: each Q turn spans 16px
/**
 * How far a backwards connector reaches out of a port before its vertical run.
 *
 * This is the *total* offset to the vertical line: `orthogonalBack` places the
 * turn at `p0.x + EDGE_BACK_STUB` and spends EDGE_CORNER_RADIUS of it rounding
 * the corner, so the visible straight segment is the difference.
 *
 * Measured 2026-09-13 at 2.38.3: n8n draws 24px of straight and then a 16px
 * corner, putting its vertical line 40px out. Briefly set to 24 by reading the
 * straight segment alone, which left only 8px of straight once the corner took
 * its share -- caught by comparing the rendered path against n8n's.
 */
export const EDGE_BACK_STUB = 40;
/** Dash pattern of an ai_* connector. */
export const AI_EDGE_DASH = '5 6'; // measured: stroke-dasharray 5px, 6px

// --- execution view (measured 2026-08-30 from real scheduled runs) ----------

/** Border width of a node that ran successfully — n8n thickens it. */
export const STATUS_BORDER_WIDTH_SUCCESS = 2; // measured
/** Border width of a node that failed — unchanged from idle. */
export const STATUS_BORDER_WIDTH_ERROR = 1.5; // measured
/** Size of the status glyph drawn inside a node that ran. */
export const STATUS_GLYPH_SIZE = 16; // measured
/** Inset of the status glyph from the tile's bottom-right corner. */
export const STATUS_GLYPH_INSET = 16; // measured: glyph centre at (right-16, bottom-16)
/** Font size of an edge's item-count label. */
export const EDGE_LABEL_FONT_SIZE = 13; // measured
/** Gap between an output port's dot and the label n8n prints beside it. */
export const PORT_LABEL_GAP = 6; // measured: `done` / `loop` start ~6px right of the dot
/** Opacity of the block behind an edge label. */
export const EDGE_LABEL_BG_OPACITY = 0.85; // measured
/**
 * n8n writes "5 items total" on an edge leaving a node that ran more than once
 * — the count is across all its runs, and the wording says so.
 */
export const EDGE_LABEL_TOTAL_SUFFIX = ' total'; // measured: SplitInBatches loop

/** Side length of the icon drawn inside a node tile. */
export const ICON_SIZE = 40; // measured: 40x40 inside a 96 tile
/** Icon side length on a sub-node. */
export const SUB_ICON_SIZE = 30; // measured

/**
 * The node name is laid out in a box twice the tile's width, centred on it, and
 * wraps inside that box. Not accounting for this is why long names used to run
 * off the canvas.
 */
export const LABEL_WIDTH = 192; // measured: 2 x tile width
/** Line box height of the node name. */
export const LABEL_LINE_HEIGHT = 20; // measured

/** Canvas dot-grid spacing, dot radius and colours. */
export const DOT_SPACING = 16; // measured: pattern is GRID x GRID
export const DOT_RADIUS = 0.5; // measured
/** Phase of the dot pattern; n8n offsets it so dots sit between grid lines. */
export const DOT_PHASE = -9; // measured: pattern patternTransform translate(-9,-9)

/*
 * There is no hatch constant here any more.
 *
 * A diagonal hatch used to be drawn under an execution, on the claim that n8n
 * changes the ground for a run. Checked against a real 2.38.3 on 2026-09-13:
 * the hatch is n8n's read-only *preview* canvas, and it shows up there on a
 * plain workflow with no execution at all. It never meant "this is a run", so
 * both views share the one dot grid.
 */

/** Arrowhead drawn at the target end of a connector. */
export const ARROW_SIZE = 12.5; // measured: markerWidth/markerHeight
export const ARROW_VIEWBOX = '-10 -10 20 20'; // measured
export const ARROW_POINTS = '-5,-4 0,0 -5,4 -5,-4'; // measured: chevron polyline
export const ARROW_STROKE_WIDTH = 2; // measured

/**
 * n8n tints a node's glyph by the `iconColor` name in its description.
 *
 * All 25 measured 2026-09-13 from a running n8n 2.38.3, by resolving its own
 * `--node--icon--color--<name>` custom properties. Reading the tokens beats
 * sampling rendered nodes: the tint reaches a glyph through inheritance, so
 * every rendered `<svg>` reports the inherited default rather than its colour.
 *
 * This table previously held twelve names, of which six had drifted since they
 * were taken against 2.10.0 (black, gray, green, orange-red, red, and the
 * guessed crimson) and thirteen were missing entirely -- so roughly 24 node
 * types drew in the fallback tint. `icon-colors.test.ts` now checks the table
 * against the bundle rather than against itself, so the next new name fails
 * loudly instead of rendering grey.
 */
export const ICON_COLORS: Record<string, string> = {
  amber: '#ff9922',
  azure: '#54b8c9',
  black: '#323232',
  blue: '#3a42e9',
  crimson: '#772244',
  'dark-blue': '#353f6e',
  'dark-green': '#157562',
  emerald: '#2fb67c',
  'forest-green': '#44aa44',
  gray: '#7d7d87',
  green: '#00786f',
  lavender: '#8287eb',
  'light-blue': '#5fabf7',
  'light-green': '#31c4ab',
  lime: '#62f730',
  magenta: '#e91e63',
  neutral: '#bbbbbb',
  'orange-red': '#ff6900',
  'pink-red': '#ea4b71',
  purple: '#553399',
  red: '#e7000b',
  rust: '#e44d26',
  'sky-blue': '#5699ff',
  teal: '#00b7bc',
  violet: '#9b6dd5',
};

/** Fallback tint when a node names no icon colour. */
export const ICON_COLOR_DEFAULT = '#2b2b2b'; // measured: plain text colour

/** The muted line n8n prints under a node's name. */
export const SUBTITLE_FONT_SIZE = 13; // measured
/**
 * The box n8n ellipsises a subtitle inside -- read off the live 2.10.0 canvas:
 * the subtitle element lays out at exactly 192 CSS px with `text-overflow:
 * ellipsis`, the same width as the node name's box.
 *
 * An earlier value of 196 was inferred from the reference capture on the
 * assumption that our own text measurement matched the browser's. It did not:
 * the advances were being read from the bundled static Inter rather than the
 * InterVariable n8n renders, which overstated every string.
 */
export const SUBTITLE_WIDTH = 192; // measured: subtitle element offsetWidth on 2.10.0
export const SUBTITLE_LINE_HEIGHT = 16.25; // measured
export const SUBTITLE_GAP = 4; // measured: 31 below the tile, under a 20px name line
/**
 * Ascent fraction implied by the fitted NAME_BASELINE (15 = half-leading 2 +
 * 0.8125 x 16), reused so the subtitle sits consistently with the name.
 */
export const NAME_ASCENT_RATIO = 0.8125; // measured: derived from the name fit

/** The lightning mark n8n puts beside a trigger node. */
export const TRIGGER_BOLT_SIZE = 16; // measured
export const TRIGGER_BOLT_OFFSET_X = -32; // measured: left of the tile
export const TRIGGER_BOLT_COLOR = '#ff6f5c'; // measured

/** Font size of the node name rendered below the tile. */
export const NAME_FONT_SIZE = 16; // measured
/** Font weight of the node name. */
export const NAME_FONT_WEIGHT = 500; // measured
/** Gap between the tile bottom and the top of the node name. */
export const NAME_GAP = 7; // measured: label box top - tile bottom
/**
 * Distance from the top of the name's line box down to its text baseline.
 * n8n gets this from CSS line-height half-leading plus the font ascent; we
 * position SVG text explicitly, so the value was fitted by pixel-comparing
 * renders against screenshots of a live canvas (a harness since retired)
 * rather than derived from font metrics we do not have.
 */
export const NAME_BASELINE = 15; // fitted: best pixel agreement at 15 (1.58%), against 14 (1.61%) and 16 (1.68%)

/** n8n appends this to the name of a deactivated node. */
export const DISABLED_SUFFIX = ' (Deactivated)'; // measured: branching "Skip (Deactivated)"

/**
 * n8n renders in InterVariable. workflow-render does not bundle a font (it would blow
 * the offline bundle budget), so this stack falls back to the host's UI font.
 * Glyph metrics therefore differ slightly from the reference; bundling a subset
 * is a later-phase decision.
 */
// Deliberate, not provisional. n8n 2.38.3 resolves to `InterVariable,
// sans-serif`; this keeps the longer fallback chain because an embed on someone
// else's page cannot count on Inter being present.
export const FONT_STACK =
  "InterVariable, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Horizontal bezier control-point reach for a connector spanning `dx`.
 *
 * Measured 2026-09-13 at 2.38.3: both control points sit on the horizontal
 * midpoint, so the reach is exactly dx/2 -- checked on a level connector and on
 * one dropping 272px, which agreed. The 40px floor is fitted, not measured: it
 * only takes effect for a dx too small to have been exercised.
 */
export const EDGE_CTRL = (dx: number): number => Math.max(Math.abs(dx) / 2, 40);

/**
 * Extra drop below the lower node when a connector loops backwards.
 *
 * Measured 2026-09-13 at 2.38.3 from a loop-back between two tiles on the same
 * row: the run home sat 82px below their bottom edge. One geometry only -- if a
 * loop-back between tiles on *different* rows looks wrong, measure that too.
 */
export const LOOPBACK_DROP = 82;

/** Height of a node tile with `outputs` output ports. */
export function nodeHeight(outputs: number): number {
  // measured: 1-2 outputs -> 96, 3 outputs -> 128 (Route), i.e. ports*32 + 32.
  return Math.max(NODE_SIZE, outputs * PORT_OFFSET_Y + PORT_OFFSET_Y);
}

// --- canvas interaction (measured 2026-08-30 by driving the real canvas) ----
//
// The viewer is expected to behave like n8n's canvas, not merely to look like
// it, so the input model is part of the fidelity contract too.

/** Fraction of a wheel delta applied as a pan. */
export const WHEEL_PAN_SPEED = 0.5; // measured: deltaY 120 panned 60px
/** Zoom multiplier for one zoom-in step (button or keyboard). */
export const ZOOM_STEP = 1.2; // measured: one zoom-in click 1.0 -> 1.2
/** Zoom multiplier applied by a double-click on empty canvas. */
export const DOUBLE_CLICK_ZOOM = 2; // measured: 1.0 -> 2.0
/** Absolute zoom ceiling. */
export const MAX_SCALE = 4; // measured: the zoom-in button stops dead at 4
/**
 * Absolute zoom floor. Thirty zoom-out clicks never hit one (they reached
 * 0.017), so n8n is effectively unbounded below; this is a sane stopping point.
 */
export const MIN_SCALE = 0.01; // measured: no floor observed

// --- NDV / inspector (measured from screenshots of the live NDV) ------------

/** Inset of the NDV from the viewport edge. */
export const NDV_INSET = 24; // measured: root 1552x893 at (24,24)
/** The modal backdrop: black at this opacity over the canvas. */
export const NDV_BACKDROP_OPACITY = 0.8; // measured: composites to #333 over #fcfcfc
/** Width of the parameters pane, padding included. */
export const NDV_PANEL_WIDTH = 419; // measured
export const NDV_PANEL_PADDING_X = 16; // measured: 419 - 2*16 = 387 field width
export const NDV_PANEL_PADDING_BOTTOM = 24; // measured
/** A parameter row: label above, control below, gap to the next row. */
/**
 * Parameter row metrics.
 *
 * Fitted by eye against screenshots of current n8n, not measured. The earlier
 * values (label 16/24, field 30) were measured from 2.10.0, whose panel has
 * since been redesigned: labels are smaller and darker now, and the field boxes
 * taller with a firmer border. Refitting beats keeping a number that is precise
 * about a version nobody is looking at.
 */
export const NDV_LABEL_FONT_SIZE = 13; // fitted
export const NDV_LABEL_FONT_WEIGHT = 400; // fitted
export const NDV_LABEL_HEIGHT = 20; // fitted
export const NDV_FIELD_HEIGHT = 38; // fitted
export const NDV_ROW_GAP = 12; // measured: row bottom to next row top
/** Indent applied to a collection's members. */
export const NDV_NEST_INDENT = 16; // measured: Options members at x+16
/** The Parameters | Settings | JSON tab strip. */
export const NDV_TAB_HEIGHT = 26; // measured
// Re-measured 2026-09-13 against 2.38.3: the tab label is 12px/600, not the
// 16px/500 taken from 2.10.0. The old values came from a real capture too --
// the strip simply changed between releases.
export const NDV_TAB_FONT_SIZE = 12;
export const NDV_TAB_FONT_WEIGHT = 600;
/** Padding is asymmetric: the idle tab takes back the 2px the underline costs. */
export const NDV_TAB_PADDING_X = 16;
export const NDV_TAB_PADDING_BOTTOM_ACTIVE = 12;
export const NDV_TAB_PADDING_BOTTOM_IDLE = 14;

/*
 * NDV chrome, measured 2026-09-13 from a real n8n 2.38.3.
 *
 * Read off a live NDV driven in the unauthenticated preview canvas: a node was
 * opened, and pinned data was posted with the workflow so the panes carried
 * real rows -- the search field, the display-mode control, the item count and
 * the schema chips only exist once a pane has data.
 *
 * Computed colours in 2.38.3 come back as lab()/oklch(), so each was resolved
 * to sRGB through a canvas rather than eyeballed from a screenshot.
 */
export const NDV_TAB_ACCENT = 'rgb(255, 105, 0)';
export const NDV_TAB_IDLE_COLOR = 'rgb(68, 68, 68)';
export const NDV_TAB_UNDERLINE_WIDTH = 2;

/** The pane ground, and the muted item count beneath a pane header. */
export const NDV_COUNT_COLOR = 'rgb(115, 115, 115)';
export const NDV_COUNT_FONT_SIZE = 13;

/** The search field above a pane's rows. */
export const NDV_SEARCH_HEIGHT = 28;
export const NDV_SEARCH_FONT_SIZE = 13;
export const NDV_SEARCH_GAP = 8;
export const NDV_SEARCH_RADIUS = 4;
export const NDV_ICON_MUTED = 'rgb(153, 153, 153)';
export const NDV_SEARCH_ICON_SIZE = 16;

/**
 * A schema row's key chip. n8n draws a white pill carrying a small type glyph
 * and the key, not the flat grey square this once had.
 */
export const NDV_CHIP_HEIGHT = 24;
export const NDV_CHIP_RADIUS = 4;
export const NDV_CHIP_BG = 'rgb(255, 255, 255)';
export const NDV_CHIP_BORDER = 'rgb(240, 240, 240)';
export const NDV_CHIP_TEXT = 'rgb(38, 38, 38)';
export const NDV_CHIP_PADDING_X = 6;
export const NDV_TYPE_ICON_SIZE = 12;
export const NDV_SCHEMA_ROW_GAP = 8;
export const NDV_SCHEMA_VALUE_COLOR = 'rgb(68, 68, 68)';

/** The callout shown over a pane whose data is pinned rather than executed. */
export const NDV_PINNED_BG = 'rgb(221, 214, 255)';
export const NDV_PINNED_TEXT = 'rgb(127, 34, 254)';
export const NDV_CALLOUT_PADDING = 12;

/** The grab strip between the parameters column and a side pane. */
export const NDV_RESIZE_HANDLE_WIDTH = 4;

export interface NdvTokens {
  panelBg: string;
  inputPanelBg: string;
  fieldBg: string;
  label: string;
  /** Parameter row labels, darker than the pane titles that share `label`. */
  fieldLabel: string;
  text: string;
  /** Value shown because it is the type's default, not because it was set. */
  muted: string;
  expressionBg: string;
  expressionBorder: string;
}

export const NDV_LIGHT: NdvTokens = {
  panelBg: '#fcfcfc', // measured
  inputPanelBg: '#f5f5f5', // measured
  fieldBg: '#ffffff', // measured
  label: '#757575', // measured
  fieldLabel: '#4a4a4a', // fitted
  text: '#2b2b2b', // measured
  muted: '#999999', // measured 2.38.3: --color--text--tint-1, and the search placeholder
  // n8n tints an expression chip by whether it resolved: green when valid, red
  // when not, grey while pending. A snapshot never resolves anything, so the
  // pending grey is the honest one -- the lavender here before was a guess.
  expressionBg: '#f5f5f5', // measured 2.38.3: expression-editor pending background
  expressionBorder: '#e5e5e5', // deliberate: n8n draws no border on the chip; a hairline keeps it legible
};

// --- execution NDV data panes (measured 2026-08-30 from a real run) --------
//
// Measured at the NDV's own width of 1552: input 565 | parameters 419 | output
// 564. The side panes split whatever the parameters pane leaves.

export const NDV_INPUT_PANE_WIDTH = 565; // measured
export const NDV_OUTPUT_PANE_WIDTH = 564; // measured
/** Table | JSON toggle in a data pane's header. */
export const NDV_DATA_TOGGLE_HEIGHT = 26; // measured
/** Data table metrics. */
export const NDV_TABLE_HEADER_HEIGHT = 32; // measured
export const NDV_TABLE_ROW_HEIGHT = 23; // measured
export const NDV_TABLE_FONT_SIZE = 12; // measured
export const NDV_TABLE_HEADER_WEIGHT = 700; // measured
export const NDV_TABLE_CELL_PADDING = '4px 6px'; // measured
/**
 * How many items a data pane shows before paging. Ours, not n8n's: n8n scrolls
 * a run rather than paging it, and a paged snapshot is the readable answer for
 * a viewer with no virtual scroller.
 */
export const NDV_PAGE_SIZE = 25;

/**
 * The run selector shown when a node ran more than once. Measured from a
 * SplitInBatches loop (5 items, batches of 2 -> runs of 2, 2 and 1): options
 * read "<run> of <total> (<n> items)", and the selected one is accented.
 */
export const NDV_RUN_OPTION_LABEL = (run: number, total: number, items: number): string =>
  `${run} of ${total} (${items} ${items === 1 ? 'item' : 'items'})`; // measured
export const NDV_RUN_SELECTED_COLOR = '#ff6f5c'; // measured
export const NDV_RUN_OPTION_FONT_SIZE = 14; // measured

/** The JSON display mode in a data pane. */
export const NDV_JSON_FONT_SIZE = 12; // measured
export const NDV_JSON_LINE_HEIGHT = 20; // measured
export const NDV_JSON_FONT_STACK =
  "Monaco, ui-monospace, SFMono-Regular, Menlo, monospace"; // measured: n8n renders Monaco

/** The error block a failed node shows in its output pane. */
export const NDV_ERROR_HEADING = (nodeName: string): string => `Problem in node ‘${nodeName}‘`; // measured
export const NDV_ERROR_MESSAGE_FONT_SIZE = 14; // measured
export const NDV_ERROR_SECTIONS = ['Error details', 'Stack trace'] as const; // measured: both collapsible

export interface NdvDataTokens {
  headerBg: string;
  headerText: string;
  cellText: string;
  gridLine: string;
  errorBg: string;
  errorBorder: string;
  jsonPunctuation: string;
  jsonKey: string;
  jsonValue: string;
  errorText: string;
}

export const NDV_DATA_LIGHT: NdvDataTokens = {
  headerBg: '#f5f5f5', // measured
  headerText: '#2b2b2b', // measured
  cellText: '#757575', // measured
  gridLine: '#e0e0e0', // measured
  errorBg: '#fef2f2', // measured 2.38.3: --callout--color--background--danger
  errorBorder: '#ffe2e2', // measured 2.38.3: --callout--border-color--danger
  jsonPunctuation: '#4438a3', // measured
  jsonKey: '#2b2b2b', // measured
  jsonValue: '#757575', // measured
  errorText: '#2b2b2b', // measured
};

export interface StickyPalette {
  bg: string;
  border: string;
}

/**
 * Custom sticky colours.
 *
 * A sticky's colour field carries either one of the palette indices above or a
 * `#RRGGBB` string. A hex gives the background only, so the other two values
 * are derived from it: the border darkens each channel, and the text flips
 * between dark and light around a luminance threshold so the content stays
 * readable on a saturated ground.
 */
export const STICKY_CUSTOM_BORDER_SCALE = 0.8;
export const STICKY_CONTRAST_THRESHOLD = 0.179;
export const STICKY_TEXT_DARK = '#2b2b2b';
export const STICKY_TEXT_LIGHT = '#f5f5f5';

/**
 * Sticky content typography. n8n renders the markdown as HTML, so these are the
 * resolved values for the elements a sticky actually produces.
 */
export const STICKY_PAD_X = 13; // measured: text left edge inside the sticky
export const STICKY_PAD_Y = 9; // measured: first line box top
// Measured 2026-09-13 at 2.38.3: 26/20, 23.4/18 and 20.8/16 all give 1.3.
// (1.35 came from 2.10.0's 32.4/24.) Body text shares the ratio; it was not
// isolated separately, so if body leading ever looks wrong, measure it alone.
export const STICKY_LINE_RATIO = 1.3;
export const STICKY_BODY_SIZE = 14; // measured
/** Height of an image block inside a sticky. Provisional: not measured. */
export const STICKY_IMAGE_HEIGHT = 96;
/**
 * Measured 2026-09-13 at 2.38.3, from a sticky carrying all three levels.
 * Every one moved: h2 was 24 at 2.10.0 and the outer two were guessed from it.
 */
export const STICKY_HEADING_SIZES: Record<number, number> = {
  1: 20, // measured: 20px / 26px line
  2: 18, // measured: 18px / 23.4px line (was 24 at 2.10.0)
  3: 16, // measured: 16px / 20.8px line
};
export const STICKY_HEADING_WEIGHT = 600; // measured
export const STICKY_BODY_WEIGHT = 400; // measured (strong runs use 600)
/**
 * Where a line's baseline sits inside its line box, as a fraction of the font
 * size. A single pixel offset cannot serve both a 24px heading and 14px body,
 * so the offset is derived per line: half-leading + this ascent fraction.
 * Fitted by pixel-comparing against a screenshot of a live sticky, since we do
 * not ship font metrics.
 */
export const STICKY_ASCENT_RATIO = 0.85; // measured: fitted (1.48% at 0.85; 1.51 either side)

export const STICKY_RADIUS = 4; // measured
export const STICKY_BORDER_WIDTH = 1; // measured

/** n8n's seven sticky colours in the light theme, by the workflow's 1-based index. */
export const STICKY_COLORS: Record<number, StickyPalette> = {
  1: { bg: '#fff5d6', border: '#ffe48a' }, // measured
  2: { bg: '#f7e3c4', border: '#efc381' }, // measured
  3: { bg: '#fcdadd', border: '#f7abb1' }, // measured
  4: { bg: '#d6f5e3', border: '#85e0ac' }, // measured
  5: { bg: '#ddebf8', border: '#b2d1f0' }, // measured
  6: { bg: '#e6e4f6', border: '#c3bee9' }, // measured
  7: { bg: '#f9f9f9', border: '#e0e0e0' }, // measured
};

export const DEFAULT_STICKY_COLOR = 1;
export const DEFAULT_STICKY_WIDTH = 240;
export const DEFAULT_STICKY_HEIGHT = 160;

export interface ThemeTokens {
  canvasBg: string;
  nodeBg: string;
  nodeBorder: string;
  nodeBorderDisabled: string;
  portBorder: string;
  text: string;
  textMuted: string;
  subtitle: string;
  edge: string;
  edgeAi: string;
  dot: string;
  error: string;
  success: string;
  labelBg: string;
}

export const LIGHT: ThemeTokens = {
  canvasBg: '#f5f5f5', // measured: the canvas ground, sampled as exactly 245,245,245
  nodeBg: '#ffffff', // measured
  nodeBorder: 'rgba(0,0,0,0.1)', // measured
  nodeBorderDisabled: '#e0e0e0', // measured
  portBorder: '#989898', // measured
  text: '#2b2b2b', // measured
  textMuted: '#757575', // measured: item-count labels
  subtitle: '#949494', // measured: the node subtitle line
  edge: '#cacaca', // measured
  edgeAi: '#cacaca', // measured: ai edges use the same stroke, dashed
  dot: '#828282', // measured: canvas dot grid
  error: '#ea1f30', // measured: failed node border and glyph
  success: '#29a360', // measured: successful node border, glyph and edges
  labelBg: '#f4f4f4', // measured: edge label background (at 0.85 alpha in n8n)
};

/**
 * Known fidelity gaps observed against the live canvas, each measured but not
 * yet implemented. Listed here so they are tracked rather than forgotten.
 *
 * - node subtitles under the name ("GET: https://…", "manual"), muted grey
 * - mid-edge arrowheads on main connectors
 * - the canvas dot grid
 * - in the execution view n8n also prints the run's item count under the node
 * - subtitles whose expression is not a plain parameter/literal concatenation
 *   (ternaries, method calls) are left unrendered rather than guessed
 *
 * Deliberate workflow-render additions, not n8n elements (spec 2.2 asks for them):
 * the execution status header chip — in n8n that information lives in the
 * surrounding page chrome, which a standalone SVG does not have.
 *
 * Deliberate interaction deviations, both forced by what workflow-render is:
 * - left-drag pans. n8n draws a selection rectangle, but a read-only canvas has
 *   nothing to select, and a viewer whose only pan gesture was middle-drag
 *   would be unusable on a plain mouse.
 * - keyboard shortcuts only fire while the element has focus. n8n owns its whole
 *   page; an embedded component must not swallow its host's keystrokes.
 */
/**
 * Where this canvas knowingly differs from n8n's.
 *
 * Checked against the committed goldens on 2026-09-12, which removed three
 * entries that had since been implemented (node subtitles, edge arrowheads and
 * the canvas dot grid all render) and two that only described the retired
 * pixel-comparison harness.
 *
 * Emptied on 2026-09-13. The last two entries were both "styled but
 * unmeasured" -- the selected-node treatment and the marquee -- and both are
 * now measured from a running n8n 2.38.3 rather than guessed. See
 * SELECTION_RING_* and SELECTION_BOX_* above for the values and the method.
 *
 * An empty list is a claim, not an achievement: it means nothing is *known* to
 * differ, which is only as good as the last time someone looked. Add to it
 * freely.
 */
export const KNOWN_GAPS = [] as const;
