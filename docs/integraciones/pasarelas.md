# Pasarelas de pago por centro

Cada centro conecta SU cuenta de pasarela. El dinero va directo a la cuenta del centro: dent-view no retiene fondos y nunca toca datos de tarjeta (el pago ocurre en el checkout/link alojado por la pasarela). Solo guarda las llaves CIFRADAS (AES-256-GCM, `lib/cifrado.ts`; nunca se devuelven a la UI, que solo muestra los últimos 4 caracteres) y registra el resultado.

## Flujo
1. Admin del centro: `/integraciones/pasarelas` -> elige proveedor, modo (SANDBOX/PRODUCCION), pega las llaves, "Probar conexión", guarda. Copia la **URL del webhook** (`https://<dominio>/api/pagos/<proveedor>/<pasarelaId>`) y pégala en el panel de la pasarela.
2. Cuenta de cobro (`/facturacion/[id]`) -> "Generar link de pago". El monto lo calcula el servidor: saldo pendiente menos lo comprometido en otros links activos (o un abono parcial con tope en ese saldo). Referencia única no adivinable, vigencia 7 días. Se puede copiar, mostrar QR, enviar por correo al paciente (texto "tienes un pago pendiente" + enlace, sin datos clínicos) y anular.
3. El paciente paga en la pasarela; esta llama al webhook. dent-view verifica la firma con el secreto del centro (tiempo constante), reclama el evento (idempotencia: `EventoPasarela` único por proveedor + id de evento prefijado con la pasarela), valida monto y moneda contra el `LinkPago` y, si coinciden, crea el `Pago` (medio `PASARELA`, `linkPagoId`, `referenciaExterna`) y actualiza la cuenta (pagada/parcial) en una transacción con bloqueo de fila, con la misma regla de `lib/facturacion.ts`. Auditoría en `Evento` (`pago.link_creado`, `pago.link_aprobado`, `factura.pago`, `pago.pasarela_discrepancia`, `pasarela.*`).
4. El pago aparece en el detalle de la factura y descuenta el saldo en Cartera con el medio "Pasarela de pago".
5. Conciliación: "Conciliar links pendientes" (admin, en Pasarelas) y "Actualizar estado" (por cuenta) consultan la API de la pasarela por si se perdió un webhook, y marcan como vencidos los links caducados. Solo disponible donde el proveedor permite consultar (ver tabla).

Respuestas del webhook: 200 rápido (también para duplicados y eventos ignorados), 401 igual para pasarela inexistente/inactiva/firma inválida (sin detalles), 400 cuerpo ilegible, 413 cuerpo > 256 KB, 429 límite (120/min por IP, 300/min por pasarela, en memoria), 500 error interno (la pasarela reintenta). El centro sale de la pasarela de la URL, nunca del payload. Solo se llama a hosts fijos de cada proveedor (sin URLs del usuario: SSRF).

Un pago APROBADO se aplica aunque el link se haya anulado o vencido en dent-view (el dinero ya llegó). Si el monto/moneda no coinciden, o la cuenta ya no estaba abierta, no se pierde: queda un evento `pago.pasarela_discrepancia` para revisión.

## Estado por proveedor
"Probado" = verificado contra una cuenta real. **Ningún proveedor se ha probado contra cuenta real** (no hay llaves sandbox en este entorno): Wompi y Mercado Pago están implementados con la doc oficial y permitidos en PRODUCCION (probar primero en SANDBOX); ePayco, PayU y Bold muestran "No probado" y su modo PRODUCCION está bloqueado.

| Proveedor | Crear link | Webhook / firma | Consultar estado | Probar conexión |
|---|---|---|---|---|
| Wompi | `POST /v1/payment_links` (sandbox.wompi.co / production.wompi.co), `single_use`, vencimiento | `transaction.updated`, SHA256(valores de `signature.properties` + `timestamp` + secreto de eventos); exige id, estado y monto en las propiedades; el `environment` debe coincidir con el modo. Se resuelve el link por `payment_link_id` | TODO: la doc no expone listar transacciones por link | `GET /merchants/:llave_publica` (TODO: no confirmado en la doc consultada) + coherencia de prefijos de llaves |
| Mercado Pago | `POST /checkout/preferences` (`external_reference` = nuestra referencia, `expiration_date_to`) | `x-signature` (`ts`,`v1`): HMAC-SHA256 de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` (manifiesto del SDK oficial). El estado/monto/referencia se leen de `GET /v1/payments/{id}` con el token del centro | `GET /v1/payments/search?external_reference=` (TODO: filtro no confirmado en doc) | `GET /users/me` |
| Bold (No probado) | `POST /online/link/v1`, `Authorization: x-api-key` | `x-bold-signature`: HMAC-SHA256 hex del cuerpo en Base64 con la llave secreta (vacía en pruebas). `SALE_APPROVED/SALE_REJECTED`. TODO: `VOID_*` sin tratar; campo de moneda sin confirmar (se asume COP) | TODO: campos de estado no confirmados | Solo valida que haya llaves (TODO) |
| PayU (No probado) | TODO: WebCheckout es un formulario POST; no hay API de links confirmada (no implementado) | Confirmación: firma `ApiKey~merchant_id~reference_sale~new_value~currency~state_pol` (md5/sha1/sha256 según el largo de `sign`; regla de redondeo de `new_value` de la doc) | No | Solo valida datos |
| ePayco (No probado) | TODO: la doc vigente (docs.epayco.com -> docs.davipay.com) no se pudo leer; no implementado | Fórmula `x_signature` = SHA256(`p_cust_id^p_key^x_ref_payco^x_transaction_id^x_amount^x_currency_code`) tomada de memoria y SIN reconfirmar | No | Solo valida datos |

Nota sobre la doc de Wompi: el checksum de ejemplo de su página de eventos (`3476DDA5…`) no se reproduce con SHA256 de la cadena que ella misma muestra (da `5a18ec5e…`); las pruebas usan el valor calculado siguiendo los pasos escritos. Verificar con un evento real de sandbox.

## Cómo conectar cada una
- **Wompi**: Dashboard de comercios -> llaves pública (`pub_…`) y privada (`prv_…`) y, en "Secretos para integración técnica", el secreto de eventos (`…_events_…`). Pega la URL del webhook en "URL de eventos". Las llaves deben corresponder al modo (`test`/`prod`).
- **Mercado Pago**: Tus integraciones -> app -> credenciales (access token) y Webhooks -> Configurar notificación (URL del webhook, evento "Pagos") -> revelar la clave secreta.
- **Bold**: llaves de integración (identidad y secreta) en el panel de Bold; configura el webhook con la URL.
- **PayU / ePayco**: no conectar en producción; solo SANDBOX hasta completar y probar el adaptador.

## Desarrollo y pruebas
- `PAGOS_SIMULADO=1` (solo desarrollo; `infra/.env`, NUNCA producción): en modo SANDBOX se sustituyen las llamadas SALIENTES (crear link, consultar, probar conexión) por respuestas locales (`/pago-simulado/SIM-<referencia>`); la verificación de firmas y el mapeo de eventos son los reales. El E2E firma webhooks de Wompi con el secreto de eventos que el propio test configura.
- Unitarias: `apps/web/src/lib/pagos/pagos.test.ts` (firmas con vectores calculados a mano, mapeo, monto/moneda, estados, SSRF) y `servicio.test.ts` (idempotencia y pago parcial/total con doble en memoria de la transacción).
- E2E: `apps/web/tests/e2e/16-pasarelas.spec.ts` (usar `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080`: con `localhost:8080` las cookies seguras no se envían).
- Caddy: `/api/pagos/*` ya pasa sin `forward_auth` (solo `/dicom-web/*` lo usa) y hereda el tope de cuerpo de 2 MB de `/api/*`; no hizo falta cambiar `Caddyfile.rutas`.

## Pendientes
Reembolsos/contracargos (`refunded`, `charged_back`, `VOID_*`) sin tratamiento automático; anular un link no lo cierra en la pasarela (Wompi no documenta desactivarlo por API); límites de peticiones en memoria (pasar a Redis al escalar); conciliación real solo en Mercado Pago.
