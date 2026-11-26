# dent-view

SaaS multitenant de estudios odontológicos con visor incluido (nombre de trabajo). Arquitectura completa: `../Arquitectura-Radia-SaaS-2026-11-18.md`.

## Fase F0 — contrato entre piezas

Todo corre con `docker compose -f infra/compose.yaml up` y se abre en **http://localhost:8080** (un solo origen, para que la cookie de sesión sirva al visor).

| Ruta (Caddy) | Destino | Notas |
|---|---|---|
| `/visor/*` | contenedor `visor` (OHIF v3.13.14 compilado con `PUBLIC_URL=/visor/`) | estático |
| `/dicom-web/*` | `orthanc:8042/dicom-web/*` | **antes** pasa por `forward_auth` → `web:3000/api/visor/autorizar` |
| todo lo demás | `web:3000` (Next.js) | |

- **Orthanc** nunca se publica en 0.0.0.0. Plugins: índice PostgreSQL (BD `orthanc`), almacenamiento S3 (MinIO, bucket `S3_BUCKET_ORTHANC`) y DICOMweb. Sin autenticación propia: solo es accesible por la red interna y a través de Caddy.
- **Autorización del visor** (`GET /api/visor/autorizar`, en `web`): lee la sesión de Better Auth desde la cookie; toma la URI original de `X-Forwarded-Uri` y el método de `X-Forwarded-Method`; extrae el `StudyInstanceUID` del path (`/dicom-web/studies/{uid}/…`) o de la query (`StudyInstanceUID=`). Responde 200 solo si el usuario puede ver ese estudio; 401 sin sesión; 403 en cualquier otro caso (incluye peticiones sin UID y todo método distinto de GET/HEAD).
- **Regla de acceso F0:** los miembros del tenant con rol `admin_tenant`, `recepcion` o `especialista` ven todos los estudios de su tenant; `doctor_remitente` ve solo los estudios donde `Estudio.doctorRemitenteId` es él.
- **Base de datos:** el esquema Prisma vive en `packages/db/prisma/schema/` (multiarchivo). `dominio.prisma` = modelos de negocio; `auth.prisma` = modelos de Better Auth con las relaciones inversas. El paquete exporta el cliente como `@dent-view/db`.
- **Worker** (`apps/worker`): sondea `GET {ORTHANC_URL}/changes?since=N` buscando `StableStudy`. Hace upsert de `Estudio` en el tenant `INGESTA_TENANT_SLUG` y asocia `Persona`/`PacienteTenant` por `PatientID` (cédula). Si el estudio trae un escaneo facial Carestream, extrae la malla PLY y la sube a `S3_BUCKET_ESTUDIOS` en `tenants/{organizationId}/superficies/{studyInstanceUid}.ply`, y guarda la clave en `Estudio.superficieKey`.
- **Muestras:** los `.dcm` no entran al repositorio. El script de carga lee `MUESTRAS_DIR` (por defecto `../Radia`).

Variables: ver `infra/.env.example`.

## Cómo correr F0

```sh
git submodule update --init --depth 1 viewer/ohif      # OHIF v3.13.14
cp infra/.env.example infra/.env                       # y ajustar secretos
docker compose -f infra/compose.yaml --env-file infra/.env up -d --build
# Cargar las muestras (los .dcm se montan de solo lectura; nunca entran al repo ni a las imágenes):
docker compose -f infra/compose.yaml --env-file infra/.env run --rm \
  -v $MUESTRAS_DIR:/muestras:ro -e MUESTRAS_DIR=/muestras \
  worker node src/cargar-muestras.ts
# Usuarios y centros de demo (Postgres no se publica: túnel temporal solo en localhost):
npm install
docker run -d --name dvtun --network dent-view_default -p 127.0.0.1:55434:5432 \
  alpine/socat TCP-LISTEN:5432,fork,reuseaddr TCP:postgres:5432
set -a; . infra/.env; set +a
DATABASE_URL="postgresql://dentview:${POSTGRES_PASSWORD}@127.0.0.1:55434/dentview" npm run seed -w @dent-view/web
docker rm -f dvtun
```

Abrir **http://localhost:8080** (contraseña de demo: `dentview-demo-2026`):

| Usuario | Centro y rol | Qué ve |
|---|---|---|
| `admin@radex.demo` | Radex (demo), admin | Todos los estudios de Radex |
| `admin@radex2.demo` | Radex 2 (demo), admin | Solo lo de Radex 2 |
| `doctor@pepito.demo` | Ambos, doctor remitente | Solo los estudios que le asignaron |

En F0 la asignación de un estudio a un doctor se hace en la base (`Estudio.doctorRemitenteId`); la pantalla de asignación llega en F2.

Pruebas del worker: `MUESTRAS_DIR=$MUESTRAS_DIR npm test -w @dent-view/worker`.

## Seguridad del despliegue (TLS, correo, MFA, base de datos)

**Local.** `docker compose ... up -d` publica, solo en 127.0.0.1:
- `http://localhost:8080`: HTTP para pruebas y E2E.
- `https://localhost:8443`: HTTPS con la CA interna de Caddy (`tls internal`). Para que el navegador confíe: `docker compose -f infra/compose.yaml --env-file infra/.env cp caddy:/data/caddy/pki/authorities/local/root.crt /tmp/caddy-local.crt` e importarlo como raíz de confianza (o usar `curl -k`). Sin HSTS en local: en `localhost` obligaría también al 8080.
- `http://127.0.0.1:8025`: Mailpit, buzón que captura todo el correo saliente (SMTP interno `mailpit:1025`).

`BETTER_AUTH_URL` es el origen canónico (enlaces de los correos); si es `https://`, las cookies de sesión salen `__Secure-…; Secure` (Chrome y curl las aceptan también en `http://localhost`). Otros orígenes válidos van en `BETTER_AUTH_TRUSTED_ORIGINS` (coma).

**Correo.** Con `SMTP_HOST` configurado: las cuentas que crea un admin (usuarios, doctores, admin de un centro nuevo) reciben un enlace de un solo uso (24 h) para fijar su contraseña; nadie más conoce la clave y, al usar el enlace, el correo queda verificado (requisito para aceptar invitaciones de otros centros). "¿Olvidaste tu contraseña?" (`/recuperar`) usa el mismo flujo y responde igual exista o no el correo. Sin SMTP (respaldo) se muestra una clave temporal una vez al admin.

**MFA (TOTP).** Cada usuario la activa en `/perfil` (QR, primer código y códigos de respaldo que se muestran una sola vez) y la desactiva con su contraseña. Es **obligatoria** para `admin_tenant` y superadmin: hasta activarla solo pueden estar en `/perfil` (una suplantación no la exige). En el ingreso se pide el código en `/ingresar/2fa` (o un código de respaldo).

*MFA en E2E:* `auth.setup.ts` activa el MFA de los usuarios demo la primera vez y guarda cada secreto en `apps/web/tests/e2e/.auth/totp-<rol>.txt` (gitignored, 0600); después genera el código con él. Si se pierde ese archivo, desactiva el MFA de ese usuario en la base de pruebas y vuelve a correr:
`DELETE FROM "TwoFactor" WHERE "userId" = (SELECT id FROM "User" WHERE email = 'admin@radex.demo'); UPDATE "User" SET "twoFactorEnabled" = false WHERE email = 'admin@radex.demo';`

**Base de datos sin superusuario.** La app (web y worker) se conecta como `dentview_app` (`DATABASE_URL`): solo SELECT/INSERT/UPDATE/DELETE, sin DDL, y sin UPDATE/DELETE en `"Evento"` (bitácora inmutable). Solo `prisma migrate deploy` usa el dueño (`MIGRATE_DATABASE_URL`) y lo corre el servicio `migrador` de compose (mismo build que web, un solo uso: migra y vuelve a aplicar `infra/postgres/rol-app.sql`); `web` espera a que termine (`service_completed_successfully`) y NO recibe `MIGRATE_DATABASE_URL`, `POSTGRES_PASSWORD` ni `APP_DB_PASSWORD`: su `environment` es una lista explícita con solo lo que la app lee (si añades una variable nueva al código, agrégala ahí). Verificación: `docker exec dent-view-web-1 env | grep -c MIGRATE` debe dar 0. Las tablas de historia clínica y consentimientos (`EvolucionClinica`, `NotaClinica`, `Autorizacion`, `OdontogramaHistorial`, etc.) son solo-inserción para `dentview_app`. Volumen nuevo: el rol se crea solo (`init-rol-app.sh`, clave `APP_DB_PASSWORD`). Instalación existente:

```sh
set -a; . infra/.env; set +a
docker compose -f infra/compose.yaml --env-file infra/.env exec -T postgres psql -U dentview -d dentview -f - < infra/postgres/rol-app.sql
echo "ALTER ROLE dentview_app PASSWORD :'clave';" | docker compose -f infra/compose.yaml --env-file infra/.env exec -T postgres psql -U dentview -d dentview -v clave="$APP_DB_PASSWORD" -f -
# luego DATABASE_URL=dentview_app y MIGRATE_DATABASE_URL=dentview en infra/.env, y recrear migrador, web y worker
```

**Paso a producción.**
1. DNS del dominio hacia el servidor; publicar 80 y 443 en `caddy` (en vez de 127.0.0.1:8080/8443) y montar `infra/Caddyfile.produccion` como `/etc/caddy/Caddyfile` (junto a `Caddyfile.rutas`), con el dominio y correo reales: TLS automático, redirección HTTP→HTTPS y HSTS.
2. `BETTER_AUTH_URL=https://<dominio>`, `BETTER_AUTH_TRUSTED_ORIGINS` vacío, secretos nuevos (`BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, MinIO).
3. SMTP real (`SMTP_HOST`, `SMTP_PORT` 465/587, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` de un dominio con SPF/DKIM) y quitar `mailpit`.
4. Activar el MFA de cada admin en su primer ingreso (lo exige la app).
5. Despliegue automático (`.github/workflows/desplegar.yml`): el job `verificar` (tipos y pruebas unitarias sin base de datos) debe pasar antes de `desplegar`. La app nueva se extrae en `/opt/dent-view.nuevo`, se copian `infra/.env` e `infra/Caddyfile.produccion` desde `/opt/dent-view` (conservando `CRON_SECRET`) y se reemplaza el directorio con dos `mv` (`/opt/dent-view.anterior` se borra al terminar bien; si algo falla queda para recuperarlo a mano). Los volúmenes no dependen del directorio porque `compose.yaml` fija `name: dent-view`. Los cambios de compose, Dockerfile o workflow solo se prueban de verdad en el primer despliegue: vigílalo.
6. Límites de subida (Caddy y app): imágenes del personal hasta 25 MB por archivo, 20 archivos y 150 MB por subida; foto del paciente 6 MB; ingesta DICOM/ZIP 2200 MB (en streaming, sin cargarla en memoria). Imágenes con más de 50 megapíxeles o 12000 px por lado se rechazan.

### Secreto de cifrado en reposo (`CIFRADO_SECRETO`)

Las credenciales de conectores y los secretos de webhooks se cifran (AES-256-GCM) con `CIFRADO_SECRETO`; si no está definido se usa `BETTER_AUTH_SECRET`, así que los despliegues existentes siguen funcionando. Conviene definirlo con un valor propio (≥ 32 caracteres aleatorios) para separar la clave de cifrado de la de sesiones. Cambiarlo cuando ya hay datos cifrados los invalida: hay que volver a guardar las credenciales de los conectores y recrear los webhooks. Web y worker deben recibir el mismo valor. El worker corre sin root y solo recibe las variables que usa (no recibe `MIGRATE_DATABASE_URL` ni `POSTGRES_PASSWORD`).

## Entrega de resultados y visor (flujo core)

**Entrega por enlace + código.** Desde un informe emitido (o un estudio publicado) el personal usa "Entregar resultados": se crea un `EnlaceEntrega` (token de 256 bits y código de 6 dígitos; solo se guardan hashes) y se encolan dos correos separados (enlace y código). Si no hay correo, el personal ve ambos una sola vez para entregarlos en persona. El paciente entra a `/resultados/<token>`, escribe el código (5 intentos por enlace, 20 por IP cada 10 min; mismo mensaje para token inexistente, vencido o revocado) y recibe una cookie `dv_resultados` (httpOnly, Secure en producción, SameSite=Lax, firmada con `BETTER_AUTH_SECRET`, 2 h máximo y nunca más allá del vencimiento). Desde ahí descarga el PDF, abre el visor o comparte con su doctor (otro enlace con su propio código). El personal ve los enlaces en el informe y en la ficha del paciente (pestaña "Entrega de resultados") y puede revocarlos. Todo acceso público queda en la bitácora (`acceso.resultados`). Demo: `BETTER_AUTH_SECRET=<el del servidor> npx tsx apps/web/scripts/seed-entrega.ts`.

**Visor con enlace.** `/api/visor/autorizar` acepta, sin sesión, la cookie de resultados vigente: solo GET/HEAD y solo los `StudyInstanceUID` de ese enlace (vencido o revocado: 401; otro UID o método: 403). La decisión es la función pura `decidirAccesoVisor` (`apps/web/src/lib/acceso.ts`).

**Configuración de OHIF 3.13 (`viewer/config/dent-view.js`, sin recompilar).**
- Configurado: `investigationalUseDialog: { option: 'never' }`; logo/nombre "dent-view" con enlace "Volver" mediante `whiteLabeling.createLogoComponentFn` (vuelve a la página de origen según `document.referrer`: `/estudios`, `/informes/…` o `/resultados/<token>`; por defecto `/estudios`); idioma español por defecto con `defaultLanguage: 'es'` (parche `viewer/patches/0001-dent-view-es.patch`; quien elige otro idioma en Preferencias lo conserva; también acepta `?lng=es`).
- Requiere tocar el fork (`viewer/ohif`): ocultar o renombrar otros textos "OHIF" (menú Acerca de, título de la pestaña), cambiar el favicon y traducir cadenas que falten en el locale `es`.

## RIPS desde la orden (Documento Técnico 1 v003)

La orden es el eje: desde `/ordenes/[id]` hay pestañas *Resumen*, *Servicios y precio*, *RIPS* (solo si `ConfigFacturacion.generaRips`), *Estudios y documentos*, *Factura* y *Evolución*. Con `generaRips = false` (valor por defecto) la pestaña RIPS no existe y nada se exige.

- Generador y validador puros: `apps/web/src/lib/rips/generar.ts` (`generarRips(entrada) -> { json, errores, advertencias }`). Los errores impiden generar; las advertencias no. Lo que no se conoce va como `null`/`0`: no se inventan valores de tablas SISPRO.
- `GET /api/rips/[ordenId]` (roles admin, recepción, especialista) genera, guarda el JSON en S3 como `EnvioRips` (estado `VALIDADO_LOCAL`, SHA-256, versión `DT1-v003`), audita `rips.generado` y descarga `RIPS-<n.º orden>.json`. Con errores responde 422.
- **Validado localmente NO es lo mismo que aprobado por el Ministerio (CUV).** El archivo debe cargarse en el validador oficial o en el proveedor tecnológico del centro.
- Catálogos embebidos y versionados: `apps/web/src/lib/catalogos/cups.json` y `cie10.json` (parciales, odontología) y `referencias-rips.ts` (tablas pequeñas marcadas `TODO verificar contra tablas SISPRO`). Para actualizarlos basta reemplazar el JSON (mismo formato) y subir `version`. Deben validarse contra las tablas oficiales SISPRO.
- El sistema no guarda el documento del profesional que atiende: se envía `null` con aviso.
