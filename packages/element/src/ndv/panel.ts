/**
 * The read-only NDV shell: header, tabs, and the pane for the active tab.
 *
 * Parameters reconstructs the description-driven form; Settings lists the
 * node-level options; JSON shows the node exactly as it appears in the workflow
 * file. The JSON tab is a deliberate workflow-render addition — n8n has no such tab —
 * and is labelled as one rather than passed off as fidelity.
 */
import { html, type TemplateResult } from 'lit';
import type { DataPaneModel, FormModel } from 'workflow-render-core';
import {
  renderDataPane,
  renderEmptyPane,
  renderMissingPane,
  renderRunSelector,
  type DisplayMode,
} from './data-pane.js';
import { renderField } from './fields.js';

/** Injected rather than reached for, so the failure path is testable. */
export interface Clipboard {
  writeText(text: string): Promise<void>;
}

/**
 * Put text on the clipboard, reporting success rather than throwing.
 *
 * Some embedding contexts refuse clipboard access outright, and an insecure
 * origin has no `navigator.clipboard` at all. An embedded viewer must not break
 * its host page over either.
 */
export async function copyText(text: string, clipboard?: Clipboard): Promise<boolean> {
  try {
    if (!clipboard) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The raw pane: the text, and a way to get it out of the page. */
const jsonPane = (text: string): TemplateResult => {
  const onCopy = async (event: Event): Promise<void> => {
    const button = event.currentTarget as HTMLButtonElement;
    const ok = await copyText(text, navigator.clipboard as Clipboard | undefined);
    button.textContent = ok ? 'Copied' : 'Press ⌘C to copy';
    window.setTimeout(() => {
      button.textContent = 'Copy';
    }, 2000);
  };
  return html`<div class="wr-ndv-raw">
    <button class="wr-ndv-copy" type="button" @click=${(e: Event) => void onCopy(e)}>Copy</button>
    <pre class="wr-ndv-json">${text}</pre>
  </div>`;
};

/** Everything the execution view adds around the parameters pane. */
export interface ExecutionPanes {
  input?: DataPaneModel;
  output?: DataPaneModel;
  /** True when the node has run data at all; false means it never executed. */
  executed: boolean;
  hasInput: boolean;
  runCount: number;
  runIndex: number;
  itemsPerRun: number[];
  modes: { input: DisplayMode; output: DisplayMode };
  pages: { input: number; output: number };
  queries: { input: string; output: string };
  onRun: (index: number) => void;
  onMode: (side: 'input' | 'output', mode: DisplayMode) => void;
  onPage: (side: 'input' | 'output', page: number) => void;
  onQuery: (side: 'input' | 'output', query: string) => void;
}

/** Narrowest the parameters column may be dragged. */
const MIN_COLUMN_PX = 280;

/**
 * The strip between the parameters column and a side pane.
 *
 * Read-only does not mean fixed: a wide payload is unreadable in a 419px
 * column, and n8n lets you drag this boundary. The width is written straight
 * onto the element rather than held as component state, because it is a view
 * preference rather than part of the model -- and because a re-render midway
 * through a drag would otherwise fight the pointer.
 */
function resizeHandle(edge: 'left' | 'right'): TemplateResult {
  const onDown = (event: PointerEvent): void => {
    const handle = event.currentTarget as HTMLElement;
    const middle = handle.parentElement?.querySelector('.wr-ndv-middle') as HTMLElement | null;
    if (!middle) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = middle.getBoundingClientRect().width;
    const onMove = (move: PointerEvent): void => {
      // Dragging the left handle leftwards widens the column, so that edge's
      // delta is inverted relative to the right one.
      const delta = edge === 'left' ? startX - move.clientX : move.clientX - startX;
      middle.style.width = `${Math.max(MIN_COLUMN_PX, startWidth + delta)}px`;
    };
    const onUp = (): void => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };
    handle.setPointerCapture(event.pointerId);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };
  return html`<div
    class="wr-ndv-resize"
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize parameters column"
    @pointerdown=${onDown}
  ></div>`;
}

export type NdvTab = 'params' | 'settings' | 'json';

export interface StickyInspection {
  name: string;
  content: string;
}

interface PanelOptions {
  onTab: (tab: NdvTab) => void;
  onClose: () => void;
}

const TABS: Array<{ id: NdvTab; label: string }> = [
  { id: 'params', label: 'Parameters' },
  { id: 'settings', label: 'Settings' },
  { id: 'json', label: 'JSON' },
];

/** The data panes that flank the middle column, when there are any. */
interface Sides {
  input: TemplateResult;
  output: TemplateResult;
}

/**
 * In a narrow container the three columns cannot sit side by side, so one is
 * shown at a time and this switch picks which. The choice is kept on the DOM
 * (`data-pane`, `aria-pressed`) rather than in component state: neither is a
 * Lit binding, so a re-render leaves it alone, and closing the panel resets it.
 */
function choosePane(event: Event): void {
  const button = (event.target as Element | null)?.closest<HTMLElement>('button[data-pane]');
  const panes = button?.closest('.wr-ndv')?.querySelector<HTMLElement>('.wr-ndv-panes');
  if (!button || !panes) return;
  panes.dataset.pane = button.dataset.pane ?? 'node';
  for (const other of button.parentElement?.querySelectorAll('button') ?? []) {
    other.setAttribute('aria-pressed', String(other === button));
  }
}

const paneSwitch = html`
  <nav class="wr-ndv-switch" aria-label="Pane" @click=${choosePane}>
    <button type="button" data-pane="input" aria-pressed="false">Input</button>
    <button type="button" data-pane="node" aria-pressed="true">Node</button>
    <button type="button" data-pane="output" aria-pressed="false">Output</button>
  </nav>
`;

function shell(
  title: string,
  subtitle: string,
  tabs: Array<{ id: NdvTab; label: string }>,
  active: NdvTab,
  body: TemplateResult,
  { onTab, onClose }: PanelOptions,
  sides?: Sides,
): TemplateResult {
  // The tabs belong to the middle column, not the modal: n8n flanks
  // Parameters/Settings with INPUT and OUTPUT, and the columns stay put as you
  // move between tabs.
  const middle = html`
    <div class="wr-ndv-middle">
      <nav class="wr-ndv-tabs" role="tablist">
        ${tabs.map(
          (tab) => html`
            <button
              type="button"
              role="tab"
              data-tab=${tab.id}
              aria-selected=${String(tab.id === active)}
              @click=${() => onTab(tab.id)}
            >
              ${tab.label}
            </button>
          `,
        )}
      </nav>
      <div class="wr-ndv-body">${body}</div>
    </div>
  `;
  return html`
    <div class="wr-ndv-backdrop" @click=${(e: Event) => e.target === e.currentTarget && onClose()}>
      <section class="wr-ndv" role="dialog" aria-modal="true" aria-label=${title}>
        <header class="wr-ndv-header">
          <span class="wr-ndv-title">${title}</span>
          <span class="wr-ndv-sub">${subtitle}</span>
          <button class="wr-ndv-close" type="button" aria-label="Close" @click=${onClose}>×</button>
        </header>
        ${sides ? paneSwitch : ''}
        ${sides
          ? html`<div class="wr-ndv-panes" data-pane="node">
              ${sides.input}${resizeHandle('left')}${middle}${resizeHandle('right')}${sides.output}
            </div>`
          : middle}
      </section>
    </div>
  `;
}

function settingsList(model: FormModel): TemplateResult {
  const rows = Object.entries(model.settings).filter(([, value]) => value !== undefined);
  return html`
    <div class="wr-ndv-settings">
      ${rows.length === 0
        ? html`<div class="wr-ndv-note">This node uses the default settings.</div>`
        : rows.map(
            ([key, value]) => html`
              <div class="wr-ndv-field" data-field=${key}>
                <label>${key}</label>
                <span class="wr-ndv-value">${String(value)}</span>
              </div>
            `,
          )}
      ${model.credentials.length > 0
        ? html`<div class="wr-ndv-field" data-field="credentials">
            <label>Credentials</label>
            <span class="wr-ndv-value">${model.credentials.map((c) => c.displayName).join(', ')}</span>
          </div>`
        : ''}
    </div>
  `;
}

export function renderNodePanel(
  model: FormModel,
  raw: unknown,
  active: NdvTab,
  options: PanelOptions,
  execution?: ExecutionPanes,
): TemplateResult {
  let body: TemplateResult;
  if (active === 'json') {
    body = jsonPane(JSON.stringify(raw, null, 2));
  } else if (active === 'settings') {
    body = settingsList(model);
  } else {
    const notice = model.unknownType
      ? html`<div class="wr-ndv-note wr-ndv-unknown">
          No description is available for this node type, so its parameters are shown as they are stored.
        </div>`
      : html``;
    // Keep the array inside real markup: a template whose entire content is a
    // bare array does not commit under happy-dom, which silently emptied the
    // whole pane.
    body = html`<div class="wr-ndv-params">
      ${notice}
      ${model.fields.length === 0
        ? html`<div class="wr-ndv-note">This node has no visible parameters.</div>`
        : model.fields.map((field) => renderField(field))}
    </div>`;
  }

  const subtitle = `${model.header.displayName} · v${model.header.schemaVersion}${
    model.header.disabled ? ' · (Deactivated)' : ''
  }`;

  // The columns are always there, whatever the payload: n8n's panel has the
  // same shape whether or not anything ran, and changing shape between a
  // workflow and an execution reads as two different products.
  const sides: Sides = {
    // A trigger has no input at all, so it gets no column -- an empty one would
    // claim there is an input that simply had no data.
    input: !execution
      ? renderEmptyPane('input')
      : !execution.hasInput
        ? html``
        : execution.input
          ? renderDataPane(execution.input, {
              side: 'input',
              mode: execution.modes.input,
              page: execution.pages.input,
              query: execution.queries.input,
              onMode: (mode) => execution.onMode('input', mode),
              onPage: (page) => execution.onPage('input', page),
              onQuery: (query) => execution.onQuery('input', query),
            })
          : renderMissingPane('input'),
    output: !execution
      ? renderEmptyPane('output')
      : execution.output
        ? renderDataPane(execution.output, {
            side: 'output',
            mode: execution.modes.output,
            page: execution.pages.output,
            query: execution.queries.output,
            onMode: (mode) => execution.onMode('output', mode),
            onPage: (page) => execution.onPage('output', page),
            onQuery: (query) => execution.onQuery('output', query),
          })
        : renderMissingPane('output'),
  };

  // The run selector belongs above the parameters, inside the middle column.
  // Wrapped in real markup for the reason noted above: a template made only of
  // bare interpolations does not commit under happy-dom, and this one silently
  // emptied the whole middle column when it was written without the wrapper.
  const middleBody = execution
    ? html`<div class="wr-ndv-stack">
        ${renderRunSelector(execution.runCount, execution.runIndex, execution.itemsPerRun, execution.onRun)}${body}
      </div>`
    : body;

  return shell(model.header.name, subtitle, TABS, active, middleBody, options, sides);
}

export function renderStickyPanel(
  sticky: StickyInspection,
  active: NdvTab,
  options: PanelOptions,
): TemplateResult {
  const tabs: Array<{ id: NdvTab; label: string }> = [
    { id: 'params', label: 'Note' },
    { id: 'json', label: 'Raw' },
  ];
  const body =
    active === 'json'
      ? jsonPane(sticky.content)
      : html`<div class="wr-ndv-markdown">${sticky.content}</div>`;
  return shell(sticky.name, 'Sticky note', tabs, active === 'json' ? 'json' : 'params', body, options);
}
