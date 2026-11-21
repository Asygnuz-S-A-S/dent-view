# Re-auditoría de seguridad — superficie de integraciones (2026-11-20)

Agente: dv-seguridad (opus). Entorno: despliegue local (Docker). Alcance: API pública `/api/v1`, webhooks de salida, conectores y webhook de entrada, servidor MCP, administración de integraciones.

## Resumen
No se encontró ningún acceso a datos de otro centro (IDOR) en rutas, filtros ni idempotencia. Los precios no se fijan desde el cliente, la protección SSRF de webhooks es sólida, las firmas se comparan en tiempo constante y ningún secreto vuelve a la interfaz. El hallazgo principal era la privacidad del MCP.

## Hallazgos y estado

| ID | Sev. | Hallazgo | Estado |
|---|---|---|---|
| H1 | Alta | Un token MCP (datos enmascarados) servía también en `/api/v1`, que devuelve datos completos: se saltaba el enmascarado | **Corregido**: permiso marcador `mcp`; la API REST rechaza (401) tokens con `mcp` y el MCP exige `mcp`; `pii` solo con `mcp`; los tokens MCP son de solo lectura. Pruebas nuevas |
| M1 | Media | `buscar_pacientes` sin `pii` era un oráculo (coincidencias parciales de documento y nombre) | **Corregido**: sin `pii` solo documento completo exacto. Prueba nueva |
| M2 | Media | El sistema externo completaba correo/celular de pacientes que ya existían, y a ese correo llegan enlace y código de resultados | **Corregido**: pacientes existentes se vinculan sin tocar el contacto; solo se completan los creados por la integración |
| M3 | Media | `pacientes:escribir` permitía leer la ficha vía POST (documento existente) y PATCH | **Corregido**: sin `pacientes:leer` solo se devuelve el id |
| M4 | Media | Un centro podía retrasar los webhooks de todos (cola global, envío en serie, 10 s de timeout) | **Corregido**: reparto justo (2 por webhook, 10 por centro, 20 por ciclo), concurrencia 5, desactivación automática tras 20 fallos consecutivos |
| B1 | Baja | Webhook de entrada sin límite de peticiones ni de cuerpo en streaming | **Corregido**: `request_body max_size 2MB` en Caddy, corte del stream, 120 peticiones/min por IP e integración |
| B2 | Baja | Las citas importadas creaban una sala por cada nombre externo (inyección indirecta hacia el MCP) | **Corregido**: una sola sala "Importada"; el sillón externo va limpio en notas |
| B3 | Baja | Activar/desactivar y rotar secreto sin auditoría; `parse` daba 500 | **Corregido**: eventos de auditoría y `safeParse` |
| B4 | Baja | Worker como root, con todo `.env`; cifrado con el mismo secreto que las sesiones | **Corregido**: `USER node`, entorno explícito, `CIFRADO_SECRETO` opcional (cae a `BETTER_AUTH_SECRET`) |
| B5 | Baja | Idempotencia por centro y no por token | Pendiente (sin fuga entre centros; carrera documentada) |
| B6 | Info | Los webhooks envían tipo y número de documento al sistema del cliente | Decisión de diseño; advertir en la UI y valorar un modo "solo ids"; incluir en el contrato de transmisión de datos |
| B7 | Info | Límites de peticiones en memoria, API y MCP por separado | Atajo documentado; mover a Redis/BD al escalar |

## Verificado correcto
Aislamiento entre centros (GET/PATCH/POST con ids ajenos: 404 o rechazo); mass assignment (`strictObject`, 422); precios recalculados en el servidor; cursores inyectados sin efecto; idempotencia sin fuga entre centros; tokens inexistente/vencido/revocado con el mismo 401; hashes y secretos nunca en la UI; informes solo EMITIDO vigente; SSRF de webhooks (decimal, octal, hex, IPv4 mapeada, NAT64, 6to4, Teredo, ULA, link-local, metadatos, credenciales en la URL, redirecciones, rebinding, tope de 64 KB); firma con ventana de 5 min y comparación en tiempo constante; secretos AES-GCM; MCP sin herramientas de escritura y filtrado por permiso.

## No probado
Server actions en vivo (MFA obligatorio; verificadas en código), entrega real de webhooks a internet, DNS rebinding con servidor propio, Dentalink real, despliegues con varias réplicas.
