# Operaciones de producción

Workflows: `.github/workflows/operaciones.yml` (diagnóstico, respaldo, reinicio de demo, respaldo diario) y `.github/workflows/salud.yml` (chequeo cada 15 min). Todo corre en GitHub Actions con la misma autenticación que `desplegar.yml` (Workload Identity Federation, rama `main`) y entra a la VM con `gcloud compute ssh`.

## Cómo pedir una operación

**A. Por archivo (camino normal).** Edita `infra/operaciones/pedido.json` (formato `{ "operacion", "confirmar", "parametros" }`), commit y push a `main`. Solo un cambio en ese archivo dispara el workflow. Los `pedido.ejemplo-*.json` se ignoran: cópialos sobre `pedido.json`.

| Operación | Pedido | Qué hace |
|---|---|---|
| `diagnostico` | `pedido.ejemplo-diagnostico.json` | Solo lectura: contenedores, imágenes, disco, volúmenes, 10 últimas migraciones, conteos (totales y por centro), 30 líneas de logs de web/worker/migrador (filtradas), si existen `CRON_SECRET` y `MIGRATE_DATABASE_URL` en la VM (true/false) y días de vigencia del certificado. |
| `respaldo` | `pedido.ejemplo-respaldo.json` | `pg_dump -Fc` de `dentview` y de la base de Orthanc + roles (`pg_dumpall --globals-only`) en `/opt/backups` (700), verificados con `pg_restore --list`, y snapshot del disco de arranque. |
| `reiniciar-demo` | `pedido.ejemplo-reiniciar-demo.json` | DESTRUCTIVO. Respaldo previo (aborta si falla el pg_dump), túnel SSH, `scripts/demo/index.ts --reset` con el dueño de la base. |

**B. Desde Actions.** Pestaña Actions > Operaciones > Run workflow: elige `operacion` y, para `reiniciar-demo`, escribe `REINICIAR-DEMO` en `confirmar`. Los parámetros (correo, nombre, hash) siempre se leen de `pedido.json` en `main`.

**Respaldo diario:** 06:30 UTC (01:30 Bogotá), operación `respaldo`.

## Reiniciar demo

1. Genera el hash de la clave localmente (nunca subas la clave): con el mismo algoritmo que usa better-auth (`hashPassword` de `better-auth/crypto`), por ejemplo desde `apps/web`:
   `npx tsx -e "import {hashPassword} from 'better-auth/crypto'; hashPassword(process.argv[1]).then(console.log)" 'LaClaveNueva'`
2. Copia `pedido.ejemplo-reiniciar-demo.json` a `pedido.json`, rellena `admin_correo`, `admin_nombre`, `admin_hash` (opcional `demo_clave`, 8-64 caracteres `A-Za-z0-9._!@#%+=-`), `confirmar` = `REINICIAR-DEMO`.
3. Push a `main`. El workflow enmascara hash y clave en el primer paso y valida todo con regex estrictas.
4. Después, vuelve `pedido.json` a `diagnostico`. Ojo: el hash queda en el historial de git (es un hash, no la clave, pero es crackeable sin conexión: usa una clave larga y cámbiala tras el primer ingreso).

Condiciones para que borre: commit en `main`, `confirmar` exacto y pg_dump previo exitoso. El snapshot NO es requisito (puede fallar por IAM sin bloquear). El resumen del job lista conteos antes/después y qué se ejecutó.

### Contrato del script de demo (`apps/web/scripts/demo/index.ts`)

Se ejecuta en el runner (`npx tsx scripts/demo/index.ts --reset`, cwd `apps/web`).
- Argumentos: `--reset` (borra y recarga), `--solo-datos` (sin borrar).
- Entorno: `DATABASE_URL` (dueño de la base, vía túnel a `127.0.0.1:15432`), `ORTHANC_URL=http://127.0.0.1:18042`, `S3_ENDPOINT=http://127.0.0.1:19000`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_ESTUDIOS`, `S3_BUCKET_ORTHANC`, `BETTER_AUTH_SECRET`, `CIFRADO_SECRETO` (puede venir vacío), `ADMIN_EMAIL`, `ADMIN_NOMBRE`, `ADMIN_HASH`, `DEMO_CLAVE` (opcional).
- Debe terminar con código distinto de 0 si falla y no imprimir ninguna de esas variables.

## Restaurar un dump

Los dumps están en `/opt/backups/dentview-AAAAMMDD-HHMMSS.dump`, `orthanc-...dump` y `globales-...sql`.

**En la misma VM (reemplaza la base; detén antes web, worker y orthanc):**

```bash
gcloud compute ssh dent-view --project=dent-view-asygnuz --zone=us-east1-b
cd /opt/dent-view/infra
D=/opt/backups/dentview-AAAAMMDD-HHMMSS.dump     # elige el archivo
sudo docker compose -f compose.yaml -f compose.produccion.yaml stop web worker orthanc
sudo docker exec dent-view-postgres-1 psql -U dentview -d postgres -c 'DROP DATABASE dentview WITH (FORCE)' -c 'CREATE DATABASE dentview OWNER dentview'
sudo docker exec -i dent-view-postgres-1 pg_restore -U dentview -d dentview --no-owner --role=dentview < "$D"
sudo docker exec -i dent-view-postgres-1 psql -U dentview -d dentview -f - < postgres/rol-app.sql   # permisos de dentview_app
sudo docker compose -f compose.yaml -f compose.produccion.yaml up -d
```
Para Orthanc repite con `orthanc` y su archivo (`DROP DATABASE orthanc ...`). Si el rol `dentview_app` no existe (VM nueva), primero `sudo docker exec -i dent-view-postgres-1 psql -U dentview -d postgres -f - < /opt/backups/globales-....sql`.

**Probar la restauración en local con Docker** (copia el dump con `gcloud compute scp dent-view:/opt/backups/dentview-....dump .` tras `sudo chmod` o un `cp` a tu carpeta en la VM):

```bash
docker run -d --name pg-prueba -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:17
sleep 5
docker exec pg-prueba psql -U postgres -c 'CREATE ROLE dentview SUPERUSER LOGIN' -c 'CREATE DATABASE dentview OWNER dentview'
docker exec -i pg-prueba pg_restore -U postgres -d dentview --no-owner < dentview-AAAAMMDD-HHMMSS.dump
docker exec pg-prueba psql -U postgres -d dentview -c 'select count(*) from "Organization"'
docker rm -f pg-prueba
```

## Retención y qué NO cubre

- pg_dump: últimos 14 de cada tipo (`dentview`, Orthanc, globales) en la VM. Snapshots: se borran los de más de 14 días con la etiqueta `origen=operaciones-gha`.
- Los dumps viven en el mismo disco que la base: protegen de errores lógicos, no de perder la VM. Para eso está el snapshot, que es del disco entero (y por ende incluye también los volúmenes de MinIO y Orthanc).
- NO hay copia aparte de los volúmenes de MinIO/Orthanc (imágenes DICOM y archivos): solo viajan dentro del snapshot del disco, que es de consistencia "crash" (no se detienen los contenedores). Tampoco hay copia fuera de GCP ni de `infra/.env` ni de `Caddyfile.produccion`.
- No hay restauración automatizada: es manual (arriba).

## IAM: permisos que podrían faltar para el snapshot

`github-deploy@dent-view-asygnuz.iam.gserviceaccount.com` necesita `compute.disks.createSnapshot`, `compute.disks.get`, `compute.snapshots.create`, `compute.snapshots.list`, `compute.snapshots.get`, `compute.snapshots.delete`, `compute.snapshots.setLabels`, `compute.instances.get`. Lo más simple es `roles/compute.storageAdmin`. Lo ejecuta una persona con permisos de IAM (no el workflow):

```bash
gcloud projects add-iam-policy-binding dent-view-asygnuz \
  --member=serviceAccount:github-deploy@dent-view-asygnuz.iam.gserviceaccount.com \
  --role=roles/compute.storageAdmin
```
Sin esto el paso de snapshot falla con un mensaje claro y el job termina en rojo, pero el pg_dump ya quedó hecho.

## Checklist de la primera ejecución

1. Conceder el rol de snapshots (arriba).
2. Dejar `pedido.json` en `diagnostico` y hacer push (o Run workflow): revisar que todo salga y que `CRON_SECRET`/`MIGRATE_DATABASE_URL` den `true`.
3. Pedir `respaldo`: revisar tamaños en el resumen, PASO en las dos partes, y que aparezca el snapshot en GCP.
4. Probar una restauración en local (arriba) con ese dump.
5. Recién entonces, `reiniciar-demo` (cuando exista `scripts/demo/index.ts` en `main`).
6. Revisar que el cron `salud.yml` corra (Actions > Salud) y que lleguen los correos de fallas (notificaciones de Actions activas).

## Notas de seguridad

- Ninguna entrada del pedido se interpola en comandos: pasan por variables de entorno y regex estrictas; los scripts remotos son `bash -s` con heredoc entre comillas.
- Los logs de web/worker del diagnóstico pasan por `filtrar-secretos.sh` (heurístico). Pueden contener datos personales (correos, nombres): si el repo es visible a terceros, los logs de Actions también lo son.
- `operaciones.yml` comparte el grupo de concurrencia `desplegar`: GitHub conserva un solo run pendiente por grupo, así que un pedido hecho mientras corre un despliegue y otro pendiente puede desplazar al pendiente. No hagas pedidos justo tras un push de código.
