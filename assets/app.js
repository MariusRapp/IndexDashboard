const DATA_URL = "data/latest.json";

const RATING_DE = {
  "extreme fear": "Extreme Angst",
  "fear": "Angst",
  "neutral": "Neutral",
  "greed": "Gier",
  "extreme greed": "Extreme Gier",
};

function ratingLabel(rating) {
  if (!rating) return "—";
  return RATING_DE[rating.toLowerCase()] || rating;
}

function ratingColorVar(rating) {
  const key = (rating || "").toLowerCase();
  if (key.includes("extreme fear")) return "--status-critical";
  if (key === "fear") return "--status-serious";
  if (key.includes("extreme greed")) return "--status-good";
  if (key === "greed") return "--status-good";
  return "--status-warning";
}

function formatNumber(value, opts = {}) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("de-DE", opts).format(value);
}

function formatSignedPct(value) {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, { maximumFractionDigits: 2 })} %`;
}

function deltaClass(value) {
  if (value === null || value === undefined || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

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
    <polyline points="${points}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
  </svg>`;
}

function renderMarketTile(market) {
  const deltaCls = deltaClass(market.change_pct);
  const staleNote = market.stale
    ? `<div class="stale-note">Letzter bekannter Stand (Abruf zuletzt fehlgeschlagen)</div>`
    : "";
  return `
    <div class="stat-tile">
      <div class="label">${market.name}</div>
      <div class="value">${formatNumber(market.price, { maximumFractionDigits: 2 })}</div>
      <div class="delta ${deltaCls}">${formatSignedPct(market.change_pct)}</div>
      ${buildSparkline(market.history)}
      ${staleNote}
    </div>
  `;
}

function renderMeterCard(title, fg) {
  if (!fg) {
    return `<div class="meter-card"><div class="meter-title">${title}</div><p class="error">Keine Daten verfügbar</p></div>`;
  }
  const pct = Math.max(0, Math.min(100, fg.value));
  const colorVar = ratingColorVar(fg.rating);
  const staleNote = fg.stale
    ? `<div class="stale-note">Letzter bekannter Stand (Abruf zuletzt fehlgeschlagen)</div>`
    : "";

  let compareHtml = "";
  if (fg.previous_close !== undefined) {
    const rows = [
      ["Gestern", fg.previous_close],
      ["Vorwoche", fg.previous_week],
      ["Vormonat", fg.previous_month],
      ["Vorjahr", fg.previous_year],
    ];
    compareHtml = `<div class="meter-compare">${rows
      .map(
        ([label, val]) =>
          `<div><span>${label}</span>${val !== undefined && val !== null ? Math.round(val) : "—"}</div>`
      )
      .join("")}</div>`;
  }

  return `
    <div class="meter-card">
      <div class="meter-title">${title}</div>
      <div class="meter-value-row">
        <span class="meter-value">${formatNumber(fg.value)}</span>
        <span class="meter-rating" style="background: var(${colorVar})">${ratingLabel(fg.rating)}</span>
      </div>
      <div class="meter-track-wrap">
        <div class="meter-track"></div>
        <div class="meter-pointer" style="left: ${pct}%"></div>
      </div>
      <div class="meter-scale-labels">
        <span>Extreme Angst</span>
        <span>Neutral</span>
        <span>Extreme Gier</span>
      </div>
      ${compareHtml}
      ${staleNote}
    </div>
  `;
}

function renderMiniMeter(component) {
  const pct = Math.max(0, Math.min(100, component.value));
  const colorVar = ratingColorVar(component.rating);
  return `
    <div class="mini-meter-card">
      <div class="mini-meter-label">${component.label}</div>
      <div class="mini-meter-value-row">
        <span class="mini-meter-value">${formatNumber(component.value)}</span>
        <span class="mini-meter-rating" style="background: var(${colorVar})">${ratingLabel(component.rating)}</span>
      </div>
      <div class="mini-meter-track-wrap">
        <div class="mini-meter-track"></div>
        <div class="mini-meter-pointer" style="left: ${pct}%"></div>
      </div>
    </div>
  `;
}

function renderUpdatedAt(iso) {
  const el = document.getElementById("updated-at");
  if (!iso) {
    el.textContent = "Letztes Update: unbekannt";
    return;
  }
  const date = new Date(iso);
  el.textContent = `Letztes Update: ${date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  })}`;
}

async function loadDashboard() {
  const marketsGrid = document.getElementById("markets-grid");
  const fgGrid = document.getElementById("fear-greed-grid");
  const fgComponentsGrid = document.getElementById("fg-components-grid");
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    fgGrid.innerHTML =
      renderMeterCard("CNN Fear &amp; Greed Index", data.fear_greed?.cnn) +
      renderMeterCard("Crypto Fear &amp; Greed Index", data.fear_greed?.crypto);

    const components = data.fear_greed?.cnn?.components || [];
    fgComponentsGrid.innerHTML = components.length
      ? components.map(renderMiniMeter).join("")
      : `<p class="error">Keine Teilindikatoren verfügbar</p>`;

    marketsGrid.innerHTML = (data.markets || []).map(renderMarketTile).join("");

    renderUpdatedAt(data.updated_at);
  } catch (err) {
    marketsGrid.innerHTML = `<p class="error">Daten konnten nicht geladen werden: ${err.message}</p>`;
    fgGrid.innerHTML = "";
    fgComponentsGrid.innerHTML = "";
  }
}

loadDashboard();
