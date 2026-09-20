/**
 * One parameter row, rendered inertly.
 *
 * Nothing here accepts focus or input: values are text, toggles are drawn not
 * checkboxes, and an expression is shown in expression styling with its source
 * text — never evaluated. A value the workflow did not set is marked so the
 * panel can mute it, which is how n8n distinguishes "unset" from "set to the
 * default".
 */
import { html, type TemplateResult } from 'lit';
import type { FormField } from 'workflow-render-core';

const EMPTY = '—';

function valueOf(field: FormField): TemplateResult {
  if (field.resourceLocator) {
    return html`<span class="wr-ndv-value"
      ><span class="wr-ndv-mode">${field.resourceLocator.modeLabel}</span>
      ${field.resourceLocator.value || EMPTY}</span
    >`;
  }

  switch (field.value.kind) {
    case 'expression':
      return html`<span class="wr-ndv-value"
        ><code class="wr-ndv-expression">${field.value.text}</code></span
      >`;
    case 'boolean':
      return html`<span class="wr-ndv-value"
        ><span
          class="wr-ndv-toggle"
          data-on=${String(field.value.on)}
          role="img"
          aria-readonly="true"
          aria-label=${field.value.on ? 'on' : 'off'}
        ></span
      ></span>`;
    case 'json':
      return html`<pre class="wr-ndv-value wr-ndv-json">${field.value.text}</pre>`;
    case 'text':
      return html`<span class="wr-ndv-value">${field.optionLabel ?? field.value.text}</span>`;
    default:
      return html`<span class="wr-ndv-value">${field.optionLabel ?? EMPTY}</span>`;
  }
}

/**
 * Notice copy arrives as a fragment of HTML -- n8n writes `<code>$</code>` and
 * links into it -- and was being placed as text, so readers saw the tags. The
 * markup is reduced to its words rather than injected: this is untrusted input
 * rendered inside someone else's page, and the panel is read-only, so a live
 * link buys nothing worth the risk.
 */
function noticeText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function renderField(field: FormField): TemplateResult {
  if (field.kind === 'notice') {
    return html`<div class="wr-ndv-note">${noticeText(field.label)}</div>`;
  }

  return html`
    <div class="wr-ndv-field ${field.isDefault ? 'is-default' : ''}" data-field=${field.name}>
      <label>${field.label}${field.required ? html`<span aria-hidden="true"> *</span>` : ''}</label>
      ${valueOf(field)}
      ${field.children?.length
        ? html`<div class="wr-ndv-children">${field.children.map((child) => renderField(child))}</div>`
        : ''}
    </div>
  `;
}
