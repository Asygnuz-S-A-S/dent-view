#!/bin/sh
# Primera inicialización del volumen: crea el rol de la app (sin superusuario) con su clave.
# Las tablas aún no existen: web vuelve a aplicar rol-app.sql después de migrar.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /etc/dentview/rol-app.sql
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v clave="$APP_DB_PASSWORD" <<'SQL'
ALTER ROLE dentview_app PASSWORD :'clave';
SQL
