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
    {"symbol": "^GSPC", "name": "S&P 500"},
    {"symbol": "^DJI", "name": "Dow Jones"},
    {"symbol": "^NDX", "name": "Nasdaq 100"},
    {"symbol": "^GDAXI", "name": "DAX"},
    {"symbol": "^STOXX50E", "name": "EuroStoxx 50"},
    {"symbol": "^VIX", "name": "VIX"},
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


def fetch_markets(previous):
    prev_markets = {m["symbol"]: m for m in previous.get("markets", [])}
    result = []
    for item in MARKET_SYMBOLS:
        symbol, name = item["symbol"], item["name"]
        try:
            fetched = fetch_market_index(symbol)
            result.append({"symbol": symbol, "name": name, **fetched, "stale": False})
        except Exception as exc:
            print(f"[warn] market fetch failed for {symbol}: {exc}", file=sys.stderr)
            fallback = prev_markets.get(symbol)
            if fallback:
                fallback = {**fallback, "stale": True}
                result.append(fallback)
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
        return {
            "value": round(float(score)),
            "rating": (rating or "").title(),
            "previous_close": fg.get("previous_close"),
            "previous_week": fg.get("previous_1_week"),
            "previous_month": fg.get("previous_1_month"),
            "previous_year": fg.get("previous_1_year"),
            "timestamp": fg.get("timestamp"),
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
