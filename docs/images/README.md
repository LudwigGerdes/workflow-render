# README images

Every image here is a render produced by workflow-render itself from the fixtures in
`packages/core/test/fixtures/` — nothing is a screenshot of n8n.

| File | Source | How |
|---|---|---|
| `my-workflow.png` | `order-intake.json` | `workflow-render export … --scale 3`, downscaled to 1600 px |
| `browser-view-execution.png` | `execution-loop.json` | `workflow-render view`, captured in a 1400×800 browser window at 2× device pixel ratio |
| `fallback-no-icons.png` | `surface.json` | `workflow-render export` with `packages/assets/data/` removed, downscaled to 1600 px |
