# Dark theme with uncompromised accessibility

Date: 2026-11-19 · Size: project

## Why

Many users prefer a dark theme, and the user wants it as their own default. The user's bar:
"no compromises on accessibility": the dark theme must be exactly as clear and usable as the light
one, verified against web accessibility standards, iterated until every pair passes, and both
specification and implementation checked with strict QA. While measuring, it turned out the
current light theme also misses that bar (gate labels 6.4:1, help text 5.6:1, control orange
2.1:1, panel borders 2.6:1, Out bars 1.3:1), so both themes are brought to the same standard.

## Goals / non-goals / anti-goals

- Goals: a light and a dark theme that both meet the targets below for every foreground/background
  pair in the app (including the 3D Bloch panel, SVG chart and icons, dialogs, cards, warnings,
  focus and selection), a theme toggle, and automated checks that fail the build when any pair
  drops below target.
- Non-goals: more than two themes, user-picked accent colours, a high-contrast theme of our own
  (the OS forced-colours mode is supported instead), changing font sizes or layout.
- Anti-goals: any colour pair below target in either theme (the one documented exception is the Out-box fill level, see below); meaning carried by colour alone;
  a flash of the wrong theme on load; a "white window" exception (the 3D panel is themed too).

## Accessibility targets (decided with the user: "no compromises")

- Text: WCAG 2.2 **AAA 1.4.6** — at least **7:1**, large text (≥ 24px, or ≥ 18.66px bold) at
  least 4.5:1. Applies to all text including small labels (gate subtitles, axis labels, notes,
  chart ticks, row labels), placeholder-free inputs, disabled controls excluded per WCAG.
- Non-text: WCAG **1.4.11** — at least **3:1** for every visual needed to identify a component or
  its state and for meaningful graphics: gate outlines, wires, control balls and lines, connector
  bars, selection marks, focus ring, input borders, the Bloch sphere outline, its state arrow,
  probability bars and Out bars, warning borders. (WCAG sets no AAA level above 3:1 here.)
- Focus: **2.4.7/2.4.11/2.4.13** — every focusable element has a visible focus ring of at least
  2px, contrast ≥ 3:1 against adjacent colours, never hidden by the card or overlays.
- Use of colour: **1.4.1** — states stay distinguishable without colour (control filled vs open,
  invalid gate also gets an icon/pattern, selection is a ring shape, controlled gates keep their
  connector line, errors carry text).
- Forced colours (Windows High Contrast): `@media (forced-colors: active)` keeps gates, wires,
  controls, selection and focus visible using system colours.
- Translucent colours (shadows, overlays, highlighted drop cells) are composited over the colour
  they sit on before measuring.

## Approaches

- **1. Semantic CSS custom properties, defined twice (picked by the user).** All colours become
  named tokens in `styles.css`; `:root` (light) and `:root[data-theme="dark"]` define them.
  Components and SVGs use only tokens; the 3D scene reads its few colours from the same tokens.
  A test parses both blocks and checks every declared pair.
- 2. TypeScript token table generating CSS. One source for tests and three.js, but colours leave
  CSS and a generated pre-paint style block adds a build step.
- 3. CSS `light-dark()`. Compact, but newer-browser only and pairs are scattered, harder to audit.
- Dropped: keeping the 3D Bloch panel white. Measuring showed it needs only four colours from
  tokens and a re-create on theme change; no refactor is needed.

## Decided with the user

- Initial theme: follow the OS (`prefers-color-scheme`); **dark** when the OS says dark or gives
  no preference; light only when the OS asks for light. A choice made with the toggle is
  remembered and overrides the OS from then on.
- The proposed palette (shown side by side, "looking good") is the starting point:

  | token role | light | dark |
  |---|---|---|
  | page background `--bg` | #f6f7f9 | #0f1318 |
  | panel `--panel` | #ffffff | #181d24 |
  | raised surface (dialog, card) `--raised` | #ffffff | #20262f |
  | text `--text` | #111418 | #eef2f6 |
  | secondary text `--muted` | #454d57 | #b9c2cc |
  | UI border `--border` | #6b7480 | #808b98 |
  | wire / glyph ink `--wire` | #1f2328 | #cfd6de |
  | gate fill `--gate-fill` | #a9cdf7 | #1f4d86 |
  | gate label `--gate-text` | #000000 | #ffffff |
  | gate outline `--gate-border` | #2a5fa3 | #8fbcf5 |
  | control / controlled `--ctl` | #a8560a | #ffb562 |
  | probability chart bar `--chart-bar` | #1f4e9c | #8ab8f5 |
  | Out box fill `--out-fill` | #7ff4f8 (today's) | #1b4a80 |
  | Out digit `--out-digit` | #000000 | #ffffff |
  | Bloch arrow `--arrow` | #c41e1e | #ff7a7a |
  | Bloch sphere fill `--sphere` | #e8f0fa | #22344c |
  | error text and outline `--danger` | #a3001b | #ff9aa5 |
  | error surface `--danger-bg` | #fff1f3 | #3b1219 |
  | focus ring `--focus` | #1652c4 | #8db7ff |
  | selection ring `--select` | #3d4652 | #c3ccd6 |

  Values may change during implementation only to make a pair pass; the tests are the gate.
- Strict QA on both spec and implementation.
- **No green/teal for probabilities** (misleading); bars are blue in both themes. In the light
  theme the user wanted the original blue tone kept; the chart keeps today's #1f4e9c.
- **Out column: soft fill, no line, as today (the user's final choice, after comparing it side by
  side with a clear fill plus outlined digit).** The digit passes on both parts (light 16:1 / 21:1,
  dark 8.0:1 / 15:1), but the fill level differs from the empty part by only 1.3:1 (light) and
  1.9:1 (dark), below the 3:1 of WCAG 1.4.11. This is the **one documented exception** to the
  targets. Mitigation (my call): the exact value is also text — the Out box's accessible name
  becomes `q[0] output: 1, P(1) = 60.0 %` and the hover title stays. The contrast test lists this
  pair as an explicit, named exception and fails if any other exception appears.

## Design

### Tokens

- Every colour in `styles.css` (today 11 tokens plus ~67 literals, and the undefined
  `--border` fallback `#ccc`) moves into semantic tokens. Outside the two token blocks and the
  forced-colours block, `styles.css` contains no colour literals.
- Additional tokens as needed for existing uses, each with both values: drop-target highlight,
  trash/danger outline, barrier, init/out box surfaces, mixed-state surfaces (Bloch strip and
  panel), Bloch circle lines, Bloch axis lines, 3D label backing, chart grid lines and tick text,
  modal backdrop, shadows. Translucent tokens are listed with the surface they are measured on.
- `color-scheme: light` / `dark` is set per theme so native controls (inputs, scrollbars,
  checkboxes) follow.

### Components

- `ProbabilityChart.tsx`, `OutColumn.tsx`: SVG colour attributes replaced by CSS classes using tokens.
- `blochScene.ts`: `createBlochScene(host, colors)` takes `{ sphere, outline, circle, axis, arrow }`
  (hex numbers); a helper `readBlochColors()` reads them from computed token values on
  `document.documentElement`. `BlochPanel` re-creates the scene when the theme changes.
  So that rendered pixels equal the measured tokens, the sphere and lines use unlit
  (`MeshBasicMaterial` / `LineBasicMaterial`) materials at full opacity (the sphere fill may keep a
  fixed alpha only if its composited colour over `--panel` is what the token table measures), and
  a real silhouette outline circle (`--bloch-outline`, ≥ 3:1 vs `--panel`) is added, always facing
  the camera. Axis/state labels are HTML with a solid `--raised` backing (no translucency), so their
  contrast does not depend on the canvas behind them. In forced-colours mode `readBlochColors()`
  returns system colours (CanvasText for lines/outline/arrow, Canvas for the fill).
- `MiniBloch` keeps its CSS classes; their rules use tokens.
- Invalid gates get a non-colour cue in addition to red: a small "!" badge (CSS `::after`),
  itself ≥ 7:1 against its own background.
- Opacity is no longer used to signal state (it breaks contrast):
  - Stale results (`.prob-chart`, `.ket-view`, `.bloch-strip` while recomputing): content stays at
    full contrast; after the existing 250 ms delay an "Updating…" badge appears in the panel header
    (text ≥ 7:1), and the panel keeps `aria-busy`.
  - Orphan control (no gate in its step): full-contrast dashed ring instead of 40 % opacity.
  - Drag source (`.dragging`): full-contrast dashed outline placeholder instead of fading.
  - Euler table header (`thead th`, 0.7): uses `--muted`.
- Focus and selection rings are drawn with a gap (outline-offset ≥ 2px) so they sit on the
  surface, never directly against a gate outline or wire; "adjacent colour" for every ring and
  graphic is defined as the surface it is drawn on (the gap guarantees this).

### Theme state and toggle

- `src/ui/theme.ts`: `type Theme = 'light' | 'dark'`; `initialTheme()` = stored choice, else
  `matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'`; `applyTheme(t)` sets
  `document.documentElement.dataset.theme`; storage key `qgl-theme`. Storage access wrapped in
  try/catch (private mode). While no choice is stored, a change of the OS preference is followed live.
- `useTheme()` hook returns `[theme, setTheme]`; setting stores the choice.
- Pre-paint: an inline script in `index.html` `<head>` runs the same `initialTheme` logic before
  the first paint so there is no flash.
- Toggle: a button in the app header next to the title, showing an icon and the text of the
  action ("Switch to light theme" / "Switch to dark theme"), **no** `aria-pressed` (a changing
  label plus a pressed state is announced misleadingly), keyboard operable, visible focus,
  ≥ 24×24 px target (WCAG 2.5.8).

### Verification (strict QA)

1. **Contrast unit test** (`tests/ui/contrast.test.ts`): parses both token blocks from
   `styles.css`, composites translucent tokens, and checks a declared table of every
   foreground/background pair with its minimum (7, 4.5 for large text, 3 for non-text). A second
   test fails if any token used in a pair is missing in either theme.
2. **No stray colours test**: `styles.css` outside the token/forced-colours blocks and all
   `src/ui/**/*.tsx` contain no colour literals (hex, `rgb(`, `hsl(`, named colours in
   fill/stroke), except `blochScene.ts`, which gets colours only from `readBlochColors`.
3. **Theme logic tests**: initial theme from storage / OS light / OS dark / no preference;
   toggle stores and applies; OS change followed only without a stored choice; storage errors
   tolerated; the pre-paint script and `initialTheme` agree.
4. **Real-browser audit** (`scripts/a11y-audit.mjs`, devDependencies `playwright-core` and
   `axe-core`): loads a fixture circuit in both themes, opens the gate card, the Bloch panel,
   the angle dialog and a warning, runs axe (WCAG 2.2 AA + AAA rules, including
   `color-contrast-enhanced`) and saves screenshots. Zero violations **and zero "incomplete"**
   results required in both themes; an incomplete result is a failure until the markup is changed
   so axe can decide, or the case is covered by the pixel check below.
   - Pixel check (because axe does not check non-text contrast or canvas): from the screenshots,
     sample the rendered colours of Out boxes (digit on fill and on empty part; fill vs empty is
     the documented exception and is reported, not failed), chart
     bars, gate fill/outline/label, control ball and line, focus and selection rings, invalid-gate
     badge and the 3D Bloch outline, arrow and labels, and assert the same thresholds against the
     surface they sit on.
   - Emulates `forced-colors: active` and checks key elements stay visible.
5. Iterate: any failure is fixed in the palette or markup and all checks rerun until clean.

## Calls I made (check these)

- Out column exception mitigated by putting P(1) in the accessible name.
- "Updating…" badge replaces fading for stale results (confirmed by the user after an explanation).
- Toggle labelled with the action, without `aria-pressed`.
- 3D Bloch panel switches to unlit, full-contrast materials with a silhouette outline; it will
  look flatter than today's lit sphere.
- Orphan controls and drag sources use dashed full-contrast outlines instead of fading.
- QA treats axe "incomplete" as failure and adds a rendered-pixel contrast check.

- Both themes meet the same AAA text target; this changes the look of the light theme
  (lighter gate fill with darker outline, darker help text, darker orange).
- Toggle in the header, labelled with the theme it switches to.
- Invalid gates get a "!" badge as the non-colour cue.
- `playwright-core` and `axe-core` are added as devDependencies for the audit script; it uses the
  locally installed Chrome. Not part of `npm test` (needs a browser); run with `npm run a11y`.
- Font sizes stay as they are (contrast rules apply to them at their current size).

## Left to the builder

- Token names beyond the table, exact `forced-colors` rules, the toggle icon, and the fixture
  circuit for the audit.
