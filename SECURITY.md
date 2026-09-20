# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
**Report a vulnerability** button on the repository's Security tab (a private
security advisory), not in a public issue. You will get an acknowledgement
within about a week. There is no bug bounty.

## What touches the network and what is stored

- **No command accepts an API key, and nothing is ever written to disk except
  the file you name with `-o`.** `workflow-render export` reads one local JSON file
  and writes one SVG or PNG. `workflow-render view` reads one local JSON file and
  serves it, with the viewer bundle, on `127.0.0.1` only; it stores nothing.
- The CLI and the element make no network requests. The element fetches only
  the `src` URL its host page gives it and its own sidecar files next to the
  script.
- Node icons and descriptions come from data committed in this repository.
  The only networked code is the dev-time extractor
  (`packages/assets/scripts/extract.ts`), which is not part of any build
  output.
- Sticky-note images are drawn only from `data:` and relative sources by
  default; `images="remote"` on the element opts a page into loading images
  from other hosts.

If you export a workflow that contains secrets in its parameters, the export
contains them too — treat the output like the input.
