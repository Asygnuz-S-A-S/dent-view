#!/usr/bin/env bash
# Aplica los parches de dent-view (viewer/patches/*.patch) sobre el submódulo viewer/ohif.
# Idempotente: si un parche ya está aplicado lo salta. Al final verifica la cobertura del español.
#   viewer/scripts/aplicar-parches.sh            aplica los parches
#   viewer/scripts/aplicar-parches.sh --generar  regenera 0001-dent-view-es.patch desde los cambios actuales del submódulo
set -euo pipefail
VIEWER="$(cd "$(dirname "$0")/.." && pwd)"
OHIF="$VIEWER/ohif"
PARCHES="$VIEWER/patches"

if [[ "${1:-}" == "--generar" ]]; then
  # add -N para que los JSON nuevos (sin seguimiento) entren al diff; luego se deshace.
  nuevos=$(git -C "$OHIF" ls-files --others --exclude-standard)
  [[ -n "$nuevos" ]] && git -C "$OHIF" add -N $nuevos
  git -C "$OHIF" diff --binary > "$PARCHES/0001-dent-view-es.patch"
  [[ -n "$nuevos" ]] && git -C "$OHIF" reset -q -- $nuevos
  echo "Generado $PARCHES/0001-dent-view-es.patch ($(grep -c '^diff --git' "$PARCHES/0001-dent-view-es.patch") archivos)"
  exit 0
fi

for p in "$PARCHES"/*.patch; do
  nombre=$(basename "$p")
  if git -C "$OHIF" apply --check "$p" 2>/dev/null; then
    git -C "$OHIF" apply "$p"
    echo "Aplicado: $nombre"
  elif git -C "$OHIF" apply --reverse --check "$p" 2>/dev/null; then
    echo "Ya aplicado: $nombre"
  else
    echo "ERROR: $nombre no aplica sobre $(git -C "$OHIF" describe --tags --always). Reaplicar a mano con: git -C viewer/ohif apply --3way $p" >&2
    exit 1
  fi
done

node "$VIEWER/scripts/claves-faltantes.mjs" es
