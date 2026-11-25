#!/usr/bin/env bash
# Uso: dias-certificado.sh HOST  -> imprime los días que le quedan al certificado TLS (entero; negativo = vencido).
set -euo pipefail
host=$1
fin=$(echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
echo $(( ($(date -d "$fin" +%s) - $(date +%s)) / 86400 ))
