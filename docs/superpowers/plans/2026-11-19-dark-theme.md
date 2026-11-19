# Accessible Dark Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Light and dark themes that both meet WCAG 2.2 AAA text contrast (7:1) and 3:1 non-text contrast everywhere (one documented exception), with an OS-following, remembered toggle and automated contrast, axe and pixel checks.

**Architecture:** Every colour becomes a semantic CSS custom property defined in two blocks of `src/ui/styles.css` (`:root` light, `:root[data-theme='dark']`). A Vitest test parses both blocks and checks a declared pair table; a second test bans colour literals elsewhere. Theme state lives in `src/ui/theme.ts` with a pre-paint script in `index.html`. The 3D Bloch scene reads its colours from the tokens. A Playwright + axe script audits the real app in both themes, including rendered pixels.

**Tech Stack:** React 18, TypeScript, CSS custom properties, three.js, Vitest (jsdom); devDependencies `playwright-core`, `axe-core`, `pngjs` for `npm run a11y` (uses the locally installed Chrome).

**Spec:** `docs/superpowers/specs/2026-11-19-dark-theme-design.md`

## Global Constraints

- Text ≥ 7:1; large text (≥ 24px, or ≥ 18.66px bold) ≥ 4.5:1; non-text (component boundaries, states, meaningful graphics, focus ring) ≥ 3:1 against the surface it is drawn on.
- Two documented exceptions only:
  1. Out-box fill vs empty part (`--out-fill` vs `--panel`), light 1.3:1, dark 1.9:1. Mitigation: Out box `role="img"` named `q[N] output: B, P(1) = X.X %`.
  2. Light-theme 3D Bloch sphere rendered exactly as today (user's choice): meridians ≈ 2.0:1, arrow ≈ 3.0–3.8:1 on shaded areas. Light tokens hold today's values (`--sphere` #9fc4ee, `--bloch-circle` #4a6080, `--bloch-axis` #555555, `--arrow` #ff2020; 3D label colours today's #555 / #1f3c66 on rgba(255,255,255,.75)). Measured and reported, not gated.
- Palette from the spec table is the starting point; a value may change only to make a pair pass. No green/teal for probabilities: chart bars `--chart-bar` light #1f4e9c / dark #8ab8f5; Out fill light #7ff4f8 / dark #1b4a80; Out digit light #000000 / dark #ffffff.
- Translucent tokens are composited over their stated surface before measuring.
- No opacity to signal state (stale, orphan, drag source, table headers).
- Focus and selection rings use `outline` (never `box-shadow`, which forced colours removes), width ≥ 2px. Selection ring at offset 2px in `--select`; focus ring at offset 5px in `--focus`, so an element that is both selected and focused shows both rings, each against the surface. No `outline: none` without a replacement ring.
- Native buttons are styled from tokens `--button-bg`, `--button-text`, `--button-border` (+ `--button-hover-bg`); never left to the UA (Chrome dark ButtonFace fails 7:1).
- Dialog and gate card get a `--border` outline (≥ 3:1 vs `--raised` and vs the backdrop composited over `--bg` and over `--panel`); `--raised` itself cannot reach 3:1 against a backdrop while keeping 7:1 text, so the border carries the edge.
- `window.matchMedia` may be missing (jsdom): treat as "no preference" → dark, in `initialTheme`, `PREPAINT_SCRIPT` and `readBlochStyle`.
- Theme state is one shared store (`useSyncExternalStore` over a module store); the setter calls `applyTheme` before notifying subscribers.
- The "Updating…" badge is visual only (`aria-hidden="true"`); `aria-busy` on the panel and the existing "Computing…" status carry the state to assistive tech. The 250 ms delay uses `visibility` via `animation`/`transition-delay`, not opacity.
- Out box: `role="img"` with accessible name `q[N] output: B, P(1) = X.X %` (`q[N] output: computing` while computing).
- Orphan control: keeps its fill (filled = on 1, hollow = on 0) and gets a dashed outer ring at offset 2px in `--muted`.
- Initial theme: stored choice (`localStorage['qgl-theme']`), else `light` only if `(prefers-color-scheme: light)` matches, else `dark`. OS changes followed live only while nothing is stored. Storage access in try/catch.
- Toggle text: "Switch to light theme" / "Switch to dark theme"; no `aria-pressed`; target ≥ 24×24 px.
- `color-scheme: light` / `dark` per theme.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `feature/dark-theme`.

## Review Focus

- A colour literal sneaking back into a component or CSS rule (bypasses both themes) — Task 1 test `no colour literals outside the token blocks` and Task 2 test `no colour literals in components`.
- A token defined in one theme but missing in the other (falls back to light in dark mode) — Task 1 test `both themes define the same tokens`.
- A new token never measured (unchecked pair) — Task 1 test `every token is measured or declared decorative`.
- Theme flash or mismatch on load (pre-paint script and `initialTheme` disagree) — Task 3 test `pre-paint script matches initialTheme`.
- 3D panel keeps old colours after toggling while open — Task 4 test `re-creates the scene when the theme changes`.

---

### Task 1: Token system and contrast tests

**Files:**
- Modify: `src/ui/styles.css` (all colour literals → tokens; two token blocks; `color-scheme`)
- Create: `tests/ui/contrast.test.ts`, `tests/ui/contrastMath.ts`

**Interfaces:**
- Produces (test helpers, reused by Task 5's audit script logic):
  ```ts
  // tests/ui/contrastMath.ts
  export type RGBA = [number, number, number, number];
  export function parseColor(v: string): RGBA;          // #rgb, #rrggbb, #rrggbbaa, rgb(), rgba()
  export function composite(fg: RGBA, bg: RGBA): RGBA;  // alpha over opaque bg
  export function contrast(a: RGBA, b: RGBA): number;   // WCAG 2.x relative luminance ratio
  export function themeTokens(css: string, theme: 'light' | 'dark'): Record<string, string>; // light = `:root {`, dark = `:root[data-theme='dark'] {`
  ```
- Produces (tokens used by later tasks): at least `--bg --panel --raised --text --muted --border --wire --gate-fill --gate-text --gate-border --ctl --chart-bar --out-fill --out-digit --arrow --sphere --bloch-outline --bloch-circle --bloch-axis --danger --danger-bg --focus --select --shadow --backdrop --drop-target --gate-glyph --button-bg --button-hover-bg --button-text --button-border --sphere-mixed --badge-bg --badge-text`, values per spec table (`--sphere`, `--arrow` included; `--bloch-outline`/`--bloch-circle`/`--bloch-axis` chosen to pass 3:1 on `--panel`).

- [ ] **Step 1: Write the failing tests** in `tests/ui/contrast.test.ts` (read `src/ui/styles.css` with `fs`):
  - `contrast math`: `contrast(parseColor('#000'), parseColor('#fff'))` ≈ 21; `#777` vs `#fff` ≈ 4.48 (±0.01); `composite([0,0,0,0.5],[255,255,255,1])` → `[127.5,127.5,127.5,1]` (±0.5).
  - `both themes define the same tokens`: key sets of `themeTokens(css,'light')` and `'dark'` are equal and non-empty.
  - `pairs meet their minimum` — `it.each` over `theme × PAIRS`, where `PAIRS: { fg: string; bg: string; min: 7 | 4.5 | 3; what: string; via?: string }[]` (`via` = surface a translucent bg is composited on). Must include at least: text/muted on bg, panel, raised, danger-bg; gate-text on gate-fill; gate-border, border, wire, ctl, chart-bar, focus, select, danger, arrow, bloch-outline, bloch-circle, bloch-axis on panel; focus and gate-border on bg; danger on danger-bg and panel; out-digit on out-fill and on panel; text on drop-target via panel; text on raised for dialog/card. **Per-surface lists** (test asserts PAIRS contains every combination): `--panel`: text, muted, border, wire, gate-border, ctl, chart-bar, focus, select, danger, arrow, bloch-outline, bloch-circle, bloch-axis, button-border; `--bg`: text, muted, focus, gate-border, border; `--raised`: text, muted, border, danger, focus; `--danger-bg`: text, danger, focus; `--gate-fill`: gate-text, gate-glyph; `--sphere` (and `--sphere-mixed`): arrow, bloch-circle, bloch-axis; `--drop-target` over `--panel`: wire, gate-border, ctl, text; `--button-bg`/`--button-hover-bg`: button-text, focus; badge surface: badge text. `--border` vs `--backdrop` composited over `--bg` and over `--panel` ≥ 3. Out digit on `--out-fill` and on `--panel` ≥ 7.
  - `documented exceptions`: `EXCEPTIONS = [{ fg:'--out-fill', bg:'--panel', theme:'both', why:'Out fill level, user choice 2026-11-19; P(1) in accessible name' }, { fg:'--bloch-circle', bg:'--sphere', theme:'light', why:'today's lit sphere kept, user choice 2026-11-19' }]` (the light sphere's arrow/circle pairs are listed with `theme:'light'`); asserts the listed pairs are below their min (so the list stays truthful) and that no other pair is below its `min`. In dark, `--bloch-*`/`--arrow` on `--sphere` and `--panel` are ordinary PAIRS.
  - `every token is measured or declared decorative`: every token name appears in `PAIRS`/`EXCEPTIONS` or in `DECORATIVE = ['--shadow']` (with reason in a comment).
  - `no colour literals outside the token blocks`: after removing the two token blocks and any `@media (forced-colors: active) { … }` block, `styles.css` matches none of `/#[0-9a-fA-F]{3,8}\b/`, `/rgba?\(/`, `/hsla?\(/`, named colours in colour properties (anything but `transparent`, `currentColor`, `inherit`, `none`), and no `var(--x, <fallback colour>)`.
  - `color-scheme per theme`: light block contains `color-scheme: light`, dark block `color-scheme: dark`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/contrast.test.ts` — expected FAIL (no dark block; literals present; current light values fail pairs).
- [ ] **Step 3: Implement**: rewrite every colour use in `styles.css` to tokens; add `color-scheme` to each block; replace the undefined `--border` fallbacks; remove `--cyan`, `--gate`, `--gate-dark`, `--grid-border`, `--line` in favour of the semantic names (update all references). Adjust token values only where a pair fails, and only toward passing.
- [ ] **Step 4: Run** `npx vitest run tests/ui/contrast.test.ts` — expected PASS; `npm test` — all PASS.
- [ ] **Step 5: Commit** `feat(theme): semantic colour tokens for light and dark with contrast tests`.

### Task 2: Components without literals or opacity states

**Files:**
- Modify: `src/ui/ProbabilityChart.tsx`, `src/ui/OutColumn.tsx`, `src/ui/KetView.tsx`, `src/ui/BlochStrip.tsx` (badge absolutely positioned in the section's top-right corner, outside the grid flow), `src/ui/GateView.tsx` (SVG glyph `stroke="#000"` → `currentColor` from `--gate-glyph`), `src/ui/styles.css`
- Create: `src/ui/UpdatingBadge.tsx`
- Test: `tests/ui/themeComponents.test.tsx`

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: `export default function UpdatingBadge(): JSX.Element` — `<span className="updating-badge" role="status">Updating…</span>`, shown by the panel only when `stale`; the CSS keeps the existing 250 ms delay via `animation-delay`/`visibility` (no opacity on content).

- [ ] **Step 1: Write the failing tests:**
  - `no colour literals in components`: no file in `src/ui/**/*.{ts,tsx}` contains `/#[0-9a-fA-F]{3,8}\b/`, `rgb(`, `hsl(`, or `/0x[0-9a-fA-F]{6}/`, and no named colour as a `fill`/`stroke`/`color` value (no exemptions; Task 4 removes the three.js literals).
  - `out box names its probability`: render `OutColumn` with `qubitP1=[0.6]` → `getByRole('img', { name: 'q[0] output: 1, P(1) = 60.0 %' })`; while computing (`qubitP1=null`) → name `q[0] output: computing`.
  - `stale panels keep full content and show Updating`: render `KetView` with `stale` → an element `.updating-badge` with text `Updating…` and `aria-hidden="true"`, section `aria-busy="true"`; same for `ProbabilityChart` and `BlochStrip`; without `stale` no badge.
  - `chart marks are classed`: render `ProbabilityChart` with 2 qubits; every `<text>`, `<line>`, `<rect>` has a class, and each class has a CSS rule setting `fill`/`stroke` to a token that PAIRS measures on `--panel` (text tokens at 7, marks at 3).
  - `ring rules`: in `styles.css` every rule whose selector contains `:focus`, `:focus-visible`, `.selected` or `.selection` and sets `outline*` has width ≥ 2px and the offsets from Global Constraints; no `box-shadow` in those rules; no `outline: none`/`0` without a replacement outline in the same rule.
  - `styles have no opacity states`: `styles.css` has no `opacity` declaration on selectors containing `.stale`, `.orphan`, `.dragging`, or `thead`.
  - `invalid gate has a non-colour badge`: `styles.css` contains a `.gate.invalid::after` rule with `content: '!'`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/themeComponents.test.tsx` — expected FAIL.
- [ ] **Step 3: Implement**: chart/meter SVG colours via classes (`.chart-bar`, `.chart-grid`, `.chart-tick`, `.meter-icon *` using `currentColor`/tokens); Out box `aria-label`; `UpdatingBadge` in the three panels' headers; replace `.stale` opacity with nothing on content; orphan control keeps its fill and gets the dashed outer ring (Global Constraints); drag source → dashed `--border` outline placeholder; `thead th` → `color: var(--muted)`; invalid badge; focus/selection rings: global `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }` and `.selection` / selected control / selected mini Bloch use `--select` outline at offset 2px (focus at 5px); `button` styled from the button tokens; `.angle-dialog` and `.gate-card` get a `--border` border. Add new token pairs (badge text on panel, etc.) to Task 1's `PAIRS`.
- [ ] **Step 4: Run** the test file and `tests/ui/contrast.test.ts` — expected PASS; `npm test` — all PASS (update any existing test that asserted the old `stale` opacity or Out-box label, recording a ruling).
- [ ] **Step 5: Commit** `feat(theme): token-based charts, Updating badge, non-colour state cues`.

### Task 3: Theme state, pre-paint and toggle

**Files:**
- Create: `src/ui/theme.ts`, `src/ui/ThemeToggle.tsx`
- Modify: `index.html` (inline pre-paint script in `<head>`), `src/ui/App.tsx` (header with title + toggle), `src/ui/styles.css` (header and toggle styles)
- Test: `tests/ui/theme.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type Theme = 'light' | 'dark';
  export const THEME_KEY = 'qgl-theme';
  export function storedTheme(): Theme | null;        // try/catch; ignores invalid values
  export function initialTheme(): Theme;              // stored ?? (matchMedia light ? 'light' : 'dark')
  export function applyTheme(t: Theme): void;         // documentElement.dataset.theme = t
  export function useTheme(): [Theme, (t: Theme) => void]; // shared store via useSyncExternalStore; setter stores, applyTheme()s, then notifies; follows OS while nothing stored
  export const PREPAINT_SCRIPT: string;               // the exact inline script text used in index.html
  ```
  `ThemeToggle` renders `<button type="button" className="theme-toggle">` with an icon (`aria-hidden`) and text `Switch to light theme` / `Switch to dark theme`.

- [ ] **Step 1: Write the failing tests** (mock `window.matchMedia` per test; clear `localStorage`):
  - `initial theme`: stored `'light'` → light; stored garbage → falls back; no stored + OS light → light; no stored + OS dark → dark; no stored + no preference (`matches:false` for both) → dark; `window.matchMedia` undefined → dark; `localStorage.getItem` throwing → OS rule; `setItem` throwing → toggle still applies the theme.
  - `shared state`: two components using `useTheme` in one tree; clicking `ThemeToggle` updates both.
  - `toggle stores and applies`: render `<ThemeToggle />` in dark → button text `Switch to light theme`, no `aria-pressed`; click → `document.documentElement.dataset.theme === 'light'`, `localStorage[THEME_KEY] === 'light'`, text `Switch to dark theme`.
  - `follows OS only without a stored choice`: fire the media `change` listener with light → theme light; after a click (stored) a further change does not switch.
  - `pre-paint script matches initialTheme`: `index.html` contains `PREPAINT_SCRIPT` verbatim inside `<head>`, in a `<script>` with no `type="module"`, `defer` or `async`, before any stylesheet `<link>`; evaluating it (`new Function(PREPAINT_SCRIPT)()`) under each of the scenarios above sets `dataset.theme` equal to `initialTheme()`.
  - `toggle target size`: `styles.css` `.theme-toggle` has `min-height` and `min-width` ≥ `24px`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/theme.test.tsx` — expected FAIL.
- [ ] **Step 3: Implement** `theme.ts`, `ThemeToggle`, the script in `index.html` (same text as `PREPAINT_SCRIPT`, which must not depend on bundling), and the header (`<header className="app-header"><h1>…</h1><ThemeToggle /></header>`).
- [ ] **Step 4: Run** — expected PASS; `npm test`, `npm run build` — PASS.
- [ ] **Step 5: Commit** `feat(theme): OS-following theme with remembered toggle and no flash`.

### Task 4: Themed 3D Bloch panel

**Files:**
- Modify: `src/ui/blochScene.ts`, `src/ui/BlochPanel.tsx`, `src/ui/styles.css` (3D label backing)
- Test: `tests/ui/blochTheme.test.tsx`

**Interfaces:**
- Consumes: tokens `--sphere --bloch-outline --bloch-circle --bloch-axis --arrow` (Task 1); `useTheme` (Task 3).
- Produces:
  ```ts
  export type BlochColors = { sphere: number; outline: number; circle: number; axis: number; arrow: number };
  export type BlochStyle = { mode: 'lit' | 'flat'; colors: BlochColors };
  export function readBlochStyle(root?: Element): BlochStyle;  // light → 'lit', dark → 'flat'; forced colours → 'flat' with system colours (CanvasText / Canvas)
  export function createBlochScene(host: HTMLElement, style: BlochStyle): BlochScene | null;
  ```

Rendering: `'lit'` = today's scene exactly (ambient 0.9 + directional 1.2, Phong fill opacity 0.18, circles 0.9 / 0.45, axes, arrow), colours from `style.colors`, no outline. `'flat'` = no lights, `MeshBasicMaterial` / `LineBasicMaterial`, opaque lines, fill at fixed alpha 0.55, a silhouette ring in `outline` placed each render at distance 1/D toward the camera with scale √(1 − 1/D²) (D = camera distance, unit sphere), facing the camera. 3D labels: light keeps today's styles via light tokens; dark uses `var(--raised)` backing (opaque).

- [ ] **Step 1: Write the failing tests:**
  - `readBlochStyle reads tokens`: set inline `--sphere:#112233` etc. on a test element → returns `0x112233`…; with `matchMedia('(forced-colors: active)')` matching → returns values from `CanvasText`/`Canvas` computed on a probe element (mock `getComputedStyle` to return `rgb(255, 255, 255)` / `rgb(0, 0, 0)`).
  - Test setup: inject `fs.readFileSync('src/ui/styles.css')` into a `<style>` (Vitest does not load imported CSS; jsdom 29 resolves custom properties from it).
  - `re-creates the scene when the theme changes`: `vi.mock('../../src/ui/blochScene', …)` records `createBlochScene` calls (keep the real `readBlochStyle`); stub `WebGLRenderingContext`; render `ThemeToggle` and `BlochPanel` as siblings; `await waitFor` the first call; click the real toggle → second call; first scene's `dispose` called once; the two calls' colours equal `parseColor(themeTokens(css, theme)['--sphere'])` etc. for each theme.
  - `scene uses only the given colours`: `blochScene.ts` source contains no `/0x[0-9a-fA-F]{6}/`; with `THREE.WebGLRenderer` mocked to a stub, every coloured material in a created scene has a colour from the passed `BlochColors` in both modes; `'flat'` has no lights, no `MeshPhongMaterial`, no line material with opacity < 1, and one ring mesh; `'lit'` has exactly today's lights and opacities (0.18 / 0.9 / 0.45).
  - `light theme keeps today's sphere`: `readBlochStyle()` under light tokens returns `mode:'lit'` and colours 0x9fc4ee / 0x4a6080 / 0x555555 / 0xff2020 (parsed from the tokens, not literals in the test either).
  - `3D labels are opaque`: `styles.css` `.bloch3d-label` rules use `var(--raised)` and no `rgba(`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/blochTheme.test.tsx` — expected FAIL.
- [ ] **Step 3: Implement**; `BlochPanel` passes `readBlochStyle()` and depends on `theme` in the scene effect.
- [ ] **Step 4: Run** — PASS; `npm test` — PASS.
- [ ] **Step 5: Commit** `feat(theme): Bloch sphere colours from theme tokens, flat full-contrast rendering`.

### Task 5: Forced colours and the real-browser audit; iterate to clean

**Files:**
- Modify: `src/ui/styles.css` (`@media (forced-colors: active)` block), `package.json` (devDependencies `playwright-core`, `axe-core`, `pngjs`; script `"a11y": "node scripts/a11y-audit.mjs"`), `README.md`
- Create: `scripts/a11y-audit.mjs`, `scripts/a11y-fixture.json`
- Test: the audit itself (`npm run a11y`) plus `tests/ui/forcedColors.test.ts`

Audit script behaviour:
- Starts `vite preview` on a free port after `npm run build` (or reuses `--url`), launches Chrome via `playwright-core` (`executablePath` from `CHROME_PATH` or the macOS default path).
- Loads `scripts/a11y-fixture.json` (a circuit with H, controlled X with one open control, SWAP on reversed wires, invalid RX, orphan control, MEASURE) via the URL hash; for each theme (`localStorage['qgl-theme']` set before load): states = default, gate card open (hover a grid gate 500 ms), Bloch panel open (click a mini Bloch), angle dialog open (double-click RX), keyboard focus on a palette gate (Tab), a gate selected.
- Before any screenshot or axe run: device scale factor 1, `emulateMedia({ reducedMotion: 'reduce' })`, wait until no `.computing` / `[aria-busy=true]` remains. Launch Chrome with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` (headless Chrome has no WebGL otherwise; verified while previewing the sphere).
- In each state: run axe with tags `wcag2a, wcag2aa, wcag21aa, wcag22aa, wcag2aaa` (includes `color-contrast-enhanced`); fail on any violation; fail on any **incomplete** result whose target is not in `COVERED = { selector → named pixel check }` (e.g. `.out-digit` → out-digit check, `.bloch3d-label` → 3D label check).
- Focus walk: Tab through every focus stop in both themes; at each stop assert computed `outline-style` ≠ `none`, width ≥ 2px, offset ≥ 2px, and that `elementFromPoint` at the ring's four midpoints is not inside `.gate-card` or `.modal-backdrop`; run the ring pixel check at each stop. Also check a selected + focused gate shows both rings.
- Pixel checks from a screenshot decoded with `pngjs`, using element boxes from the page. Sampling rule: background = the mode colour of the element's box; foreground = the pixel in the glyph/ring area with the highest contrast against that background; ring area = element box grown by offset + half the outline width. Checks: digit vs fill and digit vs empty part of an Out box (≥ 7), Out fill vs empty (report only — the exception), chart bar vs panel (≥ 3), gate label vs fill (≥ 7), gate outline vs panel (≥ 3), control ball vs panel (≥ 3), focus ring vs panel (≥ 3), selection ring vs panel (≥ 3), invalid "!" vs its background (≥ 7), Bloch canvas outline/arrow/circles vs canvas background (≥ 3; dark gated, light reported as exception 2), 3D label text vs its backing (≥ 7; light reported), chart tick and row-label text vs panel (≥ 7), `.strip-label` text (≥ 7), button text vs button (≥ 7). Uses `contrast` logic equivalent to `tests/ui/contrastMath.ts` (import it via a small `.mjs` copy or `tsx`-free reimplementation; keep the two in sync with a unit test comparing outputs on sample colours).
- Forced colours: `page.emulateMedia({ forcedColors: 'active' })`, then assert gates, wires, controls, selection and focus ring have non-transparent, non-background computed borders/outlines, and a filled control's computed background differs from an open control's.
- Writes screenshots to `a11y-report/<theme>-<state>.png` (git-ignored) and exits non-zero on any failure, printing each failure with theme, state, check and measured ratio.

- [ ] **Step 1: Write the failing test** `tests/ui/forcedColors.test.ts`: `styles.css` has a `@media (forced-colors: active)` block that sets `forced-color-adjust` or system-colour borders for `.gate`, `.ctl-ball`, `.connector`, `.selection`, `:focus-visible`; and `contrastMath` vs the script's copy agree on 5 sample pairs.
- [ ] **Step 2: Run** `npx vitest run tests/ui/forcedColors.test.ts` — expected FAIL.
- [ ] **Step 3: Implement** the forced-colours block, the audit script, fixture, `.gitignore` entry `a11y-report/`, README section ("Accessibility: both themes meet WCAG 2.2 AAA text contrast…; run `npm run a11y`").
- [ ] **Step 4: Run** `npm run a11y` — fix every failure in tokens/markup (rerun Task 1/2 tests after each change) until it exits 0 in both themes; then `npm test` and `npm run build` — PASS. Read the saved screenshots of every state in both themes and check them by eye.
- [ ] **Step 5: Commit** `feat(theme): forced-colours support and real-browser accessibility audit`.
