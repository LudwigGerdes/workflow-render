/**
 * The static viewer page.
 *
 * The canvas is the page; everything else floats over it and gets out of the
 * way once the pointer settles. Nothing is uploaded: the only request the page
 * makes is for a `?src=` URL the visitor supplied.
 */

interface CanvasElement extends HTMLElement {
  workflow?: unknown;
  fit?: () => void;
}

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

/** How long the pointer must be still before the widgets step aside. */
const IDLE_AFTER_MS = 2000;

/** Wire the page. Exported so the smoke test can drive it with a stubbed URL. */
export function initSite(search: string = globalThis.location?.search ?? ''): void {
  const canvas = $<CanvasElement>('canvas');
  const messages = $('messages');
  if (!canvas) return;

  const say = (text: string, kind: 'warning' | 'error' | 'clear'): void => {
    if (!messages) return;
    if (kind === 'clear') {
      messages.replaceChildren();
      return;
    }
    const line = document.createElement('p');
    line.className = kind === 'error' ? 'msg msg-error' : 'msg msg-warning';
    line.textContent = text; // never innerHTML: this text comes from user JSON
    messages.append(line);
  };

  canvas.addEventListener('wr-load', (event) => {
    const { view, warnings } = (event as CustomEvent<{ view: string; warnings: string[] }>).detail;
    say('', 'clear');
    for (const warning of warnings) say(warning, 'warning');
    document.title = `workflow-render — ${view} view`;
    updateEmbed();
  });

  // The panel is a modal inside the element, but these widgets are fixed to the
  // body -- a separate stacking context -- so they paint over it whatever the
  // modal's z-index. The element already announces open and close; the page
  // just has to listen.
  canvas.addEventListener('wr-inspector-open', () => document.body.classList.add('is-inspecting'));
  canvas.addEventListener('wr-inspector-close', () => document.body.classList.remove('is-inspecting'));

  canvas.addEventListener('wr-error', (event) => {
    const { message } = (event as CustomEvent<{ message: string }>).detail;
    say('', 'clear');
    say(message, 'error');
  });

  const loadText = (text: string): void => {
    try {
      canvas.workflow = JSON.parse(text);
      say('', 'clear');
    } catch {
      say('that is not valid JSON', 'error');
    }
  };

  $('load')?.addEventListener('click', () => {
    const paste = $<HTMLTextAreaElement>('paste');
    if (paste?.value.trim()) loadText(paste.value);
  });

  const dropzone = $('dropzone');
  dropzone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-over');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-over');
    const file = (event as DragEvent).dataTransfer?.files?.[0];
    if (file) void file.text().then(loadText);
  });

  for (const button of document.querySelectorAll<HTMLElement>('[data-example]')) {
    button.addEventListener('click', () => {
      canvas.setAttribute('src', `./examples/${button.dataset['example'] ?? ''}`);
    });
  }

  // --- the embed snippet ---------------------------------------------------
  /**
   * Build a self-contained embed.
   *
   * The point of an embed is that it works on someone else's site. Anything
   * pointing back at this page -- a script URL, a sidecar, a ?src= -- is a
   * dependency on a machine the reader cannot reach, so everything is inlined:
   * the bundle, the workflow, and the assets.
   *
   * Inlining is only affordable because the assets are subset to the node types
   * this workflow actually uses. The icon set alone goes from about 1.2 MB to
   * tens of kilobytes.
   */
  async function buildEmbed(): Promise<string> {
    const workflow = await currentWorkflow();
    if (!workflow) return '';
    const nodes = (workflow['nodes'] ??
      (workflow['workflowData'] as Record<string, unknown> | undefined)?.['nodes'] ??
      []) as Array<{ type?: string }>;
    const types = new Set(nodes.map((n) => n.type).filter(Boolean) as string[]);

    const pick = async (file: string): Promise<Record<string, unknown>> => {
      try {
        const all = (await (await fetch(`./${file}`)).json()) as Record<string, unknown>;
        return Object.fromEntries(Object.entries(all).filter(([k]) => types.has(k)));
      } catch {
        return {};
      }
    };
    const [bundle, icons, subtitles, descriptions] = await Promise.all([
      fetch('./workflow-render.js').then((r) => r.text()).catch(() => ''),
      pick('workflow-render-icons.json'),
      pick('workflow-render-subtitles.json'),
      pick('workflow-render-descriptions.json'),
    ]);

    // `</script>` inside a string would close the tag it sits in.
    const safe = (value: unknown): string =>
      JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');

    return [
      '<!-- workflow-render: self-contained, nothing is fetched at runtime -->',
      '<div style="width: 100%; height: 600px">',
      '  <workflow-render></workflow-render>',
      '</div>',
      '<script>window.__WORKFLOW_RENDER_ASSETS__ = {' +
        `icons:${safe(icons)},subtitles:${safe(subtitles)},descriptions:${safe(descriptions)}` +
        '};<\/script>',
      `<script type="module">${bundle}<\/script>`,
      '<script type="module">',
      `  const wf = ${safe(workflow)};`,
      "  customElements.whenDefined('workflow-render').then(() => {",
      "    document.querySelectorAll('workflow-render').forEach((el) => { el.workflow = wf; });",
      '  });',
      '<\/script>',
    ].join('\n');
  }

  /** The workflow as loaded, whether it came from ?src= or was pasted. */
  async function currentWorkflow(): Promise<Record<string, unknown> | undefined> {
    if (!canvas) return undefined;
    const inline = (canvas as { workflow?: unknown }).workflow;
    if (inline && typeof inline === 'object') return inline as Record<string, unknown>;
    const src = canvas.getAttribute('src');
    if (!src) return undefined;
    try {
      return (await (await fetch(src)).json()) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }

  let embedHtml = '';
  function updateEmbed(): void {
    const field = $<HTMLTextAreaElement>('embed-snippet');
    const size = $('embed-size');
    if (!field) return;
    void buildEmbed().then((html) => {
      embedHtml = html;
      field.value = html
        ? `${html.slice(0, 240)}\n… (${Math.round(html.length / 1024)} KB, self-contained)`
        : 'Load a workflow first.';
      if (size) size.textContent = html ? `${Math.round(html.length / 1024)} KB` : '';
    });
  }
  updateEmbed();

  $('download-embed')?.addEventListener('click', () => {
    if (!embedHtml) return;
    const page = `<!doctype html>\n<meta charset="utf-8">\n<title>workflow</title>\n${embedHtml}\n`;
    const url = URL.createObjectURL(new Blob([page], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow-embed.html';
    a.click();
    URL.revokeObjectURL(url);
  });

  $('copy-embed')?.addEventListener('click', (event) => {
    const field = $<HTMLTextAreaElement>('embed-snippet');
    const button = event.currentTarget as HTMLButtonElement;
    if (!field) return;
    const done = (ok: boolean): void => {
      button.textContent = ok ? 'Copied' : 'Press ⌘C to copy';
      field.select();
      globalThis.setTimeout(() => {
        button.textContent = 'Copy';
      }, 2000);
    };
    const clipboard = (globalThis.navigator as Navigator | undefined)?.clipboard;
    if (!clipboard) return done(false);
    clipboard.writeText(embedHtml || field.value).then(
      () => done(true),
      () => done(false),
    );
  });

  // --- collapsing a widget -------------------------------------------------
  for (const toggle of document.querySelectorAll<HTMLButtonElement>('.widget-toggle')) {
    toggle.addEventListener('click', () => {
      const body = document.getElementById(toggle.dataset['target'] ?? '');
      if (!body) return;
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      body.hidden = open;
    });
  }

  // --- get out of the way --------------------------------------------------
  // The widgets fade once the pointer has been still, and come back the moment
  // it moves. Hovering one holds it open, so a panel never vanishes from under
  // the cursor while it is being used.
  let overWidget = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const body = document.body;

  const wake = (): void => {
    body.classList.remove('is-idle');
    if (timer !== undefined) clearTimeout(timer);
    if (overWidget) return;
    timer = globalThis.setTimeout(() => body.classList.add('is-idle'), IDLE_AFTER_MS);
  };

  for (const widget of document.querySelectorAll<HTMLElement>('.widget')) {
    widget.addEventListener('pointerenter', () => {
      overWidget = true;
      wake();
    });
    widget.addEventListener('pointerleave', () => {
      overWidget = false;
      wake();
    });
    // Typing counts as using it, even with the pointer parked.
    widget.addEventListener('focusin', () => {
      overWidget = true;
      wake();
    });
    widget.addEventListener('focusout', () => {
      overWidget = false;
      wake();
    });
  }

  globalThis.addEventListener?.('pointermove', wake, { passive: true });
  globalThis.addEventListener?.('keydown', wake);
  wake();

  // ?src= is the self-host pointer: publish the page, point it at your JSON.
  const src = new URLSearchParams(search).get('src');
  if (src) canvas.setAttribute('src', src);

  const emulates = $('emulates');
  const stamp = (): void => {
    const version = canvas.getAttribute('emulates');
    if (version && emulates) emulates.textContent = version;
    updateEmbed();
  };
  stamp();
  requestAnimationFrame?.(stamp);
}

initSite();
