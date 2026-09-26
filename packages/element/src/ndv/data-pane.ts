/**
 * A data pane: what a node received, or what it produced.
 *
 * Schema, Table and JSON, as n8n offers, opening on Schema. Everything shown
 * comes from the execution export — no fetching, no re-running — and binary is
 * named, never loaded.
 */
import { NDV_PAGE_SIZE, NDV_RUN_OPTION_LABEL } from 'workflow-render-core';
import { html, type TemplateResult } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import type { DataPaneModel } from 'workflow-render-core';

export type DisplayMode = 'schema' | 'table' | 'json';

/** The marker n8n puts beside a field name to show its type. */
function typeMarker(value: unknown): string {
  if (value === null) return 'N';
  if (Array.isArray(value)) return 'A';
  switch (typeof value) {
    case 'string':
      return 'T';
    case 'number':
      return '#';
    case 'boolean':
      return 'B';
    case 'object':
      return 'O';
    default:
      return '?';
  }
}

/** One line's worth of a value: the leaf itself, or a count for a container. */
function preview(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') {
    const n = Object.keys(value as Record<string, unknown>).length;
    return `${n} field${n === 1 ? '' : 's'}`;
  }
  return String(value);
}

/**
 * Field rows for one item, nested a few levels deep and no further.
 *
 * The key rides in a pill carrying its type marker, which is the shape n8n
 * gives a schema row. n8n draws a small pictogram in that slot; this draws the
 * type's initial instead, in the same 12px muted slot -- an original mark
 * rather than a copy of their icon set.
 */
function schemaRows(value: unknown, query: string, depth = 0): TemplateResult[] {
  if (depth > 3 || value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const nested = schemaRows(child, query, depth + 1);
    // A branch stays when a descendant matches, or filtering would hide the
    // only context that makes the match readable.
    const hay = `${key} ${preview(child)}`.toLowerCase();
    if (query && !hay.includes(query) && nested.length === 0) return [];
    return [
      html`<div class="wr-ndv-schema-row" style=${styleMap({ paddingLeft: `${depth * 16}px` })}>
        <span class="wr-ndv-chip">
          <span class="wr-ndv-type-icon">${typeMarker(child)}</span>
          <span class="wr-ndv-chip-key">${key}</span>
        </span>
        <span class="wr-ndv-schema-value">${preview(child)}</span>
      </div>`,
      ...nested,
    ];
  });
}

/**
 * The magnifier beside a pane's search field.
 *
 * Drawn here as a circle and a stroke rather than pulled from an icon set: it
 * is two primitives, and it keeps the panel free of another asset dependency.
 */
const searchIcon = (): TemplateResult => html`
  <svg
    class="wr-ndv-search-icon"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <circle cx="7" cy="7" r="4.5"></circle>
    <line x1="10.5" y1="10.5" x2="14" y2="14"></line>
  </svg>
`;

/**
 * The shape of the data rather than all of it.
 *
 * This is what n8n opens a pane on, and for a snapshot it is the most readable
 * of the three: a wide table forces horizontal scrolling before you know what
 * the fields even are. Built from the first item, since a run's items share a
 * shape.
 */
function schema(pane: DataPaneModel, query: string): TemplateResult {
  const rows = schemaRows(pane.items[0]?.json, query);
  if (rows.length > 0) return html`<div class="wr-ndv-schema">${rows}</div>`;
  return html`<div class="wr-ndv-note">
    ${query ? `No field matches "${query}".` : 'No fields to show.'}
  </div>`;
}

export interface PaneOptions {
  side: 'input' | 'output';
  mode: DisplayMode;
  page: number;
  /** Lower-cased, or empty when the pane is unfiltered. */
  query: string;
  onMode: (mode: DisplayMode) => void;
  onPage: (page: number) => void;
  onQuery: (query: string) => void;
}

/** Rows the search leaves standing: a row matches on any of its cells. */
function matching(pane: DataPaneModel, query: string): Array<Record<string, string>> {
  if (!query) return pane.table.rows;
  return pane.table.rows.filter((row) =>
    Object.values(row).some((cell) => cell.toLowerCase().includes(query)),
  );
}

function table(pane: DataPaneModel, page: number, query: string): TemplateResult {
  const start = page * NDV_PAGE_SIZE;
  const rows = matching(pane, query).slice(start, start + NDV_PAGE_SIZE);
  return html`
    <table class="wr-ndv-table">
      <thead>
        <tr>
          ${pane.table.columns.map((column) => html`<th>${column}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${rows.map(
          (row) => html`<tr>
            ${pane.table.columns.map((column) => html`<td>${row[column] ?? ''}</td>`)}
          </tr>`,
        )}
      </tbody>
    </table>
    ${pane.table.truncatedColumns > 0
      ? html`<div class="wr-ndv-note">
          ${pane.table.truncatedColumns} more column${pane.table.truncatedColumns === 1 ? '' : 's'} not shown
        </div>`
      : ''}
  `;
}

function pager(
  pane: DataPaneModel,
  page: number,
  query: string,
  onPage: (page: number) => void,
): TemplateResult | string {
  // Page over what the filter left, not the whole run: otherwise a search that
  // matches three rows still offers nine empty pages.
  const pages = Math.ceil(matching(pane, query).length / NDV_PAGE_SIZE);
  if (pages <= 1) return '';
  return html`
    <div class="wr-ndv-pager">
      <button type="button" ?disabled=${page === 0} @click=${() => onPage(page - 1)}>‹</button>
      <span>Page ${page + 1} of ${pages}</span>
      <button type="button" ?disabled=${page >= pages - 1} @click=${() => onPage(page + 1)}>›</button>
    </div>
  `;
}

function body(pane: DataPaneModel, options: PaneOptions): TemplateResult {
  if (pane.error) {
    return html`
      <div class="wr-ndv-error">
        <p class="wr-ndv-error-message">${pane.error.message}</p>
        ${pane.error.description ? html`<p class="wr-ndv-error-detail">${pane.error.description}</p>` : ''}
        ${pane.error.stack
          ? html`<details class="wr-ndv-error-stack">
              <summary>Stack trace</summary>
              <pre>${pane.error.stack}</pre>
            </details>`
          : ''}
      </div>
    `;
  }

  if (pane.items.length === 0) {
    return html`<div class="wr-ndv-note">This run produced no items.</div>`;
  }

  if (options.mode === 'json') return html`<pre class="wr-ndv-json">${pane.jsonText}</pre>`;
  if (options.mode === 'schema') return schema(pane, options.query);
  return html`<div class="wr-ndv-table-wrap">
    ${table(pane, options.page, options.query)}${pager(pane, options.page, options.query, options.onPage)}
  </div>`;
}

/** A pane for a node that never ran — n8n says so rather than showing nothing. */
export function renderMissingPane(side: 'input' | 'output'): TemplateResult {
  return html`
    <section class="wr-ndv-pane wr-ndv-pane-${side}">
      <header class="wr-ndv-pane-header"><span class="wr-ndv-pane-title">${side.toUpperCase()}</span></header>
      <div class="wr-ndv-note">Did not execute</div>
    </section>
  `;
}

/**
 * A side pane for a workflow that carries no run data at all.
 *
 * Distinct from `renderMissingPane`, which means "this node did not run in this
 * execution". Here there was no execution: n8n offers "Execute previous nodes"
 * at this spot, and a snapshot cannot, so it says what it has instead of
 * showing a control that would do nothing.
 */
export function renderEmptyPane(side: 'input' | 'output'): TemplateResult {
  return html`
    <section class="wr-ndv-pane wr-ndv-pane-${side}">
      <header class="wr-ndv-pane-header"><span class="wr-ndv-pane-title">${side.toUpperCase()}</span></header>
      <div class="wr-ndv-note">No ${side} data in this snapshot</div>
    </section>
  `;
}

export function renderDataPane(pane: DataPaneModel, options: PaneOptions): TemplateResult {
  const shown = options.query ? matching(pane, options.query).length : pane.items.length;
  const count =
    options.query && shown !== pane.items.length
      ? `${shown} of ${pane.items.length} items`
      : `${pane.items.length} ${pane.items.length === 1 ? 'item' : 'items'}`;
  return html`
    <section class="wr-ndv-pane wr-ndv-pane-${options.side}">
      ${pane.pinned
        ? html`<div class="wr-ndv-pinned">This data is pinned in the workflow, not from a run.</div>`
        : ''}
      <header class="wr-ndv-pane-header">
        <span class="wr-ndv-pane-title">${options.side.toUpperCase()}</span>
        <label class="wr-ndv-search">
          ${searchIcon()}
          <input
            type="search"
            .value=${options.query}
            placeholder="Search"
            aria-label="Search ${options.side} data"
            @input=${(event: Event) =>
              options.onQuery((event.target as HTMLInputElement).value.trim().toLowerCase())}
          />
        </label>
        <span class="wr-ndv-modes">
          ${(['schema', 'table', 'json'] as DisplayMode[]).map(
            (mode) => html`<button
              type="button"
              data-mode=${mode}
              aria-selected=${String(options.mode === mode)}
              @click=${() => options.onMode(mode)}
            >
              ${mode === 'schema' ? 'Schema' : mode === 'table' ? 'Table' : 'JSON'}
            </button>`,
          )}
        </span>
      </header>
      <div class="wr-ndv-pane-count">${count}</div>
      <div class="wr-ndv-pane-body">${body(pane, options)}</div>
    </section>
  `;
}

/** The run selector n8n shows when a node ran more than once. */
export function renderRunSelector(
  runCount: number,
  runIndex: number,
  itemsPerRun: number[],
  onRun: (index: number) => void,
): TemplateResult | string {
  if (runCount <= 1) return '';
  return html`
    <div class="wr-ndv-runs">
      <label>Run</label>
      <select
        @change=${(event: Event) => onRun(Number((event.target as HTMLSelectElement).value))}
        .value=${String(runIndex)}
      >
        ${Array.from({ length: runCount }, (_, index) => index).map(
          (index) => html`<option value=${String(index)} ?selected=${index === runIndex}>
            ${NDV_RUN_OPTION_LABEL(index + 1, runCount, itemsPerRun[index] ?? 0)}
          </option>`,
        )}
      </select>
    </div>
  `;
}
