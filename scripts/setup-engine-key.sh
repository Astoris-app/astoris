#!/usr/bin/env bash
# Überträgt den API_KEY der Engine (agent-v2) sicher nach astoris/.env.
# Der Schlüsselwert wird NIE ausgegeben.
set -euo pipefail
SRC="$HOME/agent-v2/.env"
DST="$HOME/astoris/.env"

[ -f "$SRC" ] || { echo "X  $SRC nicht gefunden"; exit 1; }

KEY=$(grep -m1 -E '^API_KEY=' "$SRC" | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//')
[ -n "${KEY:-}" ] || { echo "X  API_KEY in agent-v2/.env nicht gefunden oder leer"; exit 1; }

touch "$DST"
chmod 600 "$DST"
if grep -q '^ENGINE_API_KEY=' "$DST"; then
  # vorhandenen Wert ersetzen (ohne sed-Sonderzeichen-Probleme)
  grep -v '^ENGINE_API_KEY=' "$DST" > "$DST.tmp" && mv "$DST.tmp" "$DST"
fi
printf 'ENGINE_API_KEY=%s\n' "$KEY" >> "$DST"
grep -q '^ENGINE_URL=' "$DST" || printf 'ENGINE_URL=%s\n' 'http://localhost:8081' >> "$DST"
chmod 600 "$DST"
echo "OK  ENGINE_API_KEY in astoris/.env gesetzt (Wert nicht angezeigt)."
