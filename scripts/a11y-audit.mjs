#!/usr/bin/env node
// Real-browser accessibility audit for both themes (spec: docs/superpowers/specs/2026-11-19-dark-theme-design.md).
//   npm run a11y                 build, serve with `vite preview`, audit, exit 1 on any failure
//   npm run a11y -- --url URL    audit an already running app
// Needs a local Chrome (CHROME_PATH, or the macOS default path). Screenshots go to a11y-report/.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { composite, contrast, parseColor } from './contrast.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const OUT = resolve(root, 'a11y-report');
mkdirSync(OUT, { recursive: true });

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fixture = readFileSync(resolve(root, 'scripts/a11y-fixture.json'), 'utf8');
const HASH = Buffer.from(JSON.stringify(JSON.parse(fixture))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** axe "incomplete" results allowed only where a named pixel check below covers the same element. */
const cls = (c) => new RegExp(`\\.${c}(?![\\w-])`);
const COVERED = [
  [cls('out-digit'), 'out digit'],
  [cls('out-box'), 'out digit'],
  [cls('bloch3d-label'), '3D label'],
  [cls('gate-label'), 'gate label'],
  [cls('gate-sub'), 'gate label'],
  [cls('updating-badge'), 'badge'],
  [/\.chart-(tick|label|value)(?![\w-])/, 'chart text'],
  [/^text\[x=/, 'chart text'],
  [/\.corner-(tl|tr|bl|br)(?![\w-])/, 'corner label'],
  [cls('theme-toggle-icon'), 'button text'],
  [/\.more-toggle(?![\w-])/, 'button text'],
  [/^#\\:r[0-9a-z]+\\:-title$/, 'dialog title'],
];

const failures = [];
const reports = [];
const fail = (theme, state, check, detail) => failures.push(`${theme} · ${state} · ${check}: ${detail}`);
const note = (theme, state, check, detail) => reports.push(`${theme} · ${state} · ${check}: ${detail}`);

// ---------------------------------------------------------------- server

async function serve() {
  const arg = process.argv.indexOf('--url');
  if (arg > 0) return { url: process.argv[arg + 1], stop: () => {} };
  await run('npm', ['run', 'build']);
  const port = 4300 + Math.floor(Math.random() * 500);
  const child = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, bad) => {
    child.stdout.on('data', (d) => String(d).includes('Local') && ok());
    child.on('exit', (c) => bad(new Error(`vite preview exited ${c}`)));
  });
  return { url: `http://localhost:${port}/`, stop: () => child.kill() };
}

function run(cmd, args) {
  return new Promise((ok, bad) => {
    const p = spawn(cmd, args, { cwd: root, stdio: 'inherit' });
    p.on('exit', (c) => (c === 0 ? ok() : bad(new Error(`${cmd} ${args.join(' ')} exited ${c}`))));
  });
}

// ---------------------------------------------------------------- pixels

function decode(buf) {
  const png = PNG.sync.read(buf);
  return { w: png.width, h: png.height, at: (x, y) => { const i = (png.width * y + x) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2], 1]; } };
}

function pixelsIn(img, box, skip) {
  const out = [];
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(img.w, Math.ceil(box.x + box.width)), y1 = Math.min(img.h, Math.ceil(box.y + box.height));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!skip || !skip(x, y)) out.push(img.at(x, y));
  return out;
}

const key = (c) => `${c[0]},${c[1]},${c[2]}`;
function mode(px) {
  const n = new Map();
  for (const c of px) n.set(key(c), (n.get(key(c)) ?? 0) + 1);
  const [k] = [...n.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['255,255,255'];
  return [...k.split(',').map(Number), 1];
}

/** Background = mode colour of `bgBox`; foreground = the pixel in `fgBox` with the highest contrast against it. */
function measure(img, fgBox, bgBox = fgBox, skip) {
  const bg = mode(pixelsIn(img, bgBox));
  let best = 1;
  for (const c of pixelsIn(img, fgBox, skip)) best = Math.max(best, contrast(c, bg));
  return best;
}

const grow = (b, d) => ({ x: b.x - d, y: b.y - d, width: b.width + 2 * d, height: b.height + 2 * d });
const inside = (b) => (x, y) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height;

// ---------------------------------------------------------------- page helpers

async function settle(page) {
  await page.waitForFunction(() => !document.querySelector('.computing') && !document.querySelector('[aria-busy="true"]'), null, { timeout: 15000 });
  await page.waitForTimeout(150);
}

async function box(page, sel) {
  const el = await page.$(sel);
  return el ? await el.boundingBox() : null;
}

async function axe(page, theme, state) {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE });
  const res = await page.evaluate(() =>
    window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'wcag2aaa'] }, resultTypes: ['violations', 'incomplete'] }),
  );
  for (const v of res.violations) for (const n of v.nodes) fail(theme, state, `axe ${v.id}`, `${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim() ?? v.help}`);
  for (const v of res.incomplete)
    for (const n of v.nodes) {
      const t = n.target.join(' ');
      const covered = COVERED.find(([re]) => re.test(t));
      if (covered) note(theme, state, `axe incomplete ${v.id}`, `${t} → covered by pixel check "${covered[1]}"`);
      else fail(theme, state, `axe incomplete ${v.id}`, `${t} (not covered by a pixel check)`);
    }
}

async function shot(page, theme, state) {
  const buf = await page.screenshot({ path: resolve(OUT, `${theme}-${state}.png`) });
  return decode(buf);
}

function gate(theme, state, check, r, min, exception) {
  const line = `${r.toFixed(2)}:1 (min ${min})`;
  if (r >= min) note(theme, state, check, line);
  else if (exception) note(theme, state, `${check} [documented exception: ${exception}]`, line);
  else fail(theme, state, check, line);
}

// ---------------------------------------------------------------- checks per state

async function pixelChecks(page, img, theme, state) {
  // Out boxes: digit on the fill and on the empty part (7), fill level vs empty (exception 1)
  for (const ob of await page.$$('.out-box')) {
    const b = await ob.boundingBox();
    const fill = await (await ob.$('.out-fill')).boundingBox();
    const digit = await ob.$('.out-digit');
    const glyph = await digit.evaluate((d) => {
      const r = document.createRange();
      r.selectNodeContents(d);
      const g = r.getBoundingClientRect();
      return { x: g.x, y: g.y, width: g.width, height: g.height };
    });
    if (!glyph.width) continue;
    const inner = grow(b, -2);
    if (fill.width > 4) {
      const onFill = { x: glyph.x, y: glyph.y, width: Math.max(0, Math.min(glyph.x + glyph.width, fill.x + fill.width) - glyph.x), height: glyph.height };
      if (onFill.width > 1) gate(theme, state, 'out digit on fill', measure(img, onFill, { ...grow(fill, -1), height: 3 }), 7);
    }
    const emptyX = fill.x + fill.width;
    const onEmpty = { x: Math.max(glyph.x, emptyX), y: glyph.y, width: glyph.x + glyph.width - Math.max(glyph.x, emptyX), height: glyph.height };
    if (onEmpty.width > 1) gate(theme, state, 'out digit on empty', measure(img, onEmpty, { x: emptyX + 1, y: inner.y, width: inner.x + inner.width - emptyX - 1, height: 3 }), 7);
    if (fill.width > 4 && inner.x + inner.width - emptyX > 4) {
      const f = mode(pixelsIn(img, { ...grow(fill, -1), height: 3 }));
      const e = mode(pixelsIn(img, { x: emptyX + 1, y: inner.y, width: inner.x + inner.width - emptyX - 1, height: 3 }));
      gate(theme, state, 'out fill vs empty', contrast(f, e), 3, 'Out fill level, user choice 2026-11-19');
    }
  }
  // chart: bars, tick and row labels on the panel
  const chart = await box(page, '.prob-chart svg');
  for (const [sel, min, what] of [['.chart-bar', 3, 'chart bar'], ['.chart-label', 7, 'chart row label'], ['.chart-tick', 7, 'chart tick'], ['.chart-value', 7, 'chart value']]) {
    const b = await box(page, sel);
    if (b && chart) gate(theme, state, what, measure(img, b, { x: chart.x, y: chart.y, width: 12, height: 12 }), min);
  }
  // every gate: label on fill (7), outline vs panel (3) sampled in the top quarter, away from the wire
  for (const el of await page.$$('.step-column .gate')) {
    const b = await el.boundingBox();
    const name = await el.getAttribute('aria-label');
    gate(theme, state, `gate label ${name}`, measure(img, grow(b, -6), grow(b, -4)), 7);
    const y = b.y + 4;
    gate(theme, state, `gate outline ${name}`, measure(img, { x: b.x, y, width: 2, height: 6 }, { x: b.x - 8, y, width: 5, height: 6 }), 3);
  }
  // SWAP ends (× glyph) and barriers vs the panel
  for (const sel of ['.step-column .swap-end', '.step-column .barrier']) {
    for (const el of await page.$$(sel)) {
      const b = await el.boundingBox();
      gate(theme, state, `${sel} vs panel`, measure(img, b, { x: b.x - 6, y: b.y, width: 3, height: 3 }), 3);
    }
  }
  // B grips: ring / dot vs what they sit on (the gate fill of an adjacent B, or the panel)
  for (const el of await page.$$('.step-column .b-grip')) {
    const b = await el.boundingBox();
    const name = await el.getAttribute('aria-label');
    gate(theme, state, `B grip ${name}`, measure(img, grow(b, -4), b), 3);
  }
  // invalid "!" badge
  const badge = await page.$('.step-column .gate.invalid');
  if (badge) {
    const b = await badge.boundingBox();
    const bb = { x: b.x + b.width - 7, y: b.y - 7, width: 14, height: 14 };
    gate(theme, state, 'invalid badge "!"', measure(img, grow(bb, -3), grow(bb, -1)), 7);
  }
  // control balls vs panel
  for (const sel of ['.step-column .ctl-ball.on1.active', '.step-column .ctl-ball.on0.active', '.step-column .ctl-ball.orphan']) {
    const b = await box(page, sel);
    if (b) gate(theme, state, `${sel} vs panel`, measure(img, b, { x: b.x - 10, y: b.y - 10, width: 4, height: 4 }), 3);
  }
  // Bloch strip labels (::before text) on the panel
  const lab = await box(page, '.strip-label');
  if (lab) gate(theme, state, 'strip label', measure(img, lab, { x: lab.x - 4, y: lab.y, width: 3, height: lab.height }), 7);
  // buttons
  for (const sel of ['.corner-tl', '.corner-tr', '.corner-bl', '.corner-br']) {
    const b = await box(page, sel);
    if (b) gate(theme, state, `${sel} corner label`, measure(img, grow(b, -1), grow(b, -1)), 7);
  }
  for (const sel of ['.grid-toolbar button', '.io-toolbar button', '.theme-toggle', '.more-toggle']) {
    const b = await box(page, sel);
    if (b) gate(theme, state, `${sel} text`, measure(img, grow(b, -4), grow(b, -2)), 7);
  }
}

/** "Updating…" badge: forced visible in the Output state header for a moment, then removed. */
async function badgeCheck(page, theme) {
  await page.evaluate(() => {
    const h = document.querySelector('.ket-view header');
    const b = document.createElement('span');
    b.className = 'updating-badge';
    b.id = 'audit-badge';
    b.style.visibility = 'visible';
    b.style.animation = 'none';
    b.textContent = 'Updating…';
    h?.appendChild(b);
  });
  const img = await shot(page, theme, 'badge');
  const b = await box(page, '#audit-badge');
  if (b) gate(theme, 'badge', 'Updating badge text', measure(img, grow(b, -3), grow(b, -2)), 7);
  else fail(theme, 'badge', 'Updating badge', 'not rendered');
  await page.evaluate(() => document.getElementById('audit-badge')?.remove());
}

/** Hover states: text and marks on the hover background. */
async function hoverChecks(page, theme) {
  for (const [sel, what] of [['.grid-toolbar button', 'button hover'], ['.theme-toggle', 'toggle hover'], ['.in-row .init-box', 'init box hover'], ['.io-toolbar button', 'toolbar button hover']]) {
    await page.hover(sel);
    await page.waitForTimeout(100);
    const img = await shot(page, theme, `hover-${what.replace(/ /g, '-')}`);
    const b = await box(page, sel);
    if (b) gate(theme, 'hover', `${what} text`, measure(img, grow(b, -4), grow(b, -2)), 7);
  }
  await page.mouse.move(2, 2);
}

async function blochChecks(page, img, theme, state) {
  const canvas = await box(page, '.bloch3d-canvas');
  if (!canvas) return fail(theme, state, '3D panel', 'no WebGL canvas');
  const tok = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return Object.fromEntries(['--panel', '--arrow', '--bloch-outline', '--bloch-circle'].map((n) => [n, cs.getPropertyValue(n).trim()]));
  });
  const panel = parseColor(tok['--panel']);
  const near = (c, t, d = 40) => Math.hypot(c[0] - t[0], c[1] - t[1], c[2] - t[2]) < d;
  const px = pixelsIn(img, canvas);
  const sphereBg = mode(pixelsIn(img, { x: canvas.x + canvas.width * 0.4, y: canvas.y + canvas.height * 0.55, width: canvas.width * 0.12, height: canvas.height * 0.12 }));
  const lightEx = theme === 'light' ? "today's light sphere kept (meridians, arrow), user choice 2026-11-19" : undefined;
  // the arrow must be drawn, and stand out from the sphere fill and the panel
  const arrow = px.filter((c) => near(c, parseColor(tok['--arrow']), 60));
  if (arrow.length < 20) fail(theme, state, '3D arrow', `not found (${arrow.length} px)`);
  else {
    const a = mode(arrow);
    gate(theme, state, '3D arrow vs sphere fill', contrast(a, sphereBg), 3, lightEx);
    gate(theme, state, '3D arrow vs panel', contrast(a, panel), 3, lightEx);
  }
  if (theme === 'dark') {
    const outline = px.filter((c) => near(c, parseColor(tok['--bloch-outline']), 30));
    if (outline.length < 50) fail(theme, state, '3D outline', `not found (${outline.length} px)`);
    else gate(theme, state, '3D outline vs panel', contrast(mode(outline), panel), 3);
    const circles = px.filter((c) => near(c, parseColor(tok['--bloch-circle']), 30));
    if (circles.length < 50) fail(theme, state, '3D circles', `not found (${circles.length} px)`);
    else gate(theme, state, '3D circles vs sphere fill', contrast(mode(circles), sphereBg), 3);
  }
  for (const l of await page.$$('.bloch3d-label')) {
    const b = await l.boundingBox();
    const kind = await l.evaluate((e) => (e.classList.contains('axis') ? 'axis' : 'state'));
    // state labels sit on their own backing; axis labels sit on the canvas around the sphere
    gate(theme, state, `3D ${kind} label`, measure(img, grow(b, -1), kind === 'state' ? grow(b, -1) : grow(b, 2)), 7);
  }
}

async function focusWalk(page, theme) {
  await page.mouse.click(1, 1);
  const seen = new Set();
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const off = parseFloat(cs.outlineOffset) || 0;
      const w = parseFloat(cs.outlineWidth) || 0;
      const g = off + w / 2;
      const pts = [[r.left + r.width / 2, r.top - g], [r.left + r.width / 2, r.bottom + g], [r.left - g, r.top + r.height / 2], [r.right + g, r.top + r.height / 2]];
      const covered = pts.some(([x, y]) => {
        const at = document.elementFromPoint(x, y);
        return !!at && !!at.closest('.gate-card, .modal-backdrop') && !el.closest('.gate-card, .modal-backdrop');
      });
      const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.tagName;
      return { name, style: cs.outlineStyle, width: w, offset: off, covered, box: { x: r.x, y: r.y, width: r.width, height: r.height } };
    });
    if (!info) continue;
    if (seen.has(info.name + JSON.stringify(info.box))) break;
    seen.add(info.name + JSON.stringify(info.box));
    const state = `focus ${info.name}`;
    if (info.style === 'none' || info.width < 2) fail(theme, state, 'focus ring visible', `style ${info.style}, width ${info.width}`);
    if (info.offset < 2) fail(theme, state, 'focus ring offset', `${info.offset}px`);
    if (info.covered) fail(theme, state, 'focus not obscured', 'ring covered by the gate card or a dialog');
    if (info.box.y < 0 || info.box.y > 2000) continue;
    const img = decode(await page.screenshot());
    // sample only the ring's top edge, leaving out the middle columns: horizontal wires run through
    // the element's vertical centre and control/connector lines through its horizontal centre, so
    // neither can stand in for the ring
    const cx = info.box.x + info.box.width / 2;
    const away = (x) => Math.abs(x - cx) < 5;
    const top = info.box.y - info.offset - info.width;
    const ringBand = { x: info.box.x - info.offset, y: top, width: info.box.width + 2 * info.offset, height: info.width };
    const gapBand = { x: info.box.x, y: info.box.y - info.offset + 1, width: info.box.width, height: Math.max(1, info.offset - 2) };
    const surface = mode(pixelsIn(img, gapBand, (x) => away(x)));
    let best = 1;
    for (const c of pixelsIn(img, ringBand, (x) => away(x))) best = Math.max(best, contrast(c, surface));
    gate(theme, state, 'focus ring vs surface', best, 3);
  }
  note(theme, 'focus walk', 'stops', String(seen.size));
}

async function forcedColors(browser, url) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1400, height: 2600 }, reducedMotion: 'reduce', forcedColors: 'active' });
  const page = await ctx.newPage();
  await page.goto(`${url}#${HASH}`);
  await settle(page);
  const r = await page.evaluate(() => {
    const css = (sel, prop) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el)[prop] : null;
    };
    return {
      gateBorder: css('.step-column .gate', 'borderTopColor'),
      canvas: getComputedStyle(document.body).backgroundColor,
      on1: css('.step-column .ctl-ball.on1', 'backgroundColor'),
      on0: css('.step-column .ctl-ball.on0', 'backgroundColor'),
      wire: (() => {
        const el = document.querySelector('.cell');
        return el ? getComputedStyle(el, '::before').borderTopColor : null;
      })(),
      connector: (() => {
        const el = document.querySelector('.step-column .connector');
        return el ? getComputedStyle(el, '::before').backgroundColor : null;
      })(),
    };
  });
  await page.screenshot({ path: resolve(OUT, 'forced-colors.png') });
  const t = 'forced-colors';
  if (!r.gateBorder || r.gateBorder === r.canvas || r.gateBorder === 'rgba(0, 0, 0, 0)') fail(t, 'default', 'gate outline', String(r.gateBorder));
  if (!r.on1 || r.on1 === r.on0) fail(t, 'default', 'filled vs open control', `${r.on1} vs ${r.on0}`);
  if (!r.connector || r.connector === r.canvas || r.connector === 'rgba(0, 0, 0, 0)') fail(t, 'default', 'connector', String(r.connector));
  if (!r.wire || r.wire === r.canvas || r.wire === 'rgba(0, 0, 0, 0)') fail(t, 'default', 'wire', String(r.wire));
  await page.click('.step-column .gate:not(.invalid)');
  const selColor = await page.evaluate(() => {
    const el = document.querySelector('.selection');
    return el ? getComputedStyle(el).borderTopColor : null;
  });
  if (!selColor || selColor === r.canvas || selColor === 'rgba(0, 0, 0, 0)') fail(t, 'selected', 'selection ring', String(selColor));
  await page.keyboard.press('Escape');
  await page.mouse.click(1, 1);
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement);
    return { color: cs.outlineColor, style: cs.outlineStyle };
  });
  if (focus.style === 'none' || focus.color === r.canvas) fail(t, 'focus', 'focus ring', JSON.stringify(focus));
  note(t, 'default', 'computed', JSON.stringify(r));
  await ctx.close();
}

// ---------------------------------------------------------------- main

const { url, stop } = await serve();
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1400, height: 2600 }, reducedMotion: 'reduce' });
    await ctx.addInitScript((t) => localStorage.setItem('qgl-theme', t), theme);
    const page = await ctx.newPage();
    await page.goto(`${url}#${HASH}`);
    await settle(page);
    if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== theme) fail(theme, 'load', 'theme applied', 'wrong data-theme');

    // default
    let img = await shot(page, theme, 'default');
    await axe(page, theme, 'default');
    await pixelChecks(page, img, theme, 'default');

    // gate card open on a grid gate
    await page.hover('.step-column .gate[aria-label^="X on q[1]"]');
    await page.waitForSelector('.gate-card', { timeout: 3000 });
    if (!(await page.textContent('.gate-card'))?.includes('CC̄X') && !(await page.textContent('.gate-card'))?.includes('=')) fail(theme, 'card', 'card Here section', 'no block matrix shown');
    img = await shot(page, theme, 'card');
    await axe(page, theme, 'card');
    await page.mouse.move(2, 2);
    await page.waitForTimeout(300);

    // selected gate (selection ring), then Bloch panel
    await page.click('.step-column .gate:not(.invalid)');
    img = await shot(page, theme, 'selected');
    const sel = await box(page, '.selection');
    if (sel) {
      const cx = sel.x + sel.width / 2;
      const away = (x) => Math.abs(x - cx) < 6;
      gate(theme, 'selected', 'selection ring vs panel', measure(img, { x: sel.x, y: sel.y, width: sel.width, height: 2 }, { x: sel.x, y: sel.y - 5, width: sel.width, height: 3 }, away), 3);
    }
    await page.keyboard.press('Escape');
    await page.click('[aria-label^="q[2] after step 1"]');
    await page.waitForTimeout(1500);
    img = await shot(page, theme, 'bloch');
    await axe(page, theme, 'bloch');
    await blochChecks(page, img, theme, 'bloch');
    await page.keyboard.press('Escape');
    const close = await page.$('.bloch-close');
    if (close) await close.click();

    // angle dialog
    await page.dblclick('.step-column .gate.invalid');
    await page.waitForSelector('[role="dialog"]');
    img = await shot(page, theme, 'dialog');
    await axe(page, theme, 'dialog');
    const title = await box(page, '.angle-dialog h3');
    if (title) gate(theme, 'dialog', 'dialog title', measure(img, title, title), 7);
    const dlg = await box(page, '.angle-dialog');
    if (dlg) gate(theme, 'dialog', 'dialog edge vs backdrop', measure(img, { x: dlg.x, y: dlg.y + 20, width: 1, height: 10 }, { x: dlg.x - 8, y: dlg.y + 20, width: 5, height: 10 }), 3);
    await page.keyboard.press('Escape');

    await badgeCheck(page, theme);
    await hoverChecks(page, theme);

    // keyboard focus walk
    await focusWalk(page, theme);
    await ctx.close();
  }
  await forcedColors(browser, url);
} finally {
  await browser.close();
  stop();
}

writeFileSync(resolve(OUT, 'report.txt'), [...reports, '', 'FAILURES', ...failures].join('\n'));
console.log(`\n${reports.length} checks reported, ${failures.length} failures (full list: a11y-report/report.txt)`);
for (const f of failures) console.log('  ✗ ' + f);
process.exit(failures.length ? 1 : 0);
