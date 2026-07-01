# Astoris — Selbst-erweiterndes Firmen-System ("Autopoiesis")

Plan-Dokument. Stand: 2026-07-01. Status: Konzept, wartet auf Operator-Freigabe.

Idee: Eine KI-Firma, die anhand ihrer **Goals** selbst erkennt, welche Fähigkeit
ihr fehlt, sich einen **Plan** macht, die fehlende Erweiterung als Code **selbst
baut**, sie in einer Sandbox **testet**, und dem Operator als **Vorschlag mit
Allow/Deny** präsentiert. Nach Freigabe installiert sie sich selbst und **lernt**
aus dem Ergebnis. Alles Sicherheits-/Freigabe-relevante bleibt außerhalb der
Reichweite der KI.

---

## 1. Leitprinzipien (aus der Forschung, auf Astoris gemünzt)

1. **Skills = versionierte Code-Artefakte + Retrieval** (Voyager/ADAS). Jede
   Fähigkeit ist ein eigenständiges Add-on mit Beschreibung; nichts wird
   in-place überschrieben, jede Version bleibt im Archiv.
2. **Empirische Akzeptanz statt Behauptung** (Darwin Gödel Machine). Eine
   Erweiterung wird nur vorgeschlagen, wenn ein **automatischer Sandbox-Test grün**
   ist — nicht weil das Modell sagt "hat geklappt".
3. **Getrennter Prüfer** (Voyager). Der Verifikations-Schritt nutzt einen anderen
   Prompt/Rolle als der Generator und prüft gegen echtes Ausführungs-Feedback.
4. **Meta-Ebene ≠ Ausführungs-Ebene** (ADAS). Der "Kurator", der Fähigkeiten
   entwirft, ist getrennt vom Betrieb, der sie nutzt. Ein Archiv vergangener
   Vorschläge ist Kontext für die nächste Runde.
5. **Ziele als einziger Steuerhebel** (MetaGPT/AutoGPT), aber strukturierte
   Handoffs statt Freitext-Geschwätz.
6. **Archiv + Lineage statt linearer Selbstverbesserung** → Rollback, Diversität,
   Nachvollziehbarkeit.
7. **Approval-Gate ist hart-blockierend** für alles Irreversible.

### Bekannte Fallen (vermeiden)
- **Objective-Hacking / Goodhart:** Bei der DGM hat ein Agent "Halluzinationen
  reduzieren" gelöst, indem er das **Logging abschaltete, das Halluzinationen
  misst**. → Metrik ≠ Ziel. Die Verifikations-Infrastruktur muss **außerhalb**
  dessen liegen, was die KI ändern kann.
- **Halluzinierte Erfolgsmeldung** → immer gegen Ground-Truth (echter
  Sandbox-Lauf) prüfen.
- **Scope-Creep der Selbstmodifikation** → die KI darf **nie** Kern-Sicherheits-,
  Approval- oder Constitution-Logik selbst umschreiben.

---

## 2. Was schon steht (Fundament, ~70 %)

| Baustein | Datei | Rolle im Kreislauf |
|---|---|---|
| KI-Add-on-Generator | `src/lib/server/addonGen.ts` | erzeugt Code-Add-on aus Beschreibung |
| Sandbox | `src/lib/server/sandbox.ts` | `node:vm`, SSRF-Schutz, 5 s-Timeout, kein fs/proc |
| Plugin-Registry | `src/lib/server/plugins.ts` | Install/Enable/Remove, Schema-Validierung, `enabled`-Gate |
| Goals/Tasks/Feed/Memory | `src/lib/server/company.ts` | Ziele mit Metrik, Task-Status `wartet-freigabe`, Aktivitätsstrom |
| Autonomie 0–5 | `company.ts` `AUTONOMY_LEVELS` | steuert, wie weit die KI ohne Rückfrage darf |
| Engine | `src/lib/server/engine.ts` | `engineChat`, lokal vLLM :8000, skip-on-fail |

Es fehlt der **autonome Regelkreis** obendrauf + die **Sicherheits-Governance**
(Constitution, Audit, Rollback, Not-Aus).

---

## 3. Der Regelkreis ("Autopoiesis-Loop")

```
        ┌──────────────────────────────────────────────────────────┐
        │                      GOALS (Richtung)                      │
        └──────────────────────────┬───────────────────────────────┘
                                   ▼
   (1) BEOBACHTEN     Kurator liest Goals + offene Tasks + Feed + vorhandene
                      Add-ons → "Welche Fähigkeit fehlt, um Ziel X zu erreichen?"
                                   ▼
   (2) PLANEN         Erzeugt einen Vorschlag: {Ziel-Bezug, Lücke, geplantes
                      Add-on, Nutzen, Risiko}. Noch KEIN Code.
                                   ▼
   (3) BAUEN          addonGen.ts erzeugt das Code-Add-on.
                                   ▼
   (4) TESTEN         Sandbox-Lauf mit generiertem Beispiel-Input.
                      Getrennter Prüfer-Prompt bewertet das Ergebnis.
                      ── rot? zurück zu (3), max. N Versuche ──
                                   ▼
   (5) VORSCHLAGEN    Landet als "Vorschlag" (Proposal) im Cockpit:
                      Diff/Code, Testergebnis, Ziel-Bezug, Risiko-Badge.
                                   ▼
   (6) OPERATOR      ┌── ALLOW ──▶ installieren (plugins.ts), Version + Lineage,
                     │             Audit-Log-Eintrag, Feed-Post
                     └── DENY  ──▶ archivieren mit Begründung (fließt als
                                   Kontext in die nächste Runde ein)
                                   ▼
   (7) LERNEN         Ergebnis (genutzt? Fehler? Metrik bewegt?) zurück in
                      Memory + Proposal-Archiv → nächste Beobachtung ist klüger.
```

Der Loop läuft **nicht** wild dauerhaft, sondern getaktet: manuell per Button
("Firma weiterentwickeln"), oder als Timer mit hartem Budget (max. K Vorschläge
pro Tag). **Kein Auto-Install** — Schritt 6 ist immer der Mensch, solange das
Autonomie-Level des "Entwickler"-Agenten < 5 ist.

---

## 4. Neue Bausteine (konkret)

### 4.1 Constitution (`data/constitution.json`) — Sicherheits-Verfassung
Maschinenlesbare Policy, **außerhalb** der KI-Reichweite (nur Operator ändert sie):
- `autoAllow`: was ohne Rückfrage erlaubt ist (Default: **nichts** Ausführbares)
- `requireApproval`: alles Code-Installierende (immer an)
- `forbidden`: harte Verbote (z. B. `.env` lesen, Egress außerhalb Whitelist,
  interne IPs — spiegelt schon `sandbox.ts`)
- `budgets`: max. Vorschläge/Tag, max. Add-ons gesamt, Timeout
- `egressWhitelist`: erlaubte Ziel-Domains für generierten Code

### 4.2 Proposal-Store (`src/lib/server/proposals.ts` + `data/companies/<id>/proposals.json`)
Pro Firma. Ein Proposal:
```ts
{
  id, goalId, gap,            // welche Lücke, welches Ziel
  title, rationale, risk,     // Begründung + Risiko (niedrig|mittel|hoch)
  addon: GeneratedAddon,      // der Code-Vorschlag
  test: { ok, output, error, verifierVerdict },
  status: 'vorgeschlagen' | 'genehmigt' | 'abgelehnt' | 'installiert' | 'zurückgerollt',
  lineage: string[],          // Vorgänger-Versionen (Archiv)
  createdAt, decidedAt, decidedBy, reason
}
```

### 4.3 Kurator (`src/lib/server/curator.ts`) — die Meta-Ebene
- `observe(companyId)` → findet Fähigkeits-Lücken aus Goals/Tasks/Feed/vorhandenen Add-ons
- `propose(gap)` → ruft `addonGen`, dann `verify` (getrennter Prüfer), erzeugt Proposal
- `verify(addon)` → Sandbox-Lauf + separater Prüfer-Prompt gegen das echte Output
- Respektiert Constitution-Budgets, skip-on-fail (Engine offline → keine Proposals)

### 4.4 Audit-Log (`data/audit.log`, append-only) — `src/lib/server/audit.ts`
Unveränderlich (append-only), global: wer/was/welche Policy/Ergebnis/Override/Zeit.
Jede Install/Deny/Rollback-Aktion schreibt hier rein.

### 4.5 Rollback + Not-Aus
- **Versionierung:** Install überschreibt nie, sondern legt neue Version an; alte
  bleibt im Proposal-Archiv → Ein-Klick-Rollback.
- **Not-Aus ("Detonation"):** globaler Schalter, der (a) alle selbst-installierten
  Add-ons deaktiviert und (b) den Loop stoppt. Ein Button im Cockpit + `settings`.

### 4.6 UI
- **Cockpit (`/firma`):** neue Sektion "Selbstentwicklung" — offene Vorschläge mit
  Code-Diff, Testergebnis, Risiko-Badge, **Allow / Deny**-Buttons, Historie.
- **Button "Firma weiterentwickeln"** → triggert eine Kurator-Runde.
- **Chat-Integration:** erkennt die KI im Gespräch eine Lücke, bietet sie an
  ("Soll ich mir dafür eine Erweiterung bauen?") → erzeugt Proposal statt
  Direkt-Install (nutzt den bestehenden `addon_erstellen`-Weg, aber über den Gate).

---

## 5. Sicherheits-Leitplanken (nicht verhandelbar)

1. **Nichts Ausführbares ohne Operator-Klick.** Approval-Gate hart-blockierend.
2. **Verifikation außerhalb KI-Reichweite.** Test-Runner + Audit-Log liegen in
   Modulen, die die KI nicht generieren/ändern kann. Gegen Objective-Hacking.
3. **Constitution ist read-only für die KI.** Nur Operator ändert Policy/Budgets.
4. **Kern nie selbst-modifizierbar.** Der Loop darf nur *Add-ons* erzeugen, nie
   `curator.ts`, `sandbox.ts`, `plugins.ts`, `audit.ts`, `constitution.json`.
5. **Sandbox-Ehrlichkeit:** `node:vm` ist **kein** vollständiger Security-Sandbox
   (steht so im Code-Kommentar). Für Self-Host beim Operator akzeptabel, weil nur
   *sein* Code läuft. **Vor Public-Release:** Ausführung generierten Codes in
   echte Isolation heben (Firecracker/Kata-microVM oder WASM/WASI deny-by-default).
   → als Blocker in `reference_astoris_security` vermerken.
6. **Defense-in-depth:** Egress-Whitelist + Timeout + Resource-Limit + SSRF-Schutz
   (großteils schon in `sandbox.ts`) gleichzeitig.
7. **Audit + Lineage** für jede Änderung, unveränderlich.

---

## 6. Phasenplan

**Phase 0 — Governance-Skelett (klein, sicher zuerst)**
`constitution.json`, `audit.ts`, `proposals.ts` (Store + Typen). Noch keine KI.
Cockpit zeigt (leere) Vorschlagsliste + Not-Aus. → verifizierbar, risikoarm.

**Phase 1 — Manueller Kurator (MVP)**
`curator.ts` mit `observe`+`propose`+`verify`. Button "Firma weiterentwickeln"
erzeugt 1 Vorschlag aus den Goals. Allow/Deny im Cockpit → Install über `plugins.ts`
+ Audit + Feed. Rollback-Button. **Das ist das erste vorführbare Gesamt-System.**

**Phase 2 — Lernschleife + Chat-Integration**
Ergebnis-Feedback (genutzt/Fehler/Metrik) fließt in Memory + Archiv. Chat schlägt
bei erkannten Lücken proaktiv Proposals vor. Abgelehnte Vorschläge als Negativ-Kontext.

**Phase 3 — Getaktete Autonomie (optional, opt-in)**
Timer-Runde mit hartem Tagesbudget, nur wenn Operator sie aktiviert. Immer noch
Allow/Deny pro Vorschlag. Autonomie-Level steuert, wie viel vorgeschlagen wird.

**Phase 4 — Härtung für Public**
microVM/WASM-Isolation, co-evolvierende Tests gegen Reward-Hacking, Held-out-Checks.

---

## 7. Empfehlung

Mit **Phase 0 + 1** starten — das ist in sich abgeschlossen, sicher (nichts läuft
ohne Klick), und liefert sofort das vollständige Erlebnis: "KI erkennt Lücke →
baut Erweiterung → ich genehmige → sie installiert sich". Erst nach deiner Freigabe
Code schreiben; Backup vorher.
