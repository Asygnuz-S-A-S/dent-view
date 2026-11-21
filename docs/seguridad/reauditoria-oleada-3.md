# Re-auditoría de seguridad — oleada 3 (2026-11-20)

Agente: dv-seguridad (opus). Verificación en vivo de correcciones + auditoría de funciones nuevas.

## Hallazgos previos
C1, C2, A1, A3, A4, M1, M5, B1–B4, B6 (ruta interna), B8: **corregidos** (verificados en vivo o por código). A2: **parcial** (ver N1, N10). B6 reaparece en la ruta pública (N7).

## Hallazgos nuevos
| ID | Sev. | Título | Ubicación |
|---|---|---|---|
| N1 | Alta | Quien crea la cuenta de un correo ajeno conoce su clave temporal y puede aceptar invitaciones de otros centros (incl. admin_tenant) | `lib/usuarios.ts`, `lib/invitaciones.ts`, `lib/auth.ts` |
| N2 | Media | Token y código de entrega en claro en `Mensaje.contexto` (ambos en los dos mensajes; solo se borran al ENVIADO) | `lib/resultados.ts`, `lib/notificar.ts` |
| N3 | Media | El enlace de resultados congela UIDs; no revalida paciente/centro del estudio; incluye estudios ASIGNADO | `api/visor/autorizar`, `lib/acceso.ts`, `resultados/[token]`, `entrega/actions.ts` |
| N4 | Media | El worker reasigna y despublica estudios en cada reingesta (`since=0`) | `apps/worker/src/index.ts` |
| N5 | Media | El superadmin puede usar `/admin/set-user-password`, `update-user`, `set-role`, etc. sin control ni registro | `lib/auth.ts` |
| N6 | Media | El PDF del informe se adjunta por correo al emitir (fuera del flujo enlace + código) | `lib/notificar.ts`, `informes/actions.ts` |
| N7 | Media | El enlace público sirve informes archivados o sustituidos | `resultados/[token]/page.tsx`, `api/resultados/[token]/pdf` |
| N8 | Baja | Endpoints de invitación de Better Auth sin bloquear (`accept-invitation`, etc.) | `lib/auth.ts` |
| N9 | Baja | `debeCambiarClave` solo se aplica en `exigirContexto` | `lib/sesion.ts`, `api/visor/autorizar` |
| N10 | Baja | Enumeración de cuentas por la clave temporal | `usuarios/actions.ts`, `doctores/actions.ts` |
| N11 | Baja | Doctor remitente obtiene el nombre de un paciente del centro por documento | `ordenes/actions.ts` |
| N12 | Baja | "Compartir con mi doctor" permite texto libre (phishing con marca del centro) | `resultados/[token]/actions.ts` |
| N13 | Baja | Respuestas `/dicom-web` sin `Cache-Control: no-store` | `infra/Caddyfile` |
| N14 | Baja | `Persona` conserva datos personales heredados no usados | `dominio.prisma` |
| N15 | Info | CSP con `unsafe-inline`; enteros sin tope → 500; enlace y código al mismo buzón; límite por IP en memoria | varios |

## Verificado correcto
Entrega: mismo mensaje para token inexistente/código errado/revocado/bloqueado; token 256 bits y hashes; bloqueo atómico bajo concurrencia; cookie httpOnly/Secure(prod)/SameSite=Lax/2 h firmada; revocación inmediata; visor por cookie solo UIDs del enlace. Better Auth: 12 endpoints de organización bloqueados; `/admin/*` 403 para admin_tenant; `debeCambiarClave` no escribible por el cliente. Búsqueda global y convenios aislados por centro/rol; precio recalculado en servidor; vinculación valida centro/paciente/rol; `/perfil` usa userId de sesión.

## Riesgo residual conocido
Sin TLS/HSTS, BD como superusuario (Evento mutable), sin MFA, límite de intentos en memoria, Orthanc sin auth interna y MinIO root, sin SMTP.
