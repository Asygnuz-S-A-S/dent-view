# Facturación electrónica (FEV DIAN)

Cada centro conecta SU proveedor tecnológico (contrato, resolución de numeración y firma propios). dent-view arma la factura electrónica de venta (FEV) desde la cuenta de cobro, la envía por el adaptador del proveedor y guarda el resultado. Si el centro no conecta un proveedor o `ConfigFacturacion.emiteFev = false`, todo sigue como siempre (cuenta de cobro interna).

Marco normativo (verificar siempre con el contador/abogado): Res. DIAN 000165 de 2023 (anexo técnico FEV 1.9; compilada en la Res. única 227 de 2025); sector salud: Res. 948 de 2026 (CODIGO_PRESTADOR, MODALIDAD_PAGO, COBERTURA_PLAN_BENEFICIOS —15 = Particular—, NUMERO_CONTRATO/CUCON, COPAGO, CUOTA_MODERADORA, ANTICIPO). Una FEV aceptada no se anula: se emite una nota crédito electrónica con el CUFE de origen.

## Piezas

| Archivo | Qué hace |
|---|---|
| `apps/web/src/lib/fe/proveedor.ts` | Interfaz `ProveedorFacturacionElectronica`, tipos `FacturaFE`/`NotaFE`, `llamarApi` (hosts fijos, https, tiempo de espera, sin redirecciones, reintentos con backoff) |
| `lib/fe/registro.ts` | Lista de adaptadores. Agregar uno = una línea |
| `lib/fe/proveedores/` | `simulado.ts`, `siigo.ts`, `_plantilla.ts.txt` |
| `lib/fe/mapear.ts`, `dian.ts` | Mapeo puro dent-view -> FE, códigos DIAN, dígito de verificación del NIT |
| `lib/fe/estados.ts` | Máquina de estados, backoff (1 min x2, tope 2 h), máx. 8 intentos |
| `lib/fe/servicio.ts` | `emitirFev`, `emitirNotaCreditoFe`, `reintentarDocumento`, `procesarPendientes` (cron), `aplicarEventoWebhook`, `descargarDocumento` |
| `app/api/cron/fe` | Reintenta/concilia documentos ENVIANDO (lo llama el worker cada 5 min con `CRON_SECRET`) |
| `app/api/fe/[proveedor]/[conexionId]` | Webhook entrante firmado (solo proveedores con `verificarWebhook`) |
| `app/api/fe/documentos/[id]/[pdf\|xml\|attached]` | Descarga autenticada (GESTION, solo del centro) |
| `/integraciones/facturacion` | Datos del facturador, conexiones e historial (solo admin_tenant, módulo `facturacion-electronica`) |
| `components/facturacion/bloque-fev.tsx` | `<BloqueFev facturaId={id} />`: componente de servidor reutilizable (detalle de la cuenta; la orden puede montarlo en `bloque-factura.tsx`) |

## Flujo e idempotencia

1. `emitirFev(facturaId)` valida (FEV activada, conexión activa y usable, cuenta ABIERTA/PAGADA y no anulada, CUPS en los ítems si se generan RIPS, datos del facturador y del adquirente) y, bajo `SELECT ... FOR UPDATE` de la cuenta, crea el `DocumentoElectronico` ENVIANDO con clave `fev:<facturaId>` (única). Una segunda llamada, aunque sea simultánea, devuelve el mismo documento sin llamar al proveedor.
2. El adaptador se llama FUERA de la transacción, tras reservar el documento con un UPDATE condicional (`proximoIntento` se mueve 5 min: si el proceso muere otro lo retoma).
3. Resultado: ACEPTADA (CUFE, número DIAN, XML y PDF a S3 con hash SHA-256 del XML), RECHAZADA (mensajes legibles; reintento manual), PROCESANDO (queda ENVIANDO con `idExterno`; el cron consulta), error transitorio (reintento con backoff; al 8.º intento pasa a ERROR), error permanente (ERROR). Eventos: `fe.emitida`, `fe.rechazada`, `fe.error`.
4. Nota crédito: `crearNotaCredito` crea la nota interna y, si la cuenta tiene FEV aceptada, un documento NOTA_CREDITO (`nc:<notaId>`) en la misma transacción; se emite tras el commit. Si falla, la nota interna se conserva y el cron la reintenta. Si las notas cubren todo el total, la FEV pasa a ANULADA.
5. Una cuenta con FEV enviada o aceptada no se puede anular (`anularFactura`): se corrige con nota crédito.

## Seguridad

Credenciales cifradas (AES-256-GCM, `lib/cifrado.ts`), nunca vuelven a la UI (solo últimos 4); hosts fijos por adaptador; sin secretos en logs/Evento; límite de emisión por usuario (20/min) y por centro (60/min); descargas máx. 10 MB; configurar = solo admin_tenant, emitir y descargar = GESTION; todo acotado por `organizationId`. Proveedores "No probados" no se pueden poner en PRODUCCION.

## Proveedor SIMULADO

Solo existe si `FEV_SIMULADO=1` Y `BETTER_AUTH_URL` es localhost (`infra/.env`; no se pasa a producción). Escenarios (ajuste de la conexión): Aceptar, Rechazar, Error transitorio, Respuesta lenta, Procesando. Genera CUFE falso determinístico y PDF/XML marcados «SIMULADO — SIN VALIDEZ FISCAL». Su webhook usa HMAC-SHA256 del cuerpo en la cabecera `x-fe-signature` con el secreto de la conexión.

## Agregar un proveedor (ALEGRA, FACTUS, MATIAS...)

1. Copia `lib/fe/proveedores/_plantilla.ts.txt` a `lib/fe/proveedores/<proveedor>.ts` y quita el `.txt`.
2. Lee la documentación OFICIAL del proveedor; no inventes endpoints ni campos. Lo que no confirmes queda como `// TODO`.
3. Completa: `clave` (= `ConexionFE.proveedor`), `campos` (credenciales; se cifran), `camposConfig` (ajustes no secretos: ids de resolución, etc.), `probarConexion`, `emitirFactura`, `emitirNotaCredito`, `consultarEstado`, `descargar` y, si hay webhook firmado, `verificarWebhook`/`mapearEvento`.
4. Reglas: usar `llamarApi` con un `HOSTS` fijo; rechazos de negocio = `RECHAZADA` con mensajes en español; fallos de red/5xx = `ErrorFE` transitorio; errores de configuración = `ErrorFE(msg, false)`; nunca incluir llaves ni cuerpos de respuesta en mensajes.
5. Márcalo `bloqueadoProduccion: true` con `advertencia` hasta probarlo con una cuenta real.
6. Súmalo a la lista de `lib/fe/registro.ts`. No hay migración (el proveedor es `String`) ni cambios de UI: la pantalla se pinta con `campos` y `camposConfig`.
7. Agrega pruebas del adaptador con `fetch` inyectado (ver `registro.test.ts` para el contrato).

## Estado de verificación

- **SIMULADO**: probado (unitarias + E2E 30).
- **SIIGO**: NO probado con cuenta real. Implementado con el SDK oficial `SiigoDev/siigo_sdk_javascript` y la documentación pública. TODO: (a) host y ruta de autenticación (`api.siigo.com/auth` vs `services.siigo.com/alliances/api/siigoapi-users/v1/sign-in`); (b) si `Partner-Id` es obligatorio; (c) cuerpo exacto de `POST /v1/invoices` (nombres de campos snake_case, `customer`, impuestos); (d) Siigo exige un producto existente en la cuenta: se usa un código genérico (`codigoProducto`); (e) forma de `stamp/errors`; (f) la nota crédito no documenta `stamp.send` ni su `stamp`: se consulta con `GET /v1/credit-notes/{id}`; (g) XML/attached no documentados (solo PDF base64); (h) sin clave de idempotencia: tras un fallo ambiguo de red podría duplicar el documento; (i) campos de sector salud no confirmados (`soportaSalud: false`).
- **Validación DIAN real, CUV (validación de RIPS) y copago/cuota moderadora**: no verificados. dent-view hoy envía copago y cuota moderadora en 0.
- Pendiente de decisión: una cuenta ABIERTA con FEV aceptada y sin pagos no se puede anular ni acreditar (la nota crédito interna solo aplica a cuentas pagadas).
