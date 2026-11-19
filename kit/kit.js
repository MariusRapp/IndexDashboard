/* dashboard-kit v1.1.0 (kit/VERSION), copied from Dashboard-hub/kit, do not edit here */
// Dashboard-Kit 1.1.0 — the dashboards' shared chrome: theme, top bar, segmented thumbs, hub link, online state,
// status, toast, sheets, folding and time stamps. ES module without dependencies.
// Source: Dashboard-hub/kit. Copies in the app repos are never edited by hand: change the source, bump kit/VERSION,
// run `node kit/tools/sync.mjs`.
// Also runs pasted into an inline <script type="module"> next to app code (OptionSearch): every internal name starts
// with _kit, nothing runs before a function is called, and globalThis.DashboardKit carries the whole API.

export const KIT_VERSION = '1.1.0';
export const HUB_URL = 'https://mariusrapp.github.io/Dashboard-hub/';

// ── Strings (the kit's own labels) ───────────────────────────────────────────
const _kitStr = {
  de: {
    hub: 'Alle Dashboards', toLight: 'Helles Erscheinungsbild', toDark: 'Dunkles Erscheinungsbild', offline: 'Offline',
    now: 'gerade eben', min: n => `vor ${n} Min.`, hour: n => `vor ${n} Std.`, day: n => (n === 1 ? 'vor 1 Tag' : `vor ${n} Tagen`),
    stamp: 'Stand', fold: 'Einklappen', unfold: 'Ausklappen', locale: 'de-DE',
  },
  en: {
    hub: 'All dashboards', toLight: 'Switch to light appearance', toDark: 'Switch to dark appearance', offline: 'Offline',
    now: 'just now', min: n => `${n} min ago`, hour: n => `${n} h ago`, day: n => (n === 1 ? '1 day ago' : `${n} days ago`),
    stamp: 'Updated', fold: 'Fold', unfold: 'Show', locale: 'en-GB',
  },
};
let _kitLang = '';   // set by initKit({ lang }); until then <html lang> decides
function _kitLangOf(x) {
  const l = String(x || document.documentElement.lang || 'de').slice(0, 2).toLowerCase();
  return _kitStr[l] ? l : 'en';
}
function _kitT(lang) { return _kitStr[lang ? _kitLangOf(lang) : (_kitLang || _kitLangOf())]; }

const _kitIcon = {
  sun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
  chevron: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
};

// what has been wired already (every init function may be called again without effect)
const _kitDone = { theme: false, topbar: false, online: false, observer: false, compact: new WeakSet(), sheets: new WeakSet() };

function _kitEl(x) { return typeof x === 'string' ? document.querySelector(x) : x || null; }
function _kitEmit(name, detail) { try { dispatchEvent(new CustomEvent(name, { detail })); } catch { /* old browsers */ } }

// ── Theme ────────────────────────────────────────────────────────────────────
// Light/dark follows the OS until the viewer picks one with a [data-kit="theme"] button; the choice is saved under
// localStorage "theme" (the key BTC-Poly uses, so every dashboard on mariusrapp.github.io shares it).
export function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

// a token's current value, e.g. cssVar('--accent'); canvas and Plotly can't read CSS variables themselves
export function cssVar(name) {
  const n = String(name).startsWith('--') ? String(name) : '--' + name;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

const _kitThemeFns = new Set();
let _kitLastDark = null;

function _kitPaintTheme() {
  const dark = isDark(), t = _kitT(), want = dark ? 'sun' : 'moon';
  for (const b of document.querySelectorAll('[data-kit="theme"]')) {
    if (b.dataset.kitIcon !== want) { b.innerHTML = _kitIcon[want]; b.dataset.kitIcon = want; }
    const label = dark ? t.toLight : t.toDark;
    if (b.getAttribute('aria-label') !== label) { b.setAttribute('aria-label', label); b.title = label; }
    if (b.tagName === 'BUTTON' && !b.getAttribute('type')) b.type = 'button';
  }
  // browser bar and home-screen status bar follow the picked theme, not just the OS setting
  const page = cssVar('--page');
  if (page) for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = page;
  return dark;
}

function _kitThemeChanged() {
  const dark = _kitPaintTheme();
  if (dark === _kitLastDark) return;
  _kitLastDark = dark;
  for (const fn of _kitThemeFns) { try { fn(dark); } catch (e) { console.error(e); } }
  _kitEmit('kit:theme', { dark });
}

// 'light' | 'dark' saves the choice, null follows the OS again
export function setTheme(mode) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode; else delete root.dataset.theme;
  try {
    if (mode === 'light' || mode === 'dark') localStorage.setItem('theme', mode); else localStorage.removeItem('theme');
  } catch { /* private mode */ }
  _kitThemeChanged();
}

export function initTheme({ onChange } = {}) {
  if (typeof onChange === 'function') _kitThemeFns.add(onChange);
  if (_kitDone.theme) { _kitPaintTheme(); return; }
  _kitDone.theme = true;
  const root = document.documentElement;
  // pages without the boot snippet in <head> still get the saved choice (with a flash)
  try {
    const t = localStorage.getItem('theme');
    if ((t === 'light' || t === 'dark') && !root.dataset.theme) root.dataset.theme = t;
  } catch { /* private mode */ }
  _kitLastDark = _kitPaintTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', _kitThemeChanged);
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('[data-kit="theme"]')) setTheme(isDark() ? 'light' : 'dark');
  });
  // another tab on the same origin switched
  addEventListener('storage', e => {
    if (e.key !== 'theme') return;
    if (e.newValue === 'light' || e.newValue === 'dark') root.dataset.theme = e.newValue; else delete root.dataset.theme;
    _kitThemeChanged();
  });
}

// ── Segmented controls: one thumb that slides to the pressed button ──────────
// The app keeps setting aria-pressed (or aria-selected); the thumb follows. A thumb already rendered as
// `.seg > .seg-thumb` (React) is reused, so nothing is inserted into DOM another library manages.
const _kitSegs = new WeakMap();

function _kitPressed(seg) { return seg.querySelector('button[aria-pressed="true"], button[aria-selected="true"]'); }

function _kitAttachThumb(seg) {
  if (!seg || _kitSegs.has(seg) || seg.dataset.thumb === 'off') return;
  let thumb = seg.querySelector(':scope > .seg-thumb');
  if (!thumb) {
    thumb = document.createElement('i');
    thumb.className = 'seg-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    seg.prepend(thumb);
    seg.classList.add('seg-live');
  }
  let pressed = null, placed = false;
  const place = () => {
    pressed = _kitPressed(seg);
    if (!pressed || !pressed.offsetWidth) { thumb.style.opacity = '0'; placed = false; return; }   // none pressed, or not shown
    if (!placed) thumb.style.transition = 'none';   // first time, or shown again: appear in place, don't fly in
    thumb.style.opacity = '1';
    thumb.style.width = pressed.offsetWidth + 'px';
    thumb.style.height = pressed.offsetHeight + 'px';
    thumb.style.transform = `translate(${pressed.offsetLeft}px, ${pressed.offsetTop}px)`;
    if (!placed) { void thumb.offsetWidth; thumb.style.transition = ''; placed = true; }
  };
  // aria-pressed is often rewritten with the same value: only a new pressed button needs a layout read
  new MutationObserver(() => { if (_kitPressed(seg) !== pressed) place(); })
    .observe(seg, { attributes: true, attributeFilter: ['aria-pressed', 'aria-selected'], subtree: true, childList: true });
  if ('ResizeObserver' in window) new ResizeObserver(place).observe(seg);   // relabelled, unfolded, resized
  _kitSegs.set(seg, place);
  place();
}

export function initSegs(root = document) {
  const r = _kitEl(root);
  if (!r) return;
  if (r.matches && r.matches('.seg')) _kitAttachThumb(r);
  if (r.querySelectorAll) for (const seg of r.querySelectorAll('.seg')) _kitAttachThumb(seg);
  _kitObserve();
}

// click handling for a .seg whose buttons carry data-value: sets aria-pressed and calls onChange(value, button) when the
// choice changes. Returns set(value), which selects without calling onChange.
export function bindSeg(seg, onChange) {
  const s = _kitEl(seg);
  if (!s) return () => null;
  for (const b of s.querySelectorAll('button:not([type])')) b.type = 'button';   // never submit a surrounding form
  const set = value => {
    let hit = null;
    for (const b of s.querySelectorAll('button[data-value]')) {
      const on = b.dataset.value === String(value);
      b.setAttribute('aria-pressed', String(on));
      if (on) hit = b;
    }
    return hit;
  };
  s.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button[data-value]');
    if (!b || !s.contains(b) || b.disabled || b.getAttribute('aria-pressed') === 'true') return;
    set(b.dataset.value);
    if (typeof onChange === 'function') onChange(b.dataset.value, b);
  });
  _kitAttachThumb(s);
  return set;
}

// ── Top bar ──────────────────────────────────────────────────────────────────
// Its material only shows while content is under it (html.scrolled). With `watch`, html.compact is set while that
// element is scrolled out of view, so the bar's .brand-live line can stand in for it.
export function initTopbar({ watch } = {}) {
  const root = document.documentElement;
  if (!_kitDone.topbar) {
    _kitDone.topbar = true;
    const onScroll = () => root.classList.toggle('scrolled', scrollY > 2);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  const el = _kitEl(watch);
  if (!el || _kitDone.compact.has(el) || !('IntersectionObserver' in window)) return;
  _kitDone.compact.add(el);
  const bar = document.querySelector('.topbar');
  new IntersectionObserver(([entry]) => root.classList.toggle('compact', !entry.isIntersecting),
    { rootMargin: `-${bar ? bar.offsetHeight : 0}px 0px 0px 0px` }).observe(el);
}

// ── Hub link ─────────────────────────────────────────────────────────────────
// [data-kit="hub"]: link to the hub (grid icon, label). Hidden inside an installed app: it was opened from the home
// screen, and the link would only open a browser sheet on top of it.
export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches ||
    navigator.standalone === true;
}

function _kitPaintHub(a) {
  if (a.dataset.kitHub) return;
  a.dataset.kitHub = '1';
  const label = _kitT().hub;
  if (a.tagName === 'A') { if (!a.getAttribute('href')) a.setAttribute('href', HUB_URL); }
  else a.addEventListener('click', () => { location.href = HUB_URL; });
  if (!a.getAttribute('aria-label')) a.setAttribute('aria-label', label);
  if (!a.title) a.title = label;
  if (!a.children.length && !a.textContent.trim()) a.innerHTML = _kitIcon.grid;
  if (isStandalone()) a.hidden = true;
}

export function initHubLink() {
  for (const a of document.querySelectorAll('[data-kit="hub"]')) _kitPaintHub(a);
  _kitObserve();
}

// ── Status (top bar) and online state ───────────────────────────────────────
// <span class="status" data-kit="status"><i class="dot wait"></i><span class="status-text">…</span></span>
// setStatus('live' | 'wait' | 'stale' | 'err' | 'offline', text). While the device is offline every status element
// shows "Offline"; afterwards the last state comes back (also for apps that write the status themselves).
const _kitStatus = { state: null, text: '' };
const _kitStatusSaved = new WeakMap();

function _kitStatusParts(el) {
  let dot = el.querySelector('.dot'), txt = el.querySelector('.status-text');
  if (!dot) { dot = document.createElement('i'); dot.className = 'dot'; el.prepend(dot); }
  if (!txt) { txt = document.createElement('span'); txt.className = 'status-text'; el.append(txt); }
  return [dot, txt];
}

function _kitRenderStatus() {
  const off = document.documentElement.hasAttribute('data-offline');
  if (_kitStatus.state == null && !off) return;   // the app never called setStatus: its own markup stays
  // offline after live/stale data: keep the data stamp visible ("Offline · Stand 19:54")
  const stamp = (_kitStatus.state === 'live' || _kitStatus.state === 'stale') && _kitStatus.text ? ' · ' + _kitStatus.text : '';
  const state = off ? 'offline' : _kitStatus.state, text = off ? _kitT().offline + stamp : _kitStatus.text;
  for (const el of document.querySelectorAll('[data-kit="status"]')) {
    const [dot, txt] = _kitStatusParts(el);
    if (off && _kitStatus.state == null && !_kitStatusSaved.has(el)) _kitStatusSaved.set(el, [dot.className, txt.textContent]);
    const cls = 'dot ' + state;
    if (dot.className !== cls) dot.className = cls;
    if (txt.textContent !== text) txt.textContent = text;
    el.dataset.state = state;
  }
}

export function setStatus(state, text) {
  _kitStatus.state = state || 'wait';
  if (text !== undefined) _kitStatus.text = text == null ? '' : String(text);
  _kitRenderStatus();
}

export function initOnline() {
  if (_kitDone.online) return;
  _kitDone.online = true;
  const root = document.documentElement;
  const apply = () => {
    const off = navigator.onLine === false;
    if (off === root.hasAttribute('data-offline')) return;
    root.toggleAttribute('data-offline', off);
    _kitRenderStatus();
    if (!off) {
      for (const el of document.querySelectorAll('[data-kit="status"]')) {
        const saved = _kitStatusSaved.get(el);
        if (!saved) continue;
        _kitStatusSaved.delete(el);
        if (_kitStatus.state == null) { const [dot, txt] = _kitStatusParts(el); dot.className = saved[0]; txt.textContent = saved[1]; delete el.dataset.state; }
      }
    }
    _kitEmit('kit:online', { online: !off });
  };
  addEventListener('online', apply);
  addEventListener('offline', apply);
  apply();
}

// ── Toast ────────────────────────────────────────────────────────────────────
// Uses [data-kit="toast"] (<div class="toast" data-kit="toast" role="status" aria-live="polite" hidden><b></b><span></span></div>)
// or creates it. ms = 0 keeps it until the returned function is called.
let _kitToastTimer = 0;
export function toast(title, body = '', { ms = 4000 } = {}) {
  let el = document.querySelector('[data-kit="toast"]');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.dataset.kit = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    document.body.append(el);
  }
  const b = el.querySelector('b') || el.appendChild(document.createElement('b'));
  const s = el.querySelector('span') || el.appendChild(document.createElement('span'));
  b.textContent = title == null ? '' : String(title);
  s.textContent = body == null ? '' : String(body);
  s.hidden = !s.textContent;
  el.hidden = false;
  clearTimeout(_kitToastTimer);
  const hide = () => { clearTimeout(_kitToastTimer); el.hidden = true; };
  if (ms > 0) _kitToastTimer = setTimeout(hide, ms);
  return hide;
}

// ── Time stamps ──────────────────────────────────────────────────────────────
function _kitDate(ts) {
  if (ts == null || ts === '') return null;
  const d = ts instanceof Date ? ts : new Date(typeof ts === 'string' && /^\d+$/.test(ts) ? +ts : ts);
  return isNaN(d.getTime()) ? null : d;
}

// "vor 5 Min." / "5 min ago"
export function formatAge(ts, lang) {
  const d = _kitDate(ts);
  if (!d) return '';
  const t = _kitT(lang), s = (Date.now() - d.getTime()) / 1000;
  if (s < 45) return t.now;
  const m = Math.round(s / 60);
  if (m < 60) return t.min(m);
  const h = Math.round(s / 3600);
  if (h < 24) return t.hour(h);
  return t.day(Math.round(s / 86400));
}

// "Stand 14:05" / "Updated 14:05"; another day adds the date, another year the year
export function formatStamp(ts, lang) {
  const d = _kitDate(ts);
  if (!d) return '';
  const t = _kitT(lang), now = new Date();
  const time = d.toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `${t.stamp} ${time}`;
  const opts = d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' };
  return `${t.stamp} ${d.toLocaleDateString(t.locale, opts)}, ${time}`;
}

// ── Sheets (<dialog class="sheet">) ──────────────────────────────────────────
// Modal; a click on the backdrop or on any [data-kit="close"] inside closes it; focus returns to where it was.
const _kitSheetReturn = new WeakMap();

export function openSheet(dlg) {
  const d = _kitEl(dlg);
  if (!d) return null;
  if (!_kitDone.sheets.has(d)) {
    _kitDone.sheets.add(d);
    d.addEventListener('click', e => {
      if (e.target.closest && e.target.closest('[data-kit="close"]')) { closeSheet(d); return; }
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeSheet(d);
    });
    d.addEventListener('close', () => {
      const back = _kitSheetReturn.get(d);
      _kitSheetReturn.delete(d);
      if (back && back.isConnected && back.focus) back.focus({ preventScroll: true });
    });
  }
  if (d.open) return d;
  _kitSheetReturn.set(d, document.activeElement);
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  return d;
}

export function closeSheet(dlg) {
  const d = _kitEl(dlg);
  if (!d || !d.open) return;
  if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
}

// ── Folding ──────────────────────────────────────────────────────────────────
// Every card matching `selector` (with an id) folds to its title row (chevron in its corner, or a tap on the title);
// a KPI tile (.card.kpi) to its label and number. A card that opens with a toolbar gets a title row that only shows
// while folded (from aria-label). Remembered in localStorage under `key` (namespace it: '<app>:folded').
// Unfolding dispatches 'resize' so charts drawn at their width catch up; 'kit:fold' {id, folded} on every change.
export function initFold({ key = 'kit:folded', selector = '.card[id]', root = document } = {}) {
  const r = _kitEl(root);
  if (!r) return;
  let folded = new Set();
  try { const a = JSON.parse(localStorage.getItem(key)); if (Array.isArray(a)) folded = new Set(a); } catch { /* none yet */ }
  const save = () => { try { localStorage.setItem(key, JSON.stringify([...folded])); } catch { /* private mode */ } };
  const t = _kitT();
  const show = (card, btn, isFolded) => {
    card.classList.toggle('folded', isFolded);
    btn.setAttribute('aria-expanded', String(!isFolded));
    btn.title = `${isFolded ? t.unfold : t.fold}: ${card.dataset.fold}`;
    btn.setAttribute('aria-label', btn.title);
  };
  for (const card of r.querySelectorAll(selector)) {
    if (!card.id || card.classList.contains('foldable') || card.dataset.fold === 'off') continue;
    const kpi = card.classList.contains('kpi');
    let head = card.querySelector(kpi ? ':scope > .kpi-label' : ':scope > .card-head');
    if (!head) {
      head = document.createElement('div');
      head.className = 'card-head fold-head';
      const h = document.createElement('h2');
      h.textContent = card.getAttribute('aria-label') || '';
      head.append(h);
      card.prepend(head);
    }
    if (!card.dataset.fold) {
      const h2 = head.querySelector('h2');
      card.dataset.fold = (h2 && h2.textContent.trim()) || (kpi && head.textContent.trim()) || card.getAttribute('aria-label') || card.id;
    }
    let btn = card.querySelector(':scope > .fold');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fold';
      btn.innerHTML = _kitIcon.chevron;
      card.prepend(btn);
    }
    card.classList.add('foldable');
    const toggle = () => {
      const now = !card.classList.contains('folded');
      show(card, btn, now);
      if (now) folded.add(card.id); else folded.delete(card.id);
      save();
      _kitEmit('kit:fold', { id: card.id, folded: now });
      if (!now) dispatchEvent(new Event('resize'));
    };
    btn.addEventListener('click', toggle);
    const handle = kpi ? head : head.querySelector('h2');
    if (handle) handle.addEventListener('click', toggle);
    show(card, btn, folded.has(card.id));
  }
}

// ── Later DOM ────────────────────────────────────────────────────────────────
// UIs rendered with innerHTML get their thumbs, hub links, theme icons and status parts without another call.
// Only element insertions schedule a pass (text updates don't), at most one per frame.
let _kitScanQueued = false;
function _kitScan() {
  _kitScanQueued = false;
  for (const seg of document.querySelectorAll('.seg')) _kitAttachThumb(seg);
  for (const a of document.querySelectorAll('[data-kit="hub"]')) _kitPaintHub(a);
  if (_kitDone.theme) _kitPaintTheme();
  _kitRenderStatus();
}
function _kitObserve() {
  if (_kitDone.observer) return;
  if (!document.body) { document.addEventListener('DOMContentLoaded', _kitObserve, { once: true }); return; }
  _kitDone.observer = true;
  new MutationObserver(muts => {
    if (_kitScanQueued) return;
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType === 1) { _kitScanQueued = true; requestAnimationFrame(_kitScan); return; }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

// ── All at once ──────────────────────────────────────────────────────────────
// initKit({ app: 'index', lang: 'de', fold: true, onTheme: dark => redraw(), topbar: { watch: '#price' } })
// Calling it again is harmless (listeners are only added once).
/**
 * @param {{ app?: string, lang?: string, fold?: boolean, onTheme?: (dark: boolean) => void,
 *           topbar?: { watch?: string } }} [options]
 */
export function initKit({ app = 'app', lang, fold = false, onTheme, topbar } = {}) {
  if (lang) _kitLang = _kitLangOf(lang);
  else if (!_kitLang) _kitLang = _kitLangOf();
  initTheme({ onChange: onTheme });
  initTopbar(topbar || {});
  initSegs(document);
  initHubLink();
  initOnline();
  if (fold) initFold({ key: `${app}:folded`, ...(typeof fold === 'object' ? fold : {}) });
  return globalThis.DashboardKit;
}

globalThis.DashboardKit = Object.freeze({
  KIT_VERSION, HUB_URL, initKit, initTheme, setTheme, isDark, cssVar, initSegs, bindSeg, initTopbar, isStandalone,
  initHubLink, initOnline, setStatus, toast, formatAge, formatStamp, openSheet, closeSheet, initFold,
});
