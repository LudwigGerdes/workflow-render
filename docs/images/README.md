# README images

Every image here is a render produced by workflow-render itself from the fixtures in
`packages/core/test/fixtures/` — nothing is a screenshot of n8n. `notion-embed.png` is the one screenshot: it shows the element inside Notion.

| File | Source | How |
|---|---|---|
| `my-workflow.png` | `order-intake.json` | `workflow-render export … --scale 3`, downscaled to 1600 px |
| `browser-view-execution.png` | `execution-loop.json` | `workflow-render view`, captured in a 1400×800 browser window at 2× device pixel ratio |
| `notion-embed.png` | the `branching.json` example from the viewer | a Notion page with the canvas in an `/embed` block, hosted on Cloudflare Pages as in docs/notion.md; captured in a desktop browser with the sidebar hidden, then the test page and host were removed |
| `fallback-no-icons.png` | `surface.json` | `workflow-render export` with `packages/assets/data/` removed, downscaled to 1600 px |
