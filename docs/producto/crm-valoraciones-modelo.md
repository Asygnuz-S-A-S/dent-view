# Modelo de datos: valoración virtual y CRM

Esquema: `packages/db/prisma/schema/valoraciones.prisma` y `crm.prisma`. Migración: `20261123000000_valoracion_virtual_crm`. Todo acotado por `organizationId`.

## Valoración virtual
- `Valoracion` (solicitante en snapshot: nombre/teléfono/correo/ciudad; `pacienteId` y `leadId` opcionales), `ValoracionMedia` (fotos/video por `AnguloMedia`, solo claves S3, nunca URL pública), `ValoracionMensaje` (chat; el profesional puede pedir un ángulo con `solicitaMedia`).
- Estados: BORRADOR, PENDIENTE_PACIENTE (enlace enviado), RECIBIDA (paciente subió), EN_REVISION, REQUIERE_MAS_INFO, COMPLETADA, CANCELADA, EXPIRADA (`expiraEn`).
- El token del enlace público **se guarda solo hasheado** (`tokenHash` único, sha256); el código de 6 dígitos como HMAC (`codigoHash`, como `lib/entrega.ts`) con `intentosCodigo` para bloqueo. Consentimiento explícito (`consentimientoEn/Version/Ip`, IP truncada o hash). El cuestionario no lleva diagnósticos.

## CRM
- `Lead` con `EtapaLead`, `origen` (texto: WEB, REFERIDO, REDES, LLAMADA, WHATSAPP, DOCTOR, VALORACION_VIRTUAL, OTRO), `noContactar` y `consentimientoMercadeo` propios del lead. `ActividadLead` es la línea de tiempo (de un lead o de un paciente). `TareaCRM` son pendientes manuales o automáticos.
- Pacientes: **no se duplica** consentimiento ni "no contactar": se usan `Autorizacion` (finalidad `MERCADEO`) y `PreferenciaContacto.noContactar`. `PacienteTenant` solo gana `ultimaVisitaEn` y `proximoControlEn`. `ConfigFidelizacion` (una por centro, `activa` apagada por defecto, `diasControl` 180).
- Secuencias: `SecuenciaCRM` (disparador + filtro JSON, `activa` false por defecto) -> `PasoSecuencia` (único `(secuenciaId, orden)`; espera en días/horas; acción CORREO | TAREA | CAMBIAR_ETAPA | FINALIZAR; variables `{{nombre}}`, `{{centro}}`, `{{enlace}}`). `InscripcionSecuencia` lleva `pasoActual` y `proximaEjecucion` (índice `(estado, proximaEjecucion)` para el motor); `EjecucionPaso` es el registro de lo hecho.

## Decisión: idempotencia de inscripciones
`@@unique([secuenciaId, claveUnica])`. La lógica arma `claveUnica` (`lead:<id>`, `pac:<id>:val:<id>`, `pac:<id>:<año>` para cumpleaños/control periódico). Un unique sobre `(secuenciaId, leadId)` / `(secuenciaId, pacienteId, valoracionId)` no deduplicaría porque Postgres trata los NULL como distintos, y una sola clave permite además reinscripciones legítimas (otro año, otra valoración). El motor debe insertar con `upsert`/`createMany skipDuplicates`.

## Permisos
`rol-app.sql` ya da CRUD a las tablas nuevas; `Evento` sigue solo con INSERT y SELECT (verificado).
