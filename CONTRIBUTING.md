# Contributing to workflow-render

Thanks for looking. This file is the short version; [AGENTS.md](AGENTS.md)
has the package layout, build order and conventions in full.

## Prerequisites

- Node ≥ 20 (CI runs 20 and 22)
- pnpm 10.22.0 — `corepack enable` picks it up from `packageManager`

## The dev loop

```bash
pnpm install
pnpm build && pnpm typecheck && pnpm test
```

Build first. `element`, `cli` and `site` resolve `workflow-render-core` through its
`dist`, so `typecheck` fails on a fresh clone until `build` has run once.
The root build is serialised on purpose (`assets → core → element → cli/site`);
each package's `build` script builds the one below it.

Run the CLI from the checkout with `node packages/cli/dist/cli.js …`.

Only `packages/cli` is published (as `workflow-render`); it bundles the other
libraries. If you touch packaging, entry points, data loading or the `view`
server, run the install-level test as well:

```bash
pnpm smoke        # scripts/smoke.sh all: fresh clone + packed tarball, ~2 min, needs network for npm install
bash scripts/smoke.sh npm   # only the tarball path (tests the working tree; build first)
```

The clone path tests the last **commit**, not the working tree. Never make it
pass by asserting less.

## One package, one file

```bash
pnpm --filter workflow-render-core test              # one package
pnpm --filter workflow-render-core test golden       # one file pattern
pnpm --filter workflow-render-site dev               # viewer page with live element reload
```

## Fixtures and goldens

Fixtures are small, synthetic workflow or execution JSON files in
`packages/core/test/fixtures/` (example.com addresses, throwaway ids, no
`meta.instanceId`, credential ids or webhook ids). To add one: drop the file
in, list it in `packages/core/test/golden.test.ts`, run the suite. A missing
golden is written on the first run; after that the render must reproduce it
byte for byte.

```bash
UPDATE_GOLDENS=1 pnpm --filter workflow-render-core test golden
```

Approving a golden means reading the diff. Any change to a visual constant
invalidates every golden — that is the point.

## Regenerating the n8n-derived data

```bash
pnpm --filter workflow-render-assets extract <n8n-version>   # dev-time, networked
```

Then bump `EMULATED_VERSION` in `packages/assets/src/version.ts` (the single
pin; core derives its own from it), rebuild and regenerate the goldens.

## Pull requests

- Write the failing test first; a fix without a test will be asked for one.
- Strict TypeScript: no `any`, no casts where a type guard will do.
- Conventional commit messages (`fix(cli): …`, `feat(element): …`).
- Measure, never copy: visual constants come from a running n8n canvas, not
  from n8n's source. No runtime network I/O anywhere. Never commit exports
  from a real instance.
- Keep the suite green: `pnpm build && pnpm typecheck && pnpm test`, and `pnpm smoke` for packaging changes.

Bugs and questions: GitHub Issues (use a template).
