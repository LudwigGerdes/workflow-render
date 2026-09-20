#!/usr/bin/env bash
# Install-level acceptance test: does workflow-render work for someone who
# clones the repo, and for someone who installs the npm tarball?
#
#   scripts/smoke.sh [clone|npm|all]        (default: all)
#
# clone  git clone of the COMMITTED state -> pnpm install -> pnpm build ->
#        the README quickstart through `node packages/cli/dist/cli.js`.
# npm    `pnpm pack` of the one publishable package (packages/cli, from the
#        working tree, which must be built) -> `npm install <tarball>` in an
#        empty directory outside any workspace -> the same quickstart through
#        node_modules/.bin/workflow-render, plus the package-shape checks.
#
# Every run works in a fresh mktemp dir with its own HOME, picks free ports,
# and removes everything (and kills any server it started) on exit.
# The pnpm store and npm cache of the real user are reused read-mostly so a run
# does not re-download the world; set SMOKE_COLD=1 to isolate those as well.
set -euo pipefail

MODE="${1:-all}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES_REL="packages/core/test/fixtures"

case "$MODE" in clone | npm | all) ;; *)
  echo "usage: scripts/smoke.sh [clone|npm|all]" >&2
  exit 2
  ;;
esac

# --- isolation ---------------------------------------------------------------
if [ -z "${SMOKE_COLD:-}" ]; then
  PNPM_STORE="$(pnpm store path 2>/dev/null || true)"
  NPM_CACHE="$(npm config get cache 2>/dev/null || true)"
fi
TMP="$(mktemp -d "${TMPDIR:-/tmp}/workflow-render-smoke.XXXXXX")"
TMP="$(cd "$TMP" && pwd -P)"
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

mkdir -p "$TMP/home"
export HOME="$TMP/home"
export WORKFLOW_RENDER_HOME="$TMP/home/.workflow-render"
export XDG_CONFIG_HOME="$TMP/home/.config" XDG_CACHE_HOME="$TMP/home/.cache" XDG_DATA_HOME="$TMP/home/.local/share"
export CI=1 NO_UPDATE_NOTIFIER=1 npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false
export npm_config_logs_dir="$TMP/npm-logs" # npm would otherwise log next to the shared cache
if [ -n "${NPM_CACHE:-}" ]; then export npm_config_cache="$NPM_CACHE"; fi
PNPM_INSTALL_ARGS=(--frozen-lockfile)
if [ -n "${PNPM_STORE:-}" ]; then PNPM_INSTALL_ARGS+=(--store-dir "$PNPM_STORE"); fi
unset WORKFLOW_RENDER_DATA

# --- reporting ---------------------------------------------------------------
PASSED=0
FAILED=0
FAILURES=()
pass() {
  PASSED=$((PASSED + 1))
  echo "PASS  $1"
}
fail() {
  FAILED=$((FAILED + 1))
  FAILURES+=("$1")
  echo "FAIL  $1"
  if [ -n "${2:-}" ]; then printf '%s\n' "$2" | tail -n 25 | sed 's/^/      | /'; fi
}
# check "<label>" <command...> — passes when the command exits 0
check() {
  local label="$1" out
  shift
  if out="$("$@" 2>&1)"; then pass "$label"; else fail "$label" "$out"; fi
}

# count_of <pattern> <file> — occurrences, 0 when the file is missing or has none
count_of() { { grep -o "$1" "$2" 2>/dev/null || true; } | wc -l | tr -d ' '; }
magic() { od -An -tx1 -N "$2" "$1" | tr -d ' \n'; }
# width of a PNG, from the IHDR chunk (bytes 16..19, big endian)
png_width() { node -e 'const b=require("fs").readFileSync(process.argv[1]);console.log(b.readUInt32BE(16))' "$1"; }
free_port() {
  node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>console.log(p))})'
}
port_is_closed() { ! curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$1/"; }

# --- the quickstart ----------------------------------------------------------
# quickstart <label> <fixtures dir> <fonts dir> <work dir> -- <cli invocation...>
quickstart() {
  local label="$1" fixtures="$2" fonts="$3" work="$4" out code
  shift 5
  local cli=("$@")
  mkdir -p "$work"

  # --version
  if out="$("${cli[@]}" --version 2>&1)" && printf '%s' "$out" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+'; then
    pass "$label: --version prints a version ($out)"
  else
    fail "$label: --version prints a version" "$out"
  fi
  check "$label: --help exits 0 and documents export and view" \
    bash -c '"$@" --help | grep -q "export <file.json>" && "$@" --help | grep -q "view   <file.json>"' _ "${cli[@]}"

  # export -> SVG with REAL icons
  local svg="$work/order-intake.svg"
  if out="$("${cli[@]}" export "$fixtures/order-intake.json" -o "$svg" 2>&1)" && printf '%s' "$out" | grep -q "^wrote "; then
    pass "$label: export -o out.svg exits 0 and says 'wrote'"
  else
    fail "$label: export -o out.svg exits 0 and says 'wrote'" "$out"
  fi
  if [ -s "$svg" ] && [ "$(head -c 4 "$svg")" = "<svg" ]; then
    pass "$label: out.svg is non-empty and starts with <svg"
  else
    fail "$label: out.svg is non-empty and starts with <svg"
  fi
  local icons monograms
  icons="$(count_of 'class="wr-icon"' "$svg")"
  monograms="$(count_of 'class="wr-monogram"' "$svg")"
  if [ "$icons" -eq 5 ] && [ "$monograms" -eq 0 ]; then
    pass "$label: all 5 nodes carry a real icon, none the initials fallback (icon data shipped)"
  else
    fail "$label: all 5 nodes carry a real icon, none the initials fallback (icon data shipped)" "wr-icon=$icons wr-monogram=$monograms"
  fi
  check "$label: node subtitles are rendered (subtitle data shipped)" grep -q 'class="wr-node-subtitle"' "$svg"
  check "$label: the SVG embeds the Inter faces (fonts shipped)" grep -q 'font/woff2' "$svg"

  # negative control + graceful fallback: a data root with fonts but no n8n data
  local bare="$work/bare-data" bare_svg="$work/bare.svg"
  mkdir -p "$bare"
  if [ -d "$fonts" ]; then cp -R "$fonts" "$bare/fonts"; fi
  if out="$(WORKFLOW_RENDER_DATA="$bare" "${cli[@]}" export "$fixtures/order-intake.json" -o "$bare_svg" 2>&1)" &&
    [ "$(count_of 'class="wr-monogram"' "$bare_svg")" -eq 5 ]; then
    pass "$label: WORKFLOW_RENDER_DATA override is honoured and missing icon data falls back to initials"
  else
    fail "$label: WORKFLOW_RENDER_DATA override is honoured and missing icon data falls back to initials" "$out"
  fi

  # export -> PNG through the native @resvg/resvg-js addon
  local png1="$work/s1.png" png2="$work/s2.png"
  if out="$("${cli[@]}" export "$fixtures/order-intake.json" -o "$png1" --scale 1 2>&1 && "${cli[@]}" export "$fixtures/order-intake.json" -o "$png2" --scale 2 2>&1)"; then
    pass "$label: export -o out.png --scale 1|2 exits 0"
  else
    fail "$label: export -o out.png --scale 1|2 exits 0" "$out"
  fi
  if [ -s "$png2" ] && [ "$(magic "$png2" 8)" = "89504e470d0a1a0a" ]; then
    pass "$label: out.png is non-empty and has the PNG signature"
  else
    fail "$label: out.png is non-empty and has the PNG signature"
  fi
  if [ -s "$png1" ] && [ -s "$png2" ] && [ "$(png_width "$png2")" -eq $((2 * $(png_width "$png1"))) ]; then
    pass "$label: --scale 2 is twice the pixel width of --scale 1 ($(png_width "$png1") -> $(png_width "$png2"))"
  else
    fail "$label: --scale 2 is twice the pixel width of --scale 1"
  fi

  # an execution export
  local exe="$work/execution-loop.svg"
  if out="$("${cli[@]}" export "$fixtures/execution-loop.json" -o "$exe" 2>&1)" && grep -q 'data-view="execution"' "$exe"; then
    pass "$label: an execution fixture exports as the execution view"
  else
    fail "$label: an execution fixture exports as the execution view" "$out"
  fi

  # a bad input fails loudly
  set +e
  out="$("${cli[@]}" export "$work/does-not-exist.json" -o "$work/nope.svg" 2>&1)"
  code=$?
  set -e
  if [ "$code" -ne 0 ] && [ ! -e "$work/nope.svg" ]; then
    pass "$label: export of a missing file exits non-zero and writes nothing"
  else
    fail "$label: export of a missing file exits non-zero and writes nothing" "exit=$code $out"
  fi

  # view: own port, fetch the page and everything it loads, then stop it
  local port log="$work/view.log" up=""
  port="$(free_port)"
  "${cli[@]}" view "$fixtures/execution-loop.json" --port "$port" >"$log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 50); do
    if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$port/"; then
      up=1
      break
    fi
    kill -0 "$SERVER_PID" 2>/dev/null || break
    node -e 'setTimeout(()=>{},200)'
  done
  if [ -n "$up" ]; then
    pass "$label: view listens on 127.0.0.1:$port"
    check "$label: view prints its URL" grep -q "http://127.0.0.1:$port/" "$log"
    check "$label: GET / is 200 and mounts <workflow-render>" \
      bash -c 'curl -sf --max-time 5 "$1" | grep -q "<workflow-render src="' _ "http://127.0.0.1:$port/"
    local js="$work/served-element.js" ctype
    ctype="$(curl -sf --max-time 10 -o "$js" -w '%{content_type}' "http://127.0.0.1:$port/workflow-render.js" || true)"
    if [ -s "$js" ] && [ "$(wc -c <"$js")" -gt 100000 ] && printf '%s' "$ctype" | grep -q javascript && grep -q 'workflow-render' "$js"; then
      pass "$label: GET /workflow-render.js serves the element bundle as JavaScript ($(wc -c <"$js" | tr -d ' ') bytes)"
    else
      fail "$label: GET /workflow-render.js serves the element bundle as JavaScript" "content-type=$ctype"
    fi
    local f
    for f in workflow-render-icons.json workflow-render-subtitles.json workflow-render-descriptions.json; do
      check "$label: GET /$f is 200 and valid, non-empty JSON" \
        bash -c 'curl -sf --max-time 20 "$1" | node -e "let s=\"\";process.stdin.on(\"data\",(d)=>s+=d).on(\"end\",()=>{if(Object.keys(JSON.parse(s)).length<10)process.exit(1)})"' _ "http://127.0.0.1:$port/$f"
    done
    check "$label: GET /workflow.json returns the file being viewed" \
      bash -c 'curl -sf --max-time 5 "$1" | grep -q "runData"' _ "http://127.0.0.1:$port/workflow.json"
    check "$label: a path outside the bundle is 404" \
      bash -c '[ "$(curl -s --path-as-is -o /dev/null -w "%{http_code}" --max-time 5 "$1")" = 404 ]' _ "http://127.0.0.1:$port/../package.json"
  else
    fail "$label: view listens on 127.0.0.1:$port" "$(cat "$log")"
  fi
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""
  check "$label: no listener is left on $port after view is stopped" port_is_closed "$port"
}

# --- clone path --------------------------------------------------------------
run_clone() {
  echo
  echo "== clone path: git clone -> pnpm install --frozen-lockfile -> pnpm build =="
  local clone="$TMP/clone" out
  git clone --quiet "$ROOT" "$clone"
  if out="$(cd "$clone" && pnpm install "${PNPM_INSTALL_ARGS[@]}" 2>&1)"; then pass "clone: pnpm install --frozen-lockfile"; else
    fail "clone: pnpm install --frozen-lockfile" "$out"
    return
  fi
  if out="$(cd "$clone" && pnpm build 2>&1)"; then pass "clone: pnpm build"; else
    fail "clone: pnpm build" "$out"
    return
  fi
  quickstart "clone" "$clone/$FIXTURES_REL" "$clone/packages/assets/data/fonts" "$TMP/clone-work" -- \
    node "$clone/packages/cli/dist/cli.js"
  check "clone: the build leaves the committed tree clean" bash -c 'cd "$1" && [ -z "$(git status --porcelain)" ]' _ "$clone"
}

# --- npm path ----------------------------------------------------------------
run_npm() {
  echo
  echo "== npm path: pnpm pack -> npm install <tarball> in an empty dir =="
  local out tarball app="$TMP/app" pkg
  if [ ! -f "$ROOT/packages/cli/dist/cli.js" ]; then
    fail "npm: packages/cli is built (run pnpm build first)"
    return
  fi
  mkdir -p "$TMP/pack"
  if out="$(cd "$ROOT/packages/cli" && pnpm pack --pack-destination "$TMP/pack" 2>&1)"; then pass "npm: pnpm pack packages/cli"; else
    fail "npm: pnpm pack packages/cli" "$out"
    return
  fi
  tarball="$(ls "$TMP/pack"/workflow-render-*.tgz)"

  # what is in the tarball
  local listing="$TMP/pack/listing.txt"
  tar -tzf "$tarball" | sed 's#^package/##' >"$listing"
  echo "      tarball: $(basename "$tarball"), $(wc -l <"$listing" | tr -d ' ') files, $(du -k "$tarball" | cut -f1) KB packed"
  local f
  for f in package.json LICENSE README.md THIRD_PARTY_NOTICES.md dist/cli.js \
    dist/element/workflow-render.js dist/element/workflow-render-icons.json \
    dist/element/workflow-render-subtitles.json dist/element/workflow-render-descriptions.json; do
    check "npm: tarball contains $f" grep -qx "$f" "$listing"
  done
  check "npm: tarball has no src/, tests, fixtures or TypeScript sources" \
    bash -c '! grep -E "(^|/)(src|test|tests|__tests__|fixtures|golden)/|\.test\.|\.tsbuildinfo$|(^|[^d])\.ts$|^[^/]*\.config\." "$1" | grep -v "\.d\.ts$" | grep .' _ "$listing"
  check "npm: every shipped .js has its sourcemap (dist/element excepted: it is the browser bundle)" \
    bash -c 'for j in $(grep -E "^dist/.*\.js$" "$1" | grep -v "^dist/element/"); do grep -qx "$j.map" "$1" || { echo "no map for $j"; exit 1; }; done' _ "$listing"
  check "npm: the native @resvg/resvg-js addon is not bundled (no .node files)" bash -c '! grep -E "\.node$" "$1"' _ "$listing"

  # install outside any workspace
  mkdir -p "$app"
  if out="$(cd "$app" && npm init -y 2>&1 && npm install "$tarball" 2>&1)"; then pass "npm: npm install <tarball> in an empty project"; else
    fail "npm: npm install <tarball> in an empty project" "$out"
    return
  fi
  pkg="$app/node_modules/workflow-render"
  check "npm: @resvg/resvg-js is installed as a real dependency" test -f "$app/node_modules/@resvg/resvg-js/package.json"
  check "npm: no internal workspace package was installed" \
    bash -c '! ls "$1/node_modules" | grep -E "^workflow-render-"' _ "$app"

  cd "$app" # counters live in this shell, so no subshell here
  quickstart "npm" "$ROOT/$FIXTURES_REL" "$pkg/data/fonts" "$TMP/npm-work" -- "$app/node_modules/.bin/workflow-render"
  cd "$ROOT"

  if out="$(cd "$app" && npx --no-install workflow-render --version 2>"$TMP/npx.err")" && printf '%s' "$out" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+'; then
    pass "npm: npx --no-install workflow-render --version ($out)"
  else
    fail "npm: npx --no-install workflow-render --version" "$out $(cat "$TMP/npx.err" 2>/dev/null)"
  fi

  # the browser bundle at its documented (CDN) path
  for f in workflow-render.js workflow-render-icons.json workflow-render-subtitles.json workflow-render-descriptions.json \
    inter-400.woff2 inter-500.woff2 inter-600.woff2; do
    check "npm: dist/element/$f exists in the installed package" test -s "$pkg/dist/element/$f"
  done
  check "npm: workflow-render/element resolves to dist/element/workflow-render.js" \
    bash -c 'cd "$1" && node -e "const p=require.resolve(\"workflow-render/element\");if(!p.endsWith(\"/node_modules/workflow-render/dist/element/workflow-render.js\"))throw new Error(p)"' _ "$app"

  # programmatic API: workflow-render/core renders to an SVG string, data found in the INSTALLED package
  cat >"$app/consumer.mjs" <<'EOF'
import { readFile } from 'node:fs/promises';
import { renderToSVG, renderWorkflow, loadIcons } from 'workflow-render/core';
const json = JSON.parse(await readFile(process.argv[2], 'utf8'));
// the one-call path: data and fonts come from the installed package
const { svg, warnings } = await renderToSVG(json);
if (typeof svg !== 'string' || !svg.startsWith('<svg')) throw new Error('not an SVG string');
if (!Array.isArray(warnings)) throw new Error('no warnings array');
const icons = (svg.match(/class="wr-icon"/g) ?? []).length;
if (icons !== 5 || svg.includes('class="wr-monogram"')) throw new Error(`expected 5 real icons, got ${icons}`);
if (!svg.includes('font/woff2')) throw new Error('fonts not embedded');
// the pure pipeline with explicitly loaded data
const catalogue = await loadIcons();
if (Object.keys(catalogue).length < 100) throw new Error('icon catalogue is empty');
const pure = renderWorkflow(json, { icons: catalogue });
if (!pure.svg || pure.svg.includes('class="wr-monogram"')) throw new Error('pure pipeline fell back to initials');
console.log('core ok');
EOF
  check "npm: import('workflow-render/core') renders an SVG string with real icons" \
    bash -c 'cd "$1" && node consumer.mjs "$2" | grep -q "core ok"' _ "$app" "$ROOT/$FIXTURES_REL/order-intake.json"

  # types: a strict NodeNext consumer must typecheck against the shipped declarations
  if [ -x "$ROOT/node_modules/.bin/tsc" ]; then
    cat >"$app/consumer.mts" <<'EOF'
import { renderToSVG, renderWorkflow, type RenderResult } from 'workflow-render/core';
import 'workflow-render/element';
const workflow = { nodes: [], connections: {} };
const { svg }: { svg: string } = await renderToSVG(workflow);
const result: RenderResult = renderWorkflow(workflow);
// @ts-expect-error svg is a string, not a number: proves the types are real and not `any`
const wrong: number = (await renderToSVG(workflow)).svg;
const element: HTMLElement = document.createElement('workflow-render');
console.log(svg.length, result.errors, wrong, element);
EOF
    cat >"$app/tsconfig.json" <<'EOF'
{ "compilerOptions": { "module": "NodeNext", "moduleResolution": "NodeNext", "target": "ES2022", "strict": true,
  "noEmit": true, "skipLibCheck": false, "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": [] }, "files": ["consumer.mts"] }
EOF
    check "npm: a strict TypeScript consumer of ./core and ./element typechecks (skipLibCheck off)" \
      bash -c 'cd "$1" && "$2" -p tsconfig.json' _ "$app" "$ROOT/node_modules/.bin/tsc"
  else
    fail "npm: a strict TypeScript consumer typechecks" "no tsc at $ROOT/node_modules/.bin/tsc — run pnpm install"
  fi
}

case "$MODE" in
clone) run_clone ;;
npm) run_npm ;;
all)
  run_clone
  run_npm
  ;;
esac

echo
echo "== summary: $PASSED passed, $FAILED failed =="
if [ "$FAILED" -gt 0 ]; then
  printf '   - %s\n' "${FAILURES[@]}"
  exit 1
fi
