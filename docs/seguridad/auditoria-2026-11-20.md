# Auditoría de seguridad dent-view — 2026-11-20

Agente: dv-seguridad (opus) · Skills: owasp-security (ASVS), security-best-practices · Alcance: código del repo + pruebas en vivo contra http://localhost:8080 con los usuarios demo. Fuera de alcance: el flujo de entrega de resultados (en implementación al momento de la auditoría).

## Resumen ejecutivo

El aislamiento por centro está bien aplicado en las 56 server actions y 5 route handlers (cruces de ids entre `radex-demo` y `radex-2-demo` devuelven "no encontrado"/404 en vivo). El riesgo está en lo que evita ese filtro: el autorizador del visor, la tabla global `Persona` y configuraciones por defecto de Better Auth.

## Hallazgos

| ID | Sev. | Título | Ubicación |
|---|---|---|---|
| C1 | Crítica | QIDO del visor sin filtro real: con `StudyInstanceUID=<propio>&0020000D=` se listan metadatos de pacientes de todos los centros | `apps/web/src/lib/acceso.ts`, `api/visor/autorizar/route.ts` |
| C2 | Crítica | `Persona` global: cualquier centro (incluido doctor remitente vía `crearPacienteRapido`) vincula y ve la identidad de pacientes de otro centro con solo el documento, y `guardarPaciente` sobrescribe nombre/contacto globales | `pacientes/actions.ts`, `ordenes/actions.ts` |
| A1 | Alta | Cualquier usuario autenticado crea centros por `/api/auth/organization/create` y queda `admin_tenant` (por defecto `allowUserToCreateOrganization=true`) | `lib/auth.ts` |
| A2 | Alta | Cuentas pre-creadas y vinculadas por correo sin consentimiento → secuestro de acceso a otro centro; `emailVerified: true` en cuentas creadas por terceros; enumeración de correos | `lib/usuarios.ts`, `usuarios/actions.ts`, `doctores/actions.ts` |
| A3 | Alta | `PerfilDoctor` global editable desde otro centro: cambia la tarjeta profesional impresa en informes firmados en otros centros | `doctores/actions.ts`, `informes/actions.ts` |
| A4 | Alta | Suplantación: el cliente llama directo a `/api/auth/admin/impersonate-user` (puede suplantar a cualquiera sin evento) y todo lo escrito queda a nombre del suplantado | `entrar-centro.tsx`, `lib/eventos.ts`, `lib/bitacora.ts` |
| M1 | Media | Sin cabeceras de seguridad (CSP, frame-ancestors, nosniff, Referrer-Policy, HSTS) y `X-Powered-By` expuesto | `infra/Caddyfile`, `next.config.ts` |
| M2 | Media | Sin TLS; cookie de sesión sin `Secure` | `infra/Caddyfile`, `BETTER_AUTH_URL` |
| M3 | Media | Bitácora `Evento` mutable a nivel BD (app conecta como superusuario) y el visor no registra accesos | `lib/eventos.ts`, `compose.yaml` |
| M4 | Media | Límite de intentos en memoria, sin MFA, clave temporal sin cambio obligatorio, sesión de 7 días | `lib/auth.ts`, `lib/usuarios.ts` |
| M5 | Media | `doctor_remitente` lista miembros del centro (`/api/auth/organization/list-members`) | plugin organization |
| B1 | Baja | Endpoints del plugin organization (`update-member-role`, `remove-member`) se saltan `validarCambioMiembro` | `lib/permisos.ts` |
| B2 | Baja | `get-full-organization` con centro ajeno anula el centro activo del usuario | plugin organization |
| B3 | Baja | `crearSeguimiento` no valida que `ordenId` sea del centro | `seguimiento/actions.ts` |
| B4 | Baja | `procesarCola` genera recordatorios de todos los centros | `notificaciones/actions.ts` |
| B5 | Baja | Mensajes de error internos expuestos (informes, Orthanc) | `informes/actions.ts`, Caddy |
| B6 | Baja | PDF de informe archivado descargable por el doctor aunque la página exige EMITIDO | `api/informes/[id]/pdf/route.ts` |
| B7 | Baja | Recepción ve informes con alertas clínicas (decisión de producto) | informes |
| B8 | Baja | `crearPacienteRapido` no normaliza documento ni valida tipo | `ordenes/actions.ts` |
| B9 | Baja | `npm audit`: 3 high/4 moderate solo en herramientas (prisma CLI, shadcn CLI); `shadcn` debería ser devDependency | `apps/web/package.json` |
| B10 | Baja | Orthanc sin autenticación interna; la app usa credenciales root de MinIO | `infra/compose.yaml` |

## Pruebas de concepto clave

**C1** (en vivo, con `doctor@pepito.demo`):
```
curl -b doctor.txt "http://localhost:8080/dicom-web/studies?StudyInstanceUID=<UID propio>&0020000D=&includefield=00100030"
# 200 con estudios de otros pacientes/centros (nombre, documento, fecha de nacimiento)
```
Las imágenes (WADO-RS) de estudios ajenos siguen dando 404 por jerarquía de Orthanc.

**C2** (en vivo, como `admin@radex2.demo`): invocar la server action `crearPacienteRapido` con `CC 900001` (paciente de Radex) → se crea el vínculo en Radex 2 y `/pacientes/<id>` muestra el nombre real registrado por Radex.

**A4** (en vivo): `POST /api/auth/admin/impersonate-user` con el id del doctor → sesión del doctor sin evento `plataforma.entrada`.

## Correcciones propuestas
- **C1:** lista blanca de parámetros QIDO (`StudyInstanceUID`, `includefield`, `limit`, `offset`); rechazar cualquier otro (incluido `0020000D` en cualquier forma); pruebas con variantes.
- **C2:** datos de identidad/contacto por centro (`PacienteTenant`); `Persona` solo como clave; nunca exponer datos de otro centro al vincular.
- **A1:** `allowUserToCreateOrganization: (user) => user.role === "admin"` (o `false`).
- **A2:** invitaciones con aceptación por el titular; sin `emailVerified: true` para cuentas creadas por terceros; cambio de clave obligatorio; respuesta uniforme.
- **A3:** tarjeta/especialidad editables solo por el titular o el superadmin; datos del centro en tabla por centro.
- **A4:** `hooks.before` en `/admin/impersonate-user` (validar objetivo `admin_tenant` y registrar en servidor); `actorRealId` en eventos; bloquear escrituras clínicas durante la suplantación.
- **M1–M5, B1–B10:** ver tabla; cabeceras en Caddy, `poweredByHeader:false`, TLS en producción, usuario de BD sin superusuario + REVOKE UPDATE/DELETE en `Evento`, registrar accesos del visor, rate limit en BD + MFA, bloquear `list-members`/`get-full-organization`/`update-member-role`/`remove-member` vía hooks.

## Verificado correcto
Filtro por centro en todas las actions y route handlers; precios/responsables decididos en servidor; `$queryRaw` parametrizado; sin XSS ni SSRF evidentes; PDF/superficie/informes/órdenes 404 entre centros; visor 401/403 correctos salvo C1 (bloquea `..`, `%2f`, mayúsculas, métodos); CSRF por Origin; `/api/auth/admin/*` 403 para admin_tenant; límite de ingreso sin bypass por `X-Forwarded-For`; `/verificar` sin datos del paciente y con ~8×10^14 códigos; cron falla cerrado; `.env` fuera del repo y de la imagen; servicios internos sin puertos publicados; firma de informes bloqueada al suplantar.

## Datos de prueba dejados
`PacienteTenant cmwol8f4e001j01mj7e8xq0vs` en radex-2 (vinculado a `CC 900001`) y su evento: borrar.
