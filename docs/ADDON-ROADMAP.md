# Astoris — Add-on-Roadmap

Kuratierte Liste möglicher Add-ons, gefiltert gegen den IST-Stand und den Sandbox-Rahmen
(Code-Add-ons haben `fetch`, `JSON`, `Math`, `Date`, `console` — kein Dateisystem/Prozesse, 5 s Timeout).

## Schon vorhanden (nicht neu bauen)
- **Kalender** (eingebautes KI-Werkzeug: list/create/update/delete)
- **IBAN-Prüfer**, **Passwort-Generator**, **Wetter** (Demo-Add-ons)
- **aigate** (Secret-Scanner / Cloud-DLP, Premium)

## Tier 1 — Pflicht / höchster Hebel (sofort baubar)
| Add-on | Nutzen | Typ | Bedarf |
|---|---|---|---|
| **Web-Search** | Live-Websuche mit Quellen — Top-Pick in JEDEM Ökosystem | Externe-API | Such-API (Brave/SerpAPI/DuckDuckGo) |
| **URL-Reader** | Webseite holen → sauberer Text/Markdown für die KI | fetch | — |
| **Universal-HTTP** | Generischer GET/POST gegen jede REST-API | fetch | — |
| **Währungsrechner** | Beträge mit Live-Wechselkursen umrechnen | fetch | gratis (frankfurter.app) |
| **Einheiten- & Finanz-Rechner** | Längen/Gewicht/Temp + Zins/Marge/ROI, rein offline | Berechnung | — |
| **Hash & Encode** | Base64, SHA, URL-Encode, JWT-Decode | Berechnung | — |

## Tier 2 — Astoris-Integrationen (eigene Dienste als KI-Werkzeug)
*Höchster „Wow"-Faktor: die KI bedient Astoris selbst. Als eingebaute Tools wie der Kalender.*
| Add-on | Nutzen | Bedarf |
|---|---|---|
| **Mail-senden/-beantworten** | KI verfasst & versendet Mail aus dem Postfach | nutzt Mail-API + promptGuard |
| **Messenger-senden** | KI verschickt verschlüsselte Nachricht an einen Kontakt | nutzt Crypt-Messenger |
| **Dokumente durchsuchen (RAG)** | KI greift auf hochgeladene Dokumente zu | Embeddings/Index |
| **Tresor-Zugriff** | KI liest/legt Secrets (nur nach Auth, sensibel) | Auth-Gate |

## Tier 3 — Nützlich, baubar (mittel)
| Add-on | Typ | Bedarf |
|---|---|---|
| **JSON/YAML-Tool** (validieren/formatieren/JSONPath) | Berechnung | — |
| **Regex-Tester** (Matches + Erklärung) | Berechnung | — |
| **VAT/USt-Tool** (MwSt + EU-VIES-Validierung) | fetch | — |
| **Aktien/Krypto-Kurse** | fetch | API-Key (je nach Quelle) |
| **News-Feed / RSS** | fetch | — |
| **Wikipedia/Fakten** | fetch | — |
| **QR-Generator** (SEPA/vCard/WLAN) | Daten | QR-Lib |
| **Zeitzonen-Helper** | Berechnung | — |

## Tier 4 — Braucht mehr Infrastruktur (später)
- **PDF-Extraktor / Datei-Konverter** — Libs außerhalb der Sandbox nötig
- **Code-Interpreter** — Sandbox-Erweiterung (Python/JS-Ausführung)
- **OCR · TTS/STT** — externe Modelle/Services
- **Meeting-Summarizer** — Audio→Text (Whisper)
- **Notion/Trello-Bridge** — Connector + OAuth

## Empfehlung — die „unbedingt"-Sechs für den nächsten Sprint
1. **Web-Search** + **URL-Reader** — öffnen das Web für die KI (größter spürbarer Sprung)
2. **Universal-HTTP** — eine Brücke zu *jeder* externen API ohne neues Add-on
3. **Mail-senden** + **Messenger-senden** — Astoris bedient sich selbst (Alleinstellung)
4. **Hash & Encode** — winziger Aufwand, ständig gebraucht (Dev/Security)

Quellen: OpenWebUI Tools, LibreChat Plugins, AnythingLLM Agent Skills, ChatGPT-Plugins/GPT-Store,
n8n HTTP-Request-Tool, Flowise — übergreifend sind Web-Search, HTTP-Universal, Code-Interpreter und
Datei-/Dokument-Verarbeitung die meistgenutzten Tool-Typen.
