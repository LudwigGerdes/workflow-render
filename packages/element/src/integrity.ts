/**
 * Subresource integrity for the sidecars.
 *
 * The bundle fetches its icon, subtitle and description files by URL, so the
 * `integrity` hash a page puts on the `<script>` tag covers the script and
 * nothing the script then loads. The build writes the sha384 of each sidecar
 * into the bundle (vite `define`), and every fetch passes it as `integrity`,
 * so the browser refuses a sidecar that is not the one this build shipped.
 * The script's own hash therefore covers them transitively.
 *
 * In tests and in the unbundled source the map is absent and fetches are
 * unchecked, which is what lets a test serve a stub.
 */
declare const __WORKFLOW_RENDER_SIDECAR_INTEGRITY__: Record<string, string> | undefined;

export function sidecarIntegrity(file: string): string | undefined {
  try {
    return typeof __WORKFLOW_RENDER_SIDECAR_INTEGRITY__ === 'object'
      ? __WORKFLOW_RENDER_SIDECAR_INTEGRITY__[file]
      : undefined;
  } catch {
    return undefined;
  }
}

/** The fetch options for a sidecar: SRI when the build recorded a hash. */
export function sidecarInit(file: string): RequestInit {
  const integrity = sidecarIntegrity(file);
  return integrity === undefined ? {} : { integrity };
}
