# Conectores a sistemas de gestión de pacientes

Pestaña **Integraciones > Conectores** (solo administrador del centro). Sincroniza pacientes y citas desde un sistema externo hacia dent-view.

## Marco (`apps/web/src/lib/integraciones/`)

- `tipos.ts`: interfaz `Conector` (`clave`, `nombre`, `campos` de credenciales, `probarConexion`, `listarPacientes(desde)`, `listarCitas(desde)`, `publicarResultados` opcional).
- `registro.ts`: adaptadores disponibles (`simulado`, `dentalink`). Para agregar uno: implementar `Conector` y registrarlo aquí.
- **URLs base fijas** en cada adaptador (el usuario nunca escribe una URL), tiempo de espera de 15 s y 3 intentos con espera creciente (`http.ts`). De las respuestas paginadas solo se toma el cursor, nunca una URL: sin SSRF.
- **Credenciales cifradas** por centro (`Integracion.credencialesCifradas`, AES-256-GCM con `BETTER_AUTH_SECRET`; cambiar ese secreto invalida lo guardado). Nunca se devuelven al navegador: la UI solo muestra «Configuradas ✓».
- `sincronizar.ts`: `sincronizar(integracion, adaptador)` (adaptador inyectable para pruebas):
  - Trae pacientes y citas desde `ultimaSync` (la fecha se guarda al terminar con la hora de inicio de la corrida).
  - Pacientes: se crean con `crearPacienteEnCentro`; si el paciente **ya existía en el centro**, solo se vincula (`VinculoExterno` de entidad `paciente_existente`) **sin tocar su contacto** y se cuenta en `vinculadosSinCambios` (a ese correo llegan el enlace y el código de resultados: un sistema externo no puede cambiarlo). Solo los pacientes **creados por la propia integración** (entidad `paciente`) se completan en sincronizaciones posteriores, y solo en campos vacíos (fecha de nacimiento, celular, correo, dirección). Nunca se pisa el nombre ni nada que ya tenga valor.
  - Citas: se crean una vez por id externo para pacientes ya vinculados, siempre en una única sala «Importada» por centro (se crea si falta; nunca se crean salas a partir de datos externos). El sillón externo queda solo en `notas` (limpio, sin saltos de línea, máx. 80 caracteres). Las citas importadas **no pasan por la validación de cruce de agenda**. Una cita ya vinculada no se vuelve a tocar.
  - `VinculoExterno` guarda la equivalencia (idempotente: repetir la corrida no duplica).
  - Registra `Evento` `integracion.sync` con conteos; marca `estadoSync` OK/ERROR y `errorSync` solo con mensajes controlados (sin credenciales ni datos clínicos).
  - Lo que devuelve el adaptador se normaliza (`normalizar.ts`); lo inválido se omite y se cuenta.
- Worker: `apps/worker/src/sync-integraciones.ts` exporta `iniciarSyncIntegraciones()` (cada 15 min, `SYNC_INTEGRACIONES_MS`). Ya conectada en `apps/worker/src/index.ts`; el `Dockerfile` del worker copia `apps/web/src/lib/integraciones`, `cifrado.ts` y `pacientes-centro.ts`.

## Adaptadores

### Simulado (pruebas)
Clínica falsa en memoria (3 pacientes, 3 citas). Código `fallar` simula un rechazo de credenciales. Sirve para probar el flujo completo. Datos: `npx tsx scripts/seed-conectores.ts`.

### Dentalink (HealthAtom) — NO probado contra una cuenta real
Implementado solo con lo confirmado en la documentación oficial, https://api.dentalink.healthatom.com/docs/ (consultada el 2026-11-20):

Confirmado:
- Base `https://api.dentalink.healthatom.com/api/v1`, HTTPS obligatorio.
- Autenticación: cabecera `Authorization: Token <access_token>`; el administrador lo genera en *Administrador > Configuración API > Agregar cliente > Ver Token > Generar*.
- `GET /pacientes` (campos: `id`, `rut`, `nombre`, `apellidos`, `fecha_nacimiento` con `0000-00-00` = vacío, `celular`, `telefono`, `email`, `direccion`, …) y `GET /citas` (`id`, `id_paciente`, `fecha`, `hora_inicio`, `hora_fin`, `estado_anulacion`, `estado_confirmacion`, `nombre_sillon`, `fecha_actualizacion`, …).
- Paginación por cursor (`links.next` con `?cursor=`), filtro `q={"columna":{"gte":"…"}}`, orden `sort=`.
- Existen `POST /pacientes`, `PUT /pacientes/{id}`, `POST /citas/`, `PUT /citas/{id}` (no usados: la sincronización es de lectura).

Sin confirmar (TODO en `dentalink.ts`):
- Significado del entero `tipo_documento`: se asume cédula (CC).
- Zona horaria de `fecha`/`hora_inicio`: se asume Colombia (-05:00).
- No hay filtro documentado por fecha de modificación para pacientes: se lee el listado completo en cada corrida (idempotente por vínculos).
- Filtrar citas por `fecha_actualizacion` con `q` no tiene ejemplo en la documentación (se usa con 24 h de margen); si el filtro fuera rechazado, la sincronización de citas fallaría con el error del proveedor.
- Límites de peticiones: la documentación dice que son por clínica y se comparten entre integraciones; ante 429 se reintenta con espera creciente.
- Sin `publicarResultados` (no hay endpoint documentado para adjuntar resultados).
- Webhooks propios de Dentalink: no se encontraron en la documentación consultada.

## Webhook de entrada

`POST /api/integraciones/entrada/{integracionId}`: el proveedor (o un intermediario) avisa de un cambio. Formato propio de dent-view:

```json
{ "id": "evento-único", "tipo": "paciente", "datos": { "idExterno": "…", "tipoDocumento": "CC", "numeroDocumento": "…", "nombre": "…", "fechaNacimiento": "1990-04-12", "celular": "…", "correo": "…", "direccion": "…" } }
```
`tipo: "cita"` usa `idExterno`, `idPacienteExterno`, `inicio`, `fin` (ISO), `estado` (`PROGRAMADA|CONFIRMADA|CANCELADA`), `sala`.

Seguridad:
- Cabeceras `x-dentview-timestamp` (segundos Unix) y `x-dentview-signature: sha256=<hex>` = HMAC-SHA256 con el secreto de la integración sobre `"<timestamp>.<cuerpo>"`.
- Tolerancia de 5 minutos; comparación en tiempo constante; cuerpo máximo 256 KB (413).
- Idempotencia por `id` de evento (se reclama con un `VinculoExterno` de entidad `evento`): un reenvío responde 200 `duplicado`. Si el procesamiento falla se libera el id para reintentar.
- Firma inválida, vencida, integración inexistente, inactiva o sin secreto: la misma respuesta 401.
- El secreto (`whsec_…`) se muestra una sola vez al crear o al rotar; en la BD queda **cifrado** en `secretoEntrada` (aunque el esquema lo describa como hash, hace falta en claro para verificar el HMAC).
- Aplica el mismo upsert que la sincronización (solo completa vacíos de pacientes creados por la integración).
