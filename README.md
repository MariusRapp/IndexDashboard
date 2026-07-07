# Index Dashboard

Statisches, mobil-responsives Dashboard mit Marktindizes (S&P 500, Dow Jones,
Nasdaq 100, DAX, EuroStoxx 50, VIX) und Sentiment-Indikatoren (CNN Fear &
Greed Index, Crypto Fear & Greed Index). Läuft komplett ohne Backend auf
GitHub Pages.

## Wie es funktioniert

GitHub Pages ist reines statisches Hosting — viele Datenquellen (CNN Fear &
Greed, Yahoo Finance) blockieren Cross-Origin-Anfragen aus dem Browser (CORS),
sodass die Seite sie nicht direkt live abrufen kann. Deshalb holt ein
**geplanter GitHub-Actions-Workflow** (`.github/workflows/update-data.yml`)
die Daten alle 3 Stunden server-seitig und committed sie als
[`data/latest.json`](data/latest.json) ins Repo. Die Seite selbst
(`index.html` + `assets/app.js`) lädt nur diese statische JSON-Datei — schnell,
kein API-Key im Client sichtbar, keine CORS-Probleme.

```
scripts/fetch_data.py   → holt Daten, schreibt data/latest.json
.github/workflows/      → Cron-Trigger alle 3h + manueller "Run workflow"-Button
index.html / assets/    → Dashboard, liest data/latest.json
```

Daten sind dadurch nicht "live", sondern maximal 3 Stunden alt — für
Marktindizes und Sentiment-Indikatoren ausreichend aktuell.

## Lokal testen

```bash
python -m http.server 8000
# dann im Browser: http://localhost:8000
```

Daten manuell neu ziehen:

```bash
python scripts/fetch_data.py
```

## Auf GitHub Pages veröffentlichen

1. Neues GitHub-Repo anlegen und dieses Verzeichnis pushen:
   ```bash
   git init
   git add .
   git commit -m "Initial dashboard"
   git branch -M main
   git remote add origin https://github.com/<dein-user>/<repo-name>.git
   git push -u origin main
   ```
2. Im Repo unter **Settings → Pages**: Source = `Deploy from a branch`,
   Branch = `main`, Ordner = `/ (root)`.
3. Unter **Settings → Actions → General → Workflow permissions**:
   `Read and write permissions` aktivieren, damit der Workflow
   `data/latest.json` committen darf.
4. Optional: Unter **Actions** den Workflow „Update index data“ einmal manuell
   per „Run workflow“ starten, damit sofort aktuelle Daten vorliegen (statt
   auf den nächsten Cron-Lauf zu warten).

Die Seite ist danach unter `https://<dein-user>.github.io/<repo-name>/`
erreichbar.

## Weitere Indizes ergänzen

Neue Marktindizes: in `MARKET_SYMBOLS` in `scripts/fetch_data.py` per
Yahoo-Finance-Ticker ergänzen (z.B. `^FTSE`, `^N225`). Neue
Sentiment-/Makro-Quellen (z.B. FRED-Reihen wie Credit-Spreads oder
Zinskurve) am selben Muster wie `fetch_cnn_fear_greed` /
`fetch_crypto_fear_greed` anschließen.
