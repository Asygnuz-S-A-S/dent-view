# Remisiones entre centros

Un centro origen (p. ej. Lumia) remite a un paciente a un centro destino (p. ej. Radia). El destino recibe, crea **su** orden, toma el estudio y devuelve estudio + informe emitido. El origen ve lo devuelto a través de la remisión. Módulo `remisiones`, habilitado en los cuatro tipos de centro.

## Principios

- **Sin RLS:** todo el aislamiento es por código. Toda consulta a `prisma.remision` filtra por `origenId` o `destinoId` = centro activo.
- **Copia mínima:** el destino crea su propio paciente con nombre y documento (siempre) y, solo si el paciente lo autoriza, fecha de nacimiento, celular y embarazo. Nunca correo, dirección, alertas, notas, foto ni RIPS, ni la ficha o el evolutivo del origen. `copiaMinima()` (`lib/remisiones.ts`) es la única vía.
- **Consentimiento explícito (Ley 1581):** el origen marca el alcance y confirma que el paciente autorizó. Queda una `Autorizacion` (tipo DATOS, texto + alcance + versión `2026-11`) y el texto/versión/alcance en la propia `Remision`. Sin la casilla el servidor rechaza (`autorizado: true` literal).
- **Proyección por lado:** `SELECT_DESTINO` no incluye `pacienteOrigenId`, `autorizacionId`, `creadoPorId` ni `consentimientoPorId`; `SELECT_ORIGEN` no incluye `pacienteDestinoId` ni `ordenDestinoId`. Las pantallas usan siempre la proyección de su lado.
- **Correos sin datos del paciente:** `VINCULO_SOLICITADO`, `REMISION_RECIBIDA` y `REMISION_RESPONDIDA` llevan solo `{{centro}}` y `{{enlace}}`.

## Modelo (`schema/remisiones.prisma`, migración `20261126000006_remisiones`)

| Modelo | Notas |
|---|---|
| `VinculoCentro` | Dirigido: `solicitanteId` -> `receptorId`; único por par. Estados PENDIENTE, ACTIVO, RECHAZADO, REVOCADO. Solo el solicitante puede remitir al receptor; para el sentido contrario hace falta otro vínculo. |
| `Remision` | Estados ENVIADA, RECIBIDA, EN_PROCESO, DEVUELTA, RECHAZADA, CANCELADA. `ordenDestinoId` único (una orden por remisión). FKs `Restrict`. `autorizacionId` sin FK. |
| `RemisionEvento` | Historial por remisión (tipo = estado). Solo inserción: `rol-app.sql` le revoca UPDATE/DELETE a la app. |

## Flujo y transiciones (`transicionRemision`)

| De | A | Quién |
|---|---|---|
| ENVIADA | RECIBIDA | destino (crea o reutiliza el paciente sin sobrescribir) |
| ENVIADA, RECIBIDA | RECHAZADA | destino (motivo obligatorio) |
| ENVIADA, RECIBIDA | CANCELADA | origen |
| RECIBIDA | EN_PROCESO | destino, al crear la orden (`/ordenes/nueva?paciente=...&remision=...`) |
| EN_PROCESO | DEVUELTA | destino (exige informe EMITIDO vigente de la orden; guarda `informeId`, `estudioUids` PUBLICADOS) |
| DEVUELTA | DEVUELTA | destino (re-devolver) |

Cada transición es `updateMany({ id, <lado>Id: centro, estado: de })`; `count != 1` es error (carreras seguras). `crearOrden` reclama la remisión (RECIBIDA -> EN_PROCESO, `ordenDestinoId: null`, mismo paciente) antes de crear la orden y la revierte a RECIBIDA si falla.

## Roles

- Vínculos (solicitar, responder, revocar): `admin_tenant`.
- Crear remisión y devolver: clínicos (admin, recepción, especialista). Cancelar, recibir y rechazar: gestión (admin, recepción).
- El doctor remitente no ve remisiones (404).

## Acceso del origen a lo devuelto

- Informe: `GET /api/remisiones/[id]/informe` (remisión DEVUELTA del centro origen; entrega la versión vigente emitida del informe en el destino; `Cache-Control: private, no-store`; auditado con `registrarAcceso`). Cualquier otro caso es 404.
- Visor: `decidirAccesoVisor` acepta `remitido` (solo GET/HEAD, con uid y sesión). `api/visor/autorizar` lo calcula solo si no aplica la regla normal: remisión DEVUELTA del destino dueño del estudio, `estudioUids` incluye el uid y el usuario es miembro clínico del origen. **No** se habilita descarga DICOM, captura ni superficie para el origen.

## Pantallas

`/remisiones` (Enviadas / Recibidas, filtro por estado, contadores), `/remisiones/nueva?paciente=`, `/remisiones/[id]`, `/remisiones/vinculos` (admin). Botón "Remitir a otro centro" en la ficha del paciente (clínicos); insignia "Remisión de {origen}" en la orden del destino.

## Pendientes / límites conocidos

- Revocar un vínculo no cancela las remisiones ya en curso: siguen su camino.
- Re-devolver no reenvía el correo (clave única `remision-{id}-{estado}-{userId}`).
- La revocación del consentimiento por parte del paciente es manual (escribir al centro origen); no hay flujo automático.
