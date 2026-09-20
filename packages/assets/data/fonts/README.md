# Inter

n8n's canvas renders in InterVariable. workflow-render ships Inter so its text has the
same metrics rather than falling back to whatever the host has installed.

- `inter-{400,500,600}.woff2` — latin subset, for browsers (`@font-face`).
- `inter-{400,500,600}.ttf` — the same faces decompressed, because resvg's font
  loader reads TTF/OTF but not woff2. Used when rasterising goldens and when
  measuring against the reference, which also makes those renders independent of
  the machine's installed fonts.

Inter is licensed under the SIL Open Font License 1.1 — see `LICENSE-Inter.txt`.
Source: the `@fontsource/inter` package (latin subset).
