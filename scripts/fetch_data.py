#!/usr/bin/env python3
"""Fetches market indices and sentiment indices, writes data/latest.json.

Runs inside GitHub Actions (server-side) so CORS-blocked sources (CNN, Stooq)
are reachable regardless of what a browser could fetch directly.
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
    {"symbol": "^STOXX50E", "name": "EuroStoxx 50", "group": "indices"},
    {"symbol": "^N225", "name": "Nikkei 225", "group": "indices"},
    {"symbol": "^FTSE", "name": "FTSE 100", "group": "indices"},
    {"symbol": "URTH", "name": "MSCI World (ETF)", "group": "indices"},
    {"symbol": "^VIX", "name": "VIX", "group": "rates", "delta_style": "inverse"},
    {"symbol": "^MOVE", "name": "MOVE (Anleihen-Vola)", "group": "rates", "delta_style": "inverse"},
    {"symbol": "^TNX", "name": "US-Rendite 10J (%)", "group": "rates", "delta_style": "neutral"},
    {"symbol": "DX-Y.NYB", "name": "Dollar-Index (DXY)", "group": "rates", "delta_style": "neutral"},
    {"symbol": "GC=F", "name": "Gold (USD/oz)", "group": "commodities"},
    {"symbol": "CL=F", "name": "WTI Rohöl (USD)", "group": "commodities"},
    {"symbol": "BTC-USD", "name": "Bitcoin (USD)", "group": "commodities"},
    {"symbol": "ETH-USD", "name": "Ethereum (USD)", "group": "commodities"},
]

# Computed indicator: 10-year minus 3-month treasury yield (classic
# recession signal when negative). Built from two Yahoo series because
# FRED's T10Y3M endpoint is unreliable without an API key.
YIELD_CURVE = {"symbol": "10Y-3M", "name": "Zinskurve 10J − 3M (Pp.)", "group": "rates"}


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


def fetch_market_index(symbol):
    """Last ~30 daily closes from Yahoo Finance's chart API (no API key needed)."""
    encoded = urllib.parse.quote(symbol)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}?range=1mo&interval=1d"
    payload = json.loads(http_get(url))
    result = (payload.get("chart") or {}).get("result") or []
    if not result:
        raise ValueError(f"no data for {symbol}")
    meta = result[0].get("meta", {})
    quote = result[0]["indicators"]["quote"][0]
    timestamps = result[0].get("timestamp", [])
    closes = [c for c in quote.get("close", []) if c is not None]
    if len(closes) < 2:
        raise ValueError(f"not enough rows for {symbol}")
    last = meta.get("regularMarketPrice", closes[-1])
    prev = closes[-2]
    change_pct = (last - prev) / prev * 100 if prev else None
    last_date = datetime.fromtimestamp(timestamps[-1], tz=timezone.utc).date().isoformat() if timestamps else None
    return {
        "price": round(last, 2),
        "change_pct": round(change_pct, 2) if change_pct is not None else None,
        "date": last_date,
        "history": [round(c, 2) for c in closes],
    }


def fetch_yield_curve():
    """10Y minus 3M treasury yield, in percentage points."""
    long_end = fetch_market_index("^TNX")
    short_end = fetch_market_index("^IRX")
    n = min(len(long_end["history"]), len(short_end["history"]))
    history = [
        round(l - s, 2)
        for l, s in zip(long_end["history"][-n:], short_end["history"][-n:])
    ]
    return {
        "price": round(long_end["price"] - short_end["price"], 2),
        "change_pct": None,
        "date": long_end["date"],
        "history": history,
    }


def fetch_markets(previous):
    prev_markets = {m["symbol"]: m for m in previous.get("markets", [])}
    result = []
    for item in MARKET_SYMBOLS:
        symbol = item["symbol"]
        try:
            fetched = fetch_market_index(symbol)
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
            result.append({**fallback, "group": YIELD_CURVE["group"], "stale": True})

    return result


def fetch_crypto_fear_greed(previous):
    try:
        text = http_get("https://api.alternative.me/fng/?limit=30")
        payload = json.loads(text)
        entries = payload.get("data", [])
        if not entries:
            raise ValueError("empty crypto F&G response")
        latest = entries[0]
        history = [int(e["value"]) for e in reversed(entries)]
        return {
            "value": int(latest["value"]),
            "rating": latest["value_classification"],
            "timestamp": latest["timestamp"],
            "history": history,
            "stale": False,
        }
    except Exception as exc:
        print(f"[warn] crypto fear&greed fetch failed: {exc}", file=sys.stderr)
        fallback = previous.get("fear_greed", {}).get("crypto")
        if fallback:
            return {**fallback, "stale": True}
        return None


# CNN's official 7 components. The API also exposes market_momentum_sp500 and
# market_volatility_vix as near-duplicate raw variants of the sp125/vix_50
# keys below (same score/rating) - those are skipped to avoid redundancy.
CNN_COMPONENTS = [
    ("market_momentum_sp125", "Marktdynamik (S&P 500 vs. 125-Tage-Linie)"),
    ("stock_price_strength", "Kursstärke (Hoch/Tief-Verhältnis)"),
    ("stock_price_breadth", "Marktbreite (Handelsvolumen)"),
    ("put_call_options", "Put/Call-Verhältnis"),
    ("market_volatility_vix_50", "Volatilität (VIX vs. 50-Tage-Linie)"),
    ("junk_bond_demand", "Nachfrage nach Ramsch-Anleihen"),
    ("safe_haven_demand", "Nachfrage nach sicheren Häfen"),
]


def fetch_cnn_fear_greed(previous):
    try:
        text = http_get(
            "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
            headers=CNN_HEADERS,
        )
        payload = json.loads(text)
        fg = payload.get("fear_and_greed") or payload.get("fear_and_greed_historical", {})
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
            })

        return {
            "value": round(float(score)),
            "rating": (rating or "").title(),
            "previous_close": fg.get("previous_close"),
            "previous_week": fg.get("previous_1_week"),
            "previous_month": fg.get("previous_1_month"),
            "previous_year": fg.get("previous_1_year"),
            "timestamp": fg.get("timestamp"),
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
    DATA_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {DATA_PATH}")


if __name__ == "__main__":
    main()
