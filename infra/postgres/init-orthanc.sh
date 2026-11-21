#!/bin/sh
# Se ejecuta solo en la primera inicialización del volumen de Postgres.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ${ORTHANC_DB}"
