# Astoris — Add-on-Ideen (recherchiert aus AI-Tool-Sammlungen)

Gefiltert auf die Sandbox (fetch, JSON, Math, Date, crypto, btoa/atob, TextEncoder, URL — kein FS/Prozesse, 5s).
Quellen: OpenWebUI Tools (MIT/BSD), LangChain (MIT), n8n (Fair-Code, nur Ideen), Dify/Flowise (Apache),
AnythingLLM (MIT), Open Interpreter (AGPL, nur Ideen), diverse awesome-Listen + keyfreie Public-APIs.
**Regel: Wir schreiben Code SELBST (eigene Implementierung), nur Ideen aus den Quellen.**

## Quick-Wins (offline, null Abhängigkeit, sofort baubar)
Cron-Übersetzer · Markdown→HTML/Text · Zeitzonen-Konverter · Text-Statistik+Lesezeit · JSON-Formatter/JSONPath ·
JWT-Decoder · Regex-Tester · UUID/ULID-Generator · MwSt/Brutto-Netto · Kredit-/Annuitäten-Rechner ·
CSV↔JSON↔Markdown · Base64/Hex-Pipeline · Zahlen-Basis-Konverter · Unix-Timestamp · TOTP/2FA-Generator ·
Token-Zähler+Kosten · Color-Konverter+Kontrast · Statistik-Aggregator · Passwort-Stärke (Entropie) ·
Geo-Distanz (Haversine) · Slug/Filename-Generator · Arbeitstage-Rechner · ROI/Margin/Break-Even ·
vCard-Generator · iCal-Event-Generator · Random-Daten/Mock · Diff-Tool · SQL-Formatter

## Keyfreie Gratis-APIs (fetch, kein Schlüssel)
Feiertags-Checker (Nager.Date) · GitHub-Repo-Insights · npm/PyPI-Lookup · Krypto-Kurse (CoinGecko) ·
USt-IdNr-Prüfer (VIES) · Wikidata-Fakten · arXiv/Semantic-Scholar · Hacker-News/Reddit-Trends ·
RSS/Atom-Reader · Wörterbuch+Synonyme (dictionaryapi.dev) · Land-/Flaggen-Infos (REST Countries) ·
IP-Geolocation · Geocoding (Nominatim/OSM) · HaveIBeenPwned-PW-Check (k-Anonymity) · DNS/MX/SPF (DoH) ·
Domain-WHOIS (RDAP) · URL/Open-Graph-Extraktor · E-Mail-Validator (Syntax+MX)

## Key-pflichtig (Gratis-Tier, später wenn Secret-Handling im Add-on steht)
Aktien-Quote (Finnhub) · Übersetzer (DeepL/LibreTranslate) · Sanktions-Screening (OpenSanctions) ·
SSL-Zert-Info (crt.sh) · YouTube-Transcript

## Teilweise (Payload ja, Bild-Rendering nein)
SEPA-Zahlungs-QR (Payload) · QR-Payload-Decoder (Text) — Bild-Rendering bräuchte Renderer außerhalb Sandbox

Volle Details + Lizenztabelle: siehe Recherche-Ausgabe / Chat-Verlauf.
