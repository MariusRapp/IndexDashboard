import { initKit, setStatus, formatStamp, toast, bindSeg, openSheet } from "../kit/kit.js";
import { INFO } from "./info.js?v=5";
import { initRefresh } from "./refresh.js?v=5";

const DATA_URL = "data/latest.json";
const RANGE_DAYS = { "1W": 7, "1M": 31, "3M": 92 };

const state = { range: "1M", grid: false, data: null, expanded: new Set() };
const chartGeometry = new Map(); // chart id -> data + layout for hover math
const expandBuilders = new Map(); // panel id -> () => chart html

// Kit chip variant per rating; the rating text always stays visible (never color alone).
function ratingChip(rating) {
  const key = (rating || "").toLowerCase();
  if (key.includes("extreme fear")) return "down";
  if (key.includes("fear")) return "warn";
  if (key.includes("greed")) return "up";
  return "";
}
const STALE_HOURS = 4;

function formatNumber(value, opts = {}) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("de-DE", opts).format(value);
}

function formatSignedPct(value) {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, { maximumFractionDigits: 2 })} %`;
}

// delta_style: "normal" = rising green, "inverse" = rising red (stress
// gauges like VIX), "neutral" = neither direction is inherently good.
function deltaClass(value, style) {
  if (value === null || value === undefined || value === 0 || style === "neutral") return "flat";
  const rising = value > 0;
  if (style === "inverse") return rising ? "down" : "up";
  return rising ? "up" : "down";
}

function sanitizeId(s) {
  return s.replace(/[^a-zA-Z0-9]/g, "_");
}

/* ---------- sparkline ---------- */

function buildSparkline(history) {
  if (!history || history.length < 2) return "";
  const w = 100, h = 32, pad = 2;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const step = (w - pad * 2) / (history.length - 1);
  const points = history
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
  </svg>`;
}

function sparklineWithGrid(closes) {
  const spark = buildSparkline(closes);
  if (!spark) return "";
  if (!state.grid || closes.length < 2) return `<div class="spark-wrap">${spark}</div>`;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const PAD = 6.25, SPAN = 100 - 2 * PAD; // mirrors the svg's 2px/32px padding
  const refTop = PAD + (1 - (closes[0] - min) / range) * SPAN;
  const fmt = (v) => formatNumber(v, { maximumFractionDigits: 2 });
  return `<div class="spark-wrap grid-on">
    <div class="spark-line" style="top:${PAD}%"></div>
    <div class="spark-line" style="top:${100 - PAD}%"></div>
    <div class="spark-ref" style="top:${refTop.toFixed(1)}%"></div>
    <span class="spark-max">${fmt(max)}</span>
    <span class="spark-min">${fmt(min)}</span>
    ${spark}
  </div>`;
}

/* ---------- full line chart (expanded panels) ---------- */

function niceTicks(min, max, count) {
  const span = max - min || 1;
  const rawStep = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

function formatXLabel(ts, spanSeconds) {
  const dt = new Date(ts * 1000);
  if (spanSeconds < 3 * 86400) {
    return dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }
  if (spanSeconds < 200 * 86400) {
    return dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  }
  return dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function buildLineChart(id, t, v, opts = {}) {
  if (!t || !v || v.length < 2) return `<p class="loading muted">Not enough data</p>`;
  const W = 640, H = 220, L = 48, R = 14, T = 12, B = 26;
  const plotW = W - L - R, plotH = H - T - B;

  let dmin, dmax, ticks;
  if (opts.yMin !== undefined) {
    dmin = opts.yMin;
    dmax = opts.yMax;
    ticks = opts.ticks || niceTicks(dmin, dmax, 4);
  } else {
    const mn = Math.min(...v);
    const mx = Math.max(...v);
    const pad = (mx - mn) * 0.08 || Math.abs(mx) * 0.05 || 1;
    dmin = mn - pad;
    dmax = mx + pad;
    ticks = niceTicks(dmin, dmax, 4);
  }

  const x = (i) => L + (i / (v.length - 1)) * plotW;
  const y = (val) => T + (1 - (val - dmin) / (dmax - dmin)) * plotH;

  const grid = ticks
    .map(
      (tick) => `<line x1="${L}" y1="${y(tick).toFixed(1)}" x2="${W - R}" y2="${y(tick).toFixed(1)}" stroke="var(--grid)" stroke-width="1"/>
      <text x="${L - 6}" y="${(y(tick) + 3.5).toFixed(1)}" text-anchor="end" class="chart-text">${formatNumber(tick, { maximumFractionDigits: 2 })}</text>`
    )
    .join("");

  const span = t[t.length - 1] - t[0];
  const xLabels = [0, Math.floor((v.length - 1) / 2), v.length - 1]
    .map((i, k) => {
      const anchor = k === 0 ? "start" : k === 1 ? "middle" : "end";
      return `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}" class="chart-text">${formatXLabel(t[i], span)}</text>`;
    })
    .join("");

  const points = v.map((val, i) => `${x(i).toFixed(1)},${y(val).toFixed(1)}`).join(" ");
  const lastX = x(v.length - 1).toFixed(1);
  const lastY = y(v[v.length - 1]).toFixed(1);

  chartGeometry.set(id, { t, v, dmin, dmax, W, H, L, R, T, B, unit: opts.unit || "", showPct: !!opts.showPct });

  return `<div class="chart" data-chart-id="${id}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="History chart">
      ${grid}
      ${xLabels}
      <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${lastX}" cy="${lastY}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
    </svg>
    <div class="chart-crosshair" hidden></div>
    <div class="chart-dot" hidden></div>
    <div class="tip chart-tip" hidden></div>
  </div>${opts.caption ? `<div class="chart-caption">${opts.caption}</div>` : ""}`;
}

function bindChart(container) {
  const geo = chartGeometry.get(container.dataset.chartId);
  if (!geo) return;
  const svg = container.querySelector("svg");
  const tip = container.querySelector(".chart-tip");
  const cross = container.querySelector(".chart-crosshair");
  const dot = container.querySelector(".chart-dot");

  const move = (ev) => {
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / geo.W;
    const plotL = geo.L * scale;
    const plotW = (geo.W - geo.L - geo.R) * scale;
    let ratio = (ev.clientX - rect.left - plotL) / plotW;
    ratio = Math.max(0, Math.min(1, ratio));
    const i = Math.round(ratio * (geo.v.length - 1));
    const xpx = plotL + (i / (geo.v.length - 1)) * plotW;
    const ypx = (geo.T + (1 - (geo.v[i] - geo.dmin) / (geo.dmax - geo.dmin)) * (geo.H - geo.T - geo.B)) * scale;

    cross.style.left = `${xpx.toFixed(1)}px`;
    cross.style.top = `${(geo.T * scale).toFixed(1)}px`;
    cross.style.height = `${((geo.H - geo.T - geo.B) * scale).toFixed(1)}px`;
    dot.style.left = `${xpx.toFixed(1)}px`;
    dot.style.top = `${ypx.toFixed(1)}px`;

    const dt = new Date(geo.t[i] * 1000);
    const span = geo.t[geo.t.length - 1] - geo.t[0];
    const when = span < 3 * 86400
      ? dt.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      : dt.toLocaleDateString("de-DE");
    tip.innerHTML = `<div class="tip-time">${when}</div><div class="tip-row"><b>${formatNumber(geo.v[i], { maximumFractionDigits: 2 })}${geo.unit ? " " + geo.unit : ""}</b>${
      geo.showPct && geo.v[0] ? `<span class="${geo.v[i] >= geo.v[0] ? "up-t" : "down-t"}">${formatSignedPct((geo.v[i] / geo.v[0] - 1) * 100)}</span>` : ""
    }</div>`;
    tip.hidden = cross.hidden = dot.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(4, Math.min(rect.width - tw - 4, xpx - tw / 2)).toFixed(1)}px`;
    tip.style.top = `${Math.max(2, ypx - tip.offsetHeight - 10).toFixed(1)}px`;
  };

  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerdown", move);
  svg.addEventListener("pointerleave", () => {
    tip.hidden = cross.hidden = dot.hidden = true;
  });
}

/* ---------- expand / collapse ---------- */

function expandButton(id) {
  return `<button type="button" class="fold expand-btn" data-id="${id}" aria-expanded="false" aria-label="Show history" title="Show history">
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>`;
}

function applyExpansion(id, open) {
  const btn = document.querySelector(`.expand-btn[data-id="${CSS.escape(id)}"]`);
  const panel = document.getElementById(`panel-${id}`);
  if (!btn || !panel) return;
  btn.classList.toggle("open", open);
  btn.setAttribute("aria-expanded", String(open));
  btn.title = open ? "Hide history" : "Show history";
  btn.setAttribute("aria-label", btn.title);
  panel.classList.toggle("open", open);
  const card = btn.closest(".stat-tile, .meter-card, .mini-meter-card");
  if (card) card.classList.toggle("expanded", open);
  if (open) {
    const builder = expandBuilders.get(id);
    const inner = panel.querySelector(".expand-inner");
    if (builder && inner) {
      inner.innerHTML = builder();
      const chart = inner.querySelector(".chart");
      if (chart) bindChart(chart);
    }
  }
}

document.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".expand-btn");
  if (!btn) return;
  const id = btn.dataset.id;
  const open = !state.expanded.has(id);
  if (open) state.expanded.add(id);
  else state.expanded.delete(id);
  applyExpansion(id, open);
});

function restoreExpanded() {
  for (const id of state.expanded) applyExpansion(id, true);
}

/* ---------- info sheet ("what does this mean?") ---------- */

// Title text plus an ⓘ button, if an explanation exists for this key.
function titleWithInfo(text, key) {
  const btn = INFO[key]
    ? `<button type="button" class="info-btn" data-info="${key}" aria-label="What does this mean?" title="What does this mean?">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 7.2v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="4.9" r="1" fill="currentColor"/></svg>
      </button>`
    : "";
  return `<span class="title-text">${text}</span>${btn}`;
}

document.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".info-btn");
  if (!btn) return;
  const info = INFO[btn.dataset.info];
  if (!info) return;
  const card = btn.closest(".card");
  const title = card?.querySelector(".title-text")?.innerHTML || "";
  document.getElementById("info-title").innerHTML = title;
  document.getElementById("info-body").innerHTML = `
    <div class="info-block"><h3>What is it?</h3><p>${info.what}</p></div>
    <div class="info-block"><h3>How to read it</h3><p>${info.read}</p></div>`;
  openSheet("#info-sheet");
});

/* ---------- market tiles ---------- */

function sliceSeries(market, range) {
  const s = market.series || {};
  if (range === "1D") return s.intraday || null;
  if (range === "5Y") return s.weekly || s.daily || null;
  const daily = s.daily;
  if (!daily) return null;
  if (range === "1Y") return daily;
  const cutoff = daily.t[daily.t.length - 1] - RANGE_DAYS[range] * 86400;
  let from = daily.t.findIndex((ts) => ts >= cutoff);
  if (from < 0) from = 0;
  return { t: daily.t.slice(from), c: daily.c.slice(from) };
}

function marketSlice(market) {
  let slice = sliceSeries(market, state.range);
  if ((!slice || slice.c.length < 2) && market.series) slice = sliceSeries(market, "1W");
  if ((!slice || slice.c.length < 2) && Array.isArray(market.history)) {
    slice = { t: null, c: market.history };
  }
  return slice;
}

function renderMarketTile(market) {
  const id = "mkt-" + sanitizeId(market.symbol);
  const slice = marketSlice(market);
  const closes = slice ? slice.c : [];

  let deltaHtml = "—";
  let cls = "flat";
  if (closes.length >= 2 && closes[0]) {
    if (market.no_pct) {
      const diff = closes[closes.length - 1] - closes[0];
      cls = deltaClass(diff, market.delta_style);
      deltaHtml = `${diff > 0 ? "+" : ""}${formatNumber(diff, { maximumFractionDigits: 2 })} pp (${state.range})`;
    } else {
      const pct = (closes[closes.length - 1] / closes[0] - 1) * 100;
      cls = deltaClass(pct, market.delta_style);
      deltaHtml = `${formatSignedPct(pct)} (${state.range})`;
    }
  }

  const expandable = slice && slice.t && slice.t.length > 1;
  if (expandable) {
    expandBuilders.set(id, () => {
      const s = marketSlice(market);
      return buildLineChart(id, s.t, s.c, {
        showPct: !market.no_pct,
        unit: market.no_pct ? "pp" : "",
      });
    });
  }

  return `
    <div class="card stat-tile">
      ${expandable ? expandButton(id) : ""}
      <div class="label">${titleWithInfo(market.name, market.symbol)}</div>
      <div class="value">${formatNumber(market.price, { maximumFractionDigits: 2 })}</div>
      <div class="delta ${cls}">${cls === "up" ? "▲ " : cls === "down" ? "▼ " : ""}${deltaHtml}</div>
      ${sparklineWithGrid(closes)}
      ${market.stale ? `<div class="stale-note">Last known value (latest fetch failed)</div>` : ""}
      ${expandable ? `<div class="expand-panel" id="panel-${id}"><div class="expand-inner"></div></div>` : ""}
    </div>
  `;
}

/* ---------- fear & greed meters ---------- */

function meterTrack(value, size) {
  const pct = Math.max(0, Math.min(100, value));
  const prefix = size === "mini" ? "mini-meter" : "meter";
  return `<div class="${prefix}-track-wrap">
    <div class="${prefix}-track"></div>
    <div class="${prefix}-pointer" style="left: ${pct}%"></div>
  </div>`;
}

function renderMeterCard(title, fg, id) {
  if (!fg) {
    return `<div class="card meter-card"><div class="meter-title">${titleWithInfo(title, id)}</div><p class="error">No data available</p></div>`;
  }
  const chip = ratingChip(fg.rating);

  let compareHtml = "";
  if (fg.previous_close !== undefined) {
    const rows = [
      ["Prev close", fg.previous_close],
      ["1 week ago", fg.previous_week],
      ["1 month ago", fg.previous_month],
      ["1 year ago", fg.previous_year],
    ];
    compareHtml = `<div class="meter-compare">${rows
      .map(
        ([label, val]) =>
          `<div><span>${label}</span>${val !== undefined && val !== null ? Math.round(val) : "—"}</div>`
      )
      .join("")}</div>`;
  }

  const expandable = fg.history && fg.history.t && fg.history.t.length > 1;
  if (expandable) {
    expandBuilders.set(id, () =>
      buildLineChart(id, fg.history.t, fg.history.v, {
        yMin: 0,
        yMax: 100,
        ticks: [0, 25, 50, 75, 100],
        caption: "Index score — last 12 months",
      })
    );
  }

  return `
    <div class="card meter-card">
      ${expandable ? expandButton(id) : ""}
      <div class="meter-title">${titleWithInfo(title, id)}</div>
      <div class="meter-value-row">
        <span class="meter-value">${formatNumber(fg.value)}</span>
        <span class="chip lg ${chip}">${fg.rating || "—"}</span>
      </div>
      ${meterTrack(fg.value)}
      <div class="meter-scale-labels">
        <span>Extreme Fear</span>
        <span>Neutral</span>
        <span>Extreme Greed</span>
      </div>
      ${compareHtml}
      ${fg.stale ? `<div class="stale-note">Last known value (latest fetch failed)</div>` : ""}
      ${expandable ? `<div class="expand-panel" id="panel-${id}"><div class="expand-inner"></div></div>` : ""}
    </div>
  `;
}

function renderMiniMeter(component) {
  const id = "comp-" + sanitizeId(component.key);
  const chip = ratingChip(component.rating);

  const expandable = component.history && component.history.t && component.history.t.length > 1;
  if (expandable) {
    expandBuilders.set(id, () =>
      buildLineChart(id, component.history.t, component.history.v, {
        caption: "Underlying metric — last 12 months",
      })
    );
  }

  return `
    <div class="card mini-meter-card">
      ${expandable ? expandButton(id) : ""}
      <div class="mini-meter-label">${titleWithInfo(component.label, component.key)}</div>
      <div class="mini-meter-value-row">
        <span class="mini-meter-value">${formatNumber(component.value)}</span>
        <span class="chip ${chip}">${component.rating || "—"}</span>
      </div>
      ${meterTrack(component.value, "mini")}
      ${expandable ? `<div class="expand-panel" id="panel-${id}"><div class="expand-inner"></div></div>` : ""}
    </div>
  `;
}

/* ---------- page assembly ---------- */

function renderUpdatedAt(iso) {
  const el = document.getElementById("updated-at");
  const date = iso ? new Date(iso) : null;
  if (!date || isNaN(date)) {
    el.textContent = "Last updated: unknown";
    setStatus("stale", "Updated: unknown");
    return;
  }
  el.textContent = `Last updated: ${date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  })}`;
  updateFreshness();
}

// Top-bar status: live while the data is at most STALE_HOURS old, then "stale".
// Offline (cached data): banner "Offline . Updated ..." (the kit status itself says "Offline").
function updateFreshness() {
  const iso = state.data && state.data.updated_at;
  const date = iso ? new Date(iso) : null;
  if (!date || isNaN(date)) return;
  const stale = (Date.now() - date.getTime()) / 3600000 > STALE_HOURS;
  const stamp = formatStamp(date, "en");
  setStatus(stale ? "stale" : "live", stale ? `${stamp} · stale` : stamp);
  const banner = document.getElementById("banner");
  if (navigator.onLine === false) {
    banner.innerHTML = `<span aria-hidden="true">◆</span><span><b>Offline</b> · ${stamp} (last saved data)</span>`;
    banner.hidden = false;
  } else if (stale) {
    banner.innerHTML = `<span aria-hidden="true">◆</span><span><b>Data is stale.</b> ${stamp}; the scheduled refresh may have failed.</span>`;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

function renderFearGreed(data) {
  document.getElementById("fear-greed-grid").innerHTML =
    renderMeterCard("CNN Fear &amp; Greed Index", data.fear_greed?.cnn, "cnn") +
    renderMeterCard("Crypto Fear &amp; Greed Index", data.fear_greed?.crypto, "crypto");

  const components = data.fear_greed?.cnn?.components || [];
  document.getElementById("fg-components-grid").innerHTML = components.length
    ? components.map(renderMiniMeter).join("")
    : `<p class="error">No component data available</p>`;
}

function renderMarkets(data) {
  const markets = data.markets || [];
  const byGroup = (group) => markets.filter((m) => (m.group || "indices") === group);
  document.getElementById("markets-grid").innerHTML = byGroup("indices").map(renderMarketTile).join("");
  document.getElementById("rates-grid").innerHTML = byGroup("rates").map(renderMarketTile).join("");
  document.getElementById("commodities-grid").innerHTML = byGroup("commodities").map(renderMarketTile).join("");
}

function applyData(data) {
  state.data = data;
  renderFearGreed(data);
  renderMarkets(data);
  renderUpdatedAt(data.updated_at);
  restoreExpanded();
}

async function loadDashboard() {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    applyData(await res.json());
  } catch (err) {
    setStatus("err", "Load failed");
    toast("Could not load data", err.message);
    document.getElementById("markets-grid").innerHTML =
      `<p class="error">Could not load data: ${err.message}</p>`;
    document.getElementById("fear-greed-grid").innerHTML = "";
    document.getElementById("fg-components-grid").innerHTML = "";
  }
}

bindSeg(document.getElementById("range-select"), (value) => {
  state.range = value;
  if (state.data) {
    renderMarkets(state.data);
    restoreExpanded();
  }
});

document.getElementById("grid-toggle").addEventListener("change", (ev) => {
  state.grid = ev.currentTarget.checked;
  if (state.data) {
    renderMarkets(state.data);
    restoreExpanded();
  }
});

// Chart colors are CSS variables inside the SVG, so a theme change needs no redraw.
initKit({ app: "index", lang: "en" });
addEventListener("kit:online", () => updateFreshness());
setInterval(updateFreshness, 60000);

loadDashboard();

initRefresh({
  dataUrl: DATA_URL,
  currentStamp: () => state.data?.updated_at,
  onData: applyData,
  onDone: updateFreshness,
});

if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
