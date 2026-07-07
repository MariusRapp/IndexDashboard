#!/usr/bin/env python3
"""Fetches market indices and sentiment indices, writes data/latest.json.

Runs inside GitHub Actions (server-side) so CORS-blocked sources (CNN,
Yahoo Finance) are reachable regardless of what a browser could fetch
directly.
"""
import json
import sys
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "latest.json"

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}

CNN_HEADERS = {
    **BROWSER_HEADERS,
    "Referer": "https://www.cnn.com/markets/fear-and-greed",
    "Origin": "https://www.cnn.com",
}

MARKET_SYMBOLS = [
    {"symbol": "^GSPC", "name": "S&P 500", "group": "indices"},
    {"symbol": "^DJI", "name": "Dow Jones", "group": "indices"},
    {"symbol": "^NDX", "name": "Nasdaq 100", "group": "indices"},
    {"symbol": "^GDAXI", "name": "DAX", "group": "indices"},
    {"symbol": "^STOXX50E", "name": "EURO STOXX 50", "group": "indices"},
    {"symbol": "^N225", "name": "Nikkei 225", "group": "indices"},
    {"symbol": "^FTSE", "name": "FTSE 100", "group": "indices"},
    {"symbol": "URTH", "name": "MSCI World (ETF)", "group": "indices"},
    {"symbol": "^VIX", "name": "VIX", "group": "rates", "delta_style": "inverse"},
    {"symbol": "^MOVE", "name": "MOVE Index (bond volatility)", "group": "rates", "delta_style": "inverse"},
    {"symbol": "^TNX", "name": "US 10Y Treasury Yield (%)", "group": "rates", "delta_style": "neutral"},
    {"symbol": "DX-Y.NYB", "name": "US Dollar Index (DXY)", "group": "rates", "delta_style": "neutral"},
    {"symbol": "GC=F", "name": "Gold (USD/oz)", "group": "commodities"},
    {"symbol": "CL=F", "name": "WTI Crude Oil (USD)", "group": "commodities"},
    {"symbol": "BTC-USD", "name": "Bitcoin (USD)", "group": "commodities"},
    {"symbol": "ETH-USD", "name": "Ethereum (USD)", "group": "commodities"},
]

# Computed indicator: 10-year minus 3-month treasury yield (classic
# recession signal when negative). Built from two Yahoo series because
# FRED's T10Y3M endpoint is unreliable without an API key.
YIELD_CURVE = {
    "symbol": "10Y-3M",
    "name": "Yield Curve 10Y-3M (pp)",
    "group": "rates",
    "delta_style": "neutral",
    "no_pct": True,
}

# Yahoo range/interval per selectable horizon. 1W/1M/3M/1Y are sliced
# client-side from the daily series; only these three need fetching.
SERIES_SPECS = [
    ("intraday", "1d", "15m"),
    ("daily", "1y", "1d"),
    ("weekly", "5y", "1wk"),
]

# CNN's official 7 components. The API also exposes market_momentum_sp500 and
# market_volatility_vix as near-duplicate raw variants of the sp125/vix_50
# keys below (same score/rating) - those are skipped to avoid redundancy.
CNN_COMPONENTS = [
    ("market_momentum_sp125", "Market Momentum (S&P 500 vs. 125-day avg)"),
    ("stock_price_strength", "Stock Price Strength (52-week highs & lows)"),
    ("stock_price_breadth", "Stock Price Breadth (advancing vs. declining volume)"),
    ("put_call_options", "Put & Call Options (5-day ratio)"),
    ("market_volatility_vix_50", "Market Volatility (VIX vs. 50-day avg)"),
    ("junk_bond_demand", "Junk Bond Demand (yield spread)"),
    ("safe_haven_demand", "Safe Haven Demand (stocks vs. bonds)"),
]


def http_get(url, timeout=15, headers=None):
    req = urllib.request.Request(url, headers=headers or BROWSER_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def load_previous():
    if DATA_PATH.exists():
        try:
            return json.loads(DATA_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def fetch_chart(symbol, rng, interval):
    """One Yahoo chart series as parallel timestamp/close arrays."""
    encoded = urllib.parse.quote(symbol)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}?range={rng}&interval={interval}"
    payload = json.loads(http_get(url))
    result = (payload.get("chart") or {}).get("result") or []
    if not result:
        raise ValueError(f"no chart data for {symbol} {rng}")
    res = result[0]
    quote = res["indicators"]["quote"][0]
    pairs = [
        (t, c)
        for t, c in zip(res.get("timestamp") or [], quote.get("close") or [])
        if c is not None
    ]
    if len(pairs) < 2:
        raise ValueError(f"not enough rows for {symbol} {rng}")
    return res.get("meta", {}), {
        "t": [p[0] for p in pairs],
        "c": [round(p[1], 3) for p in pairs],
    }


def fetch_market_series(symbol):
    """Daily series is mandatory; intraday/weekly are best-effort extras."""
    meta, daily = fetch_chart(symbol, "1y", "1d")
    series = {"daily": daily}
    for key, rng, interval in SERIES_SPECS:
        if key == "daily":
            continue
        try:
            _, series[key] = fetch_chart(symbol, rng, interval)
        except Exception as exc:
            print(f"[warn] {key} series failed for {symbol}: {exc}", file=sys.stderr)
    closes = daily["c"]
    last = meta.get("regularMarketPrice") or closes[-1]
    prev = closes[-2]
    change_pct = (last - prev) / prev * 100 if prev else None
    return {
        "price": round(last, 2),
        "change_pct": round(change_pct, 2) if change_pct is not None else None,
        "date": datetime.fromtimestamp(daily["t"][-1], tz=timezone.utc).date().isoformat(),
        "series": series,
    }


def _spread_series(long_s, short_s):
    """Elementwise long-short, aligned by timestamp (tail-zip fallback)."""
    short_map = dict(zip(short_s["t"], short_s["c"]))
    t, c = [], []
    for ts, cl in zip(long_s["t"], long_s["c"]):
        cs = short_map.get(ts)
        if cs is not None:
            t.append(ts)
            c.append(round(cl - cs, 3))
    if len(t) >= 10:
        return {"t": t, "c": c}
    n = min(len(long_s["t"]), len(short_s["t"]))
    return {
        "t": long_s["t"][-n:],
        "c": [round(a - b, 3) for a, b in zip(long_s["c"][-n:], short_s["c"][-n:])],
    }


def fetch_yield_curve():
    """10Y minus 3M treasury yield, in percentage points. No intraday
    variant: the two Yahoo series stamp intraday bars inconsistently."""
    long_ = fetch_market_series("^TNX")
    short = fetch_market_series("^IRX")
    series = {}
    for key in ("daily", "weekly"):
        if long_["series"].get(key) and short["series"].get(key):
            series[key] = _spread_series(long_["series"][key], short["series"][key])
    daily = series["daily"]
    return {
        "price": round(daily["c"][-1], 2),
        "change_pct": None,
        "date": long_["date"],
        "series": series,
    }


def fetch_markets(previous):
    prev_markets = {m["symbol"]: m for m in previous.get("markets", [])}
    result = []
    for item in MARKET_SYMBOLS:
        symbol = item["symbol"]
        try:
            fetched = fetch_market_series(symbol)
            result.append({**item, **fetched, "stale": False})
        except Exception as exc:
            print(f"[warn] market fetch failed for {symbol}: {exc}", file=sys.stderr)
            fallback = prev_markets.get(symbol)
            if fallback:
                result.append({**fallback, **item, "stale": True})

    try:
        result.append({**YIELD_CURVE, **fetch_yield_curve(), "stale": False})
    except Exception as exc:
        print(f"[warn] yield curve fetch failed: {exc}", file=sys.stderr)
        fallback = prev_markets.get(YIELD_CURVE["symbol"])
        if fallback:
            result.append({**fallback, **YIELD_CURVE, "stale": True})

    return result


def fetch_crypto_fear_greed(previous):
    try:
        text = http_get("https://api.alternative.me/fng/?limit=365")
        payload = json.loads(text)
        entries = payload.get("data", [])
        if not entries:
            raise ValueError("empty crypto F&G response")
        latest = entries[0]
        ordered = list(reversed(entries))
        return {
            "value": int(latest["value"]),
            "rating": latest["value_classification"],
            "timestamp": latest["timestamp"],
            "history": {
                "t": [int(e["timestamp"]) for e in ordered],
                "v": [int(e["value"]) for e in ordered],
            },
            "stale": False,
        }
    except Exception as exc:
        print(f"[warn] crypto fear&greed fetch failed: {exc}", file=sys.stderr)
        fallback = previous.get("fear_greed", {}).get("crypto")
        if fallback:
            return {**fallback, "stale": True}
        return None


def _cnn_history(node):
    """CNN chart points ({x: ms, y: value}) as parallel arrays in seconds."""
    points = (node or {}).get("data") or []
    return {
        "t": [int(p["x"] / 1000) for p in points],
        "v": [round(float(p["y"]), 3) for p in points],
    }


def fetch_cnn_fear_greed(previous):
    try:
        text = http_get(
            "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
            headers=CNN_HEADERS,
        )
        payload = json.loads(text)
        fg = payload.get("fear_and_greed") or {}
        score = fg.get("score")
        rating = fg.get("rating")
        if score is None:
            raise ValueError("no score in CNN response")

        components = []
        for key, label in CNN_COMPONENTS:
            comp = payload.get(key)
            if not comp or comp.get("score") is None:
                continue
            components.append({
                "key": key,
                "label": label,
                "value": round(float(comp["score"])),
                "rating": (comp.get("rating") or "").title(),
                # Note: per-component history is the raw underlying metric
                # (e.g. S&P level, yield spread), not the 0-100 score -
                # that's all the API provides, and it's what CNN charts too.
                "history": _cnn_history(comp),
            })

        return {
            "value": round(float(score)),
            "rating": (rating or "").title(),
            "previous_close": fg.get("previous_close"),
            "previous_week": fg.get("previous_1_week"),
            "previous_month": fg.get("previous_1_month"),
            "previous_year": fg.get("previous_1_year"),
            "timestamp": fg.get("timestamp"),
            "history": _cnn_history(payload.get("fear_and_greed_historical")),
            "components": components,
            "stale": False,
        }
    except Exception as exc:
        print(f"[warn] CNN fear&greed fetch failed: {exc}", file=sys.stderr)
        fallback = previous.get("fear_greed", {}).get("cnn")
        if fallback:
            return {**fallback, "stale": True}
        return None


def main():
    previous = load_previous()
    data = {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "fear_greed": {
            "cnn": fetch_cnn_fear_greed(previous),
            "crypto": fetch_crypto_fear_greed(previous),
        },
        "markets": fetch_markets(previous),
    }
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote {DATA_PATH} ({DATA_PATH.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
