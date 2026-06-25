#!/usr/bin/env bash
# Astoris — Setup. Installiert Abhängigkeiten und richtet HTTPS sicher ein.
# Selbsterklärend & idempotent. Aufruf:  bash setup.sh
set -uo pipefail
cd "$(dirname "$0")"

B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; D=$'\e[2m'; N=$'\e[0m'
ok(){ echo "${G}✓${N} $1"; }
warn(){ echo "${Y}!${N} $1"; }
err(){ echo "${R}✗${N} $1"; }
hr(){ echo "${D}────────────────────────────────────────${N}"; }

echo "${B}Astoris — Setup${N}"
hr

# 1) Voraussetzungen
if ! command -v node >/dev/null 2>&1; then
  err "Node.js fehlt. Bitte Node 20+ installieren: https://nodejs.org"; exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then err "Node 20+ nötig (gefunden: $(node -v))."; exit 1; fi
ok "Node $(node -v)"

if command -v pnpm >/dev/null 2>&1; then PKG=pnpm
elif command -v npm >/dev/null 2>&1; then PKG=npm
else err "Weder pnpm noch npm gefunden."; exit 1; fi
ok "Paketmanager: $PKG"

# 2) Abhängigkeiten
echo; echo "${B}Installiere Abhängigkeiten …${N}"
$PKG install || { err "Installation fehlgeschlagen."; exit 1; }
ok "Abhängigkeiten installiert"

# 3) .env
if [ ! -f .env ]; then
  [ -f .env.example ] && cp .env.example .env && ok ".env aus Vorlage erstellt" || touch .env
else
  ok ".env vorhanden"
fi

# 4) HTTPS
echo; echo "${B}HTTPS einrichten${N}  ${D}(Verschlüsselung + Mikrofon brauchen HTTPS)${N}"
echo "  1) Tailscale-Zertifikat   ${D}(empfohlen, wenn Tailscale läuft — gültiges Zertifikat, keine Warnung)${N}"
echo "  2) Selbstsigniert         ${D}(lokales Testen; Browser zeigt einmalig eine Warnung)${N}"
echo "  3) Eigenes Zertifikat / Reverse-Proxy   ${D}(TLS übernimmt z. B. Caddy/nginx davor)${N}"
echo "  4) Überspringen           ${D}(nur http://localhost — kein Fernzugriff mit Krypto)${N}"
printf "Auswahl [1-4]: "; read -r CHOICE

mkdir -p certs
case "${CHOICE:-1}" in
  1)
    if ! command -v tailscale >/dev/null 2>&1; then
      err "Tailscale nicht gefunden. Installiere es (https://tailscale.com/download) oder wähle eine andere Option."
    else
      HOST=$(tailscale status --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write((j.Self&&j.Self.DNSName||"").replace(/\.$/,""))}catch{}})')
      if [ -z "$HOST" ]; then err "Tailscale-Hostname nicht ermittelbar (ist Tailscale aktiv?)."; else
        echo "Erzeuge Zertifikat für ${B}$HOST${N} …"
        if tailscale cert --cert-file certs/cert.pem --key-file certs/key.pem "$HOST" 2>/dev/null; then
          chmod 600 certs/key.pem; chmod 644 certs/cert.pem
          ok "Tailscale-Zertifikat erstellt → certs/"
        else
          err "tailscale cert fehlgeschlagen. In der Tailscale-Admin-Konsole 'HTTPS Certificates' aktivieren und erneut versuchen."
        fi
      fi
    fi
    ;;
  2)
    if command -v openssl >/dev/null 2>&1; then
      openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
        -keyout certs/key.pem -out certs/cert.pem -subj "/CN=localhost" >/dev/null 2>&1
      chmod 600 certs/key.pem; chmod 644 certs/cert.pem
      ok "Selbstsigniertes Zertifikat erstellt → certs/"
    else
      err "openssl fehlt."
    fi
    ;;
  3) warn "Kein Zertifikat erzeugt. Stelle einen Reverse-Proxy (Caddy/nginx) mit TLS vor Astoris."; ;;
  4) warn "HTTPS übersprungen. Krypto/Mikrofon nur über http://localhost verfügbar."; ;;
  *) warn "Ungültige Auswahl — übersprungen."; ;;
esac

# 5) Firewall-Hinweis
echo; hr
if command -v ufw >/dev/null 2>&1 && sudo -n ufw status >/dev/null 2>&1; then
  warn "Firewall (ufw) aktiv. Für Tailscale-only-Zugriff auf Port 5180:"
  echo "    sudo ufw allow in on tailscale0 to any port 5180 proto tcp"
fi

# 6) Abschluss
echo; ok "${B}Fertig.${N}"
echo
echo "${B}Starten:${N}"
echo "  Entwicklung:  $PKG run dev -- --port 5180"
echo "  Produktion:   $PKG run build && node build   ${D}(adapter-node)${N}"
echo
echo "Beim ersten Aufruf richtest du im Browser deinen Zugang ein"
echo "(Benutzername + Passwort, oder Anmeldung per Tailscale)."
echo "Zugangsdaten & Schlüssel liegen verschlüsselt unter ./data (chmod 700, nie in Git)."
