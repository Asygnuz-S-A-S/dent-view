#!/usr/bin/env bash
# Filtro de stdin a stdout: enmascara lo que parezca credencial antes de que llegue al log de Actions.
# shortcut: heurístico (no garantiza nada); la regla real es no imprimir secretos en primer lugar.
sed -E \
  -e 's#([a-zA-Z][a-zA-Z0-9+.-]*://)[^/@[:space:]]+@#\1***@#g' \
  -e "s/((pass(word|wd)?|secret|token|key|authorization|bearer|cookie|hash)[A-Za-z_]*[=:\"' ]+)[^ \"',;]+/\1***/Ig" \
  -e 's/[0-9a-fA-F]{32,}/***/g' \
  -e 's#[A-Za-z0-9+/=]{40,}#***#g'
