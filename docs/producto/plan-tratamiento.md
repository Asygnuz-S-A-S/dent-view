# Plan de tratamiento con costo

Módulo `planes` (menú Finanzas, ruta `/planes`). Habilitado en centro odontológico, clínica odontológica y odontólogo particular; no existe en el centro radiológico (404 en rutas y acciones, sin entrada de menú).

No es el plan clínico del paciente (`PlanTratamientoItem`, pestaña de la ficha, sin dinero): son dos cosas distintas. Este plan tiene precio y se ejecuta por órdenes.

## Qué resuelve

Un paciente acepta una cotización de varios tratamientos. El plan congela el precio de cada ítem y lleva el avance y el saldo mientras se crean y atienden las órdenes de cada cita.

## Flujo

1. **Crear el plan.**
   - Desde una cotización **aceptada** (botón "Crear plan de tratamiento" en la ficha de la cotización). Un plan por cotización (índice único `organizationId + presupuestoId`).
   - Manual desde la ficha del paciente ("Plan de tratamiento" → `/planes/nuevo?paciente=`), con los precios del catálogo de hoy (entrega digital, sin convenio).
2. **Precio congelado.** El neto de cada ítem (cantidad × valor − descuento, con el descuento global ya repartido por la cotización) se guarda en `PlanItem.precio`. Nada lo recalcula después. Cada `PlanItem` es **una unidad** (cantidad 3 = 3 filas) porque la orden no maneja cantidad; el neto se reparte sin perder pesos.
3. **Pedir ítems en una orden.** `/ordenes/nueva?paciente=&plan=` muestra los ítems PENDIENTES del plan (si no se indica `plan`, el plan activo más reciente del paciente). La orden se crea con esos ítems a su precio congelado, más los servicios sueltos que se agreguen. Los ítems pasan a EN_ORDEN y cada línea guarda `OrdenItem.planItemId`.
4. **Atender.** Cuando la orden llega a TOMADA (o INFORMADA/ENTREGADA) sus ítems pasan a REALIZADO; el saldo baja y sube el avance. Aplica a todos los caminos que mueven la orden: botón de estado, vincular estudio, emitir informe y carga de estudios.
5. **Cancelar la orden** (desde SOLICITADA, AGENDADA o TOMADA): sus ítems vuelven a PENDIENTE y el plan se reabre si estaba completado.
6. **Completar.** Cuando todos los ítems están REALIZADO el plan pasa a COMPLETADO.
7. **Cancelar el plan** (motivo obligatorio): solo si está ACTIVO y no tiene ítems EN_ORDEN. Lo realizado queda; lo pendiente deja de poder pedirse.

## Cifras de la ficha del plan

- **Total**: suma congelada de los ítems.
- **Avance %**: valor realizado / total (con ítems del mismo precio coincide con ítems realizados / ítems).
- **Saldo por ejecutar**: total − realizado.
- **Anticipo disponible**: anticipos del plan (registrados − aplicados). **Saldo por pagar** = saldo − anticipo disponible (mínimo 0).

## Anticipo

Recepción o administración lo registran en la ficha del plan (monto en pesos enteros, mínimo $1.000; efectivo, transferencia, tarjeta u otro). Se guarda como `Anticipo` DISPONIBLE del paciente con `planId`. Se aplica a la cuenta de cobro de cada orden desde Facturación ("Anticipos disponibles" → aplicar), que crea un pago con medio ANTICIPO por lo que alcance sin pasar del saldo de la cuenta: así la cuenta muestra el descuento por anticipo. El plan no guarda un total de anticipo propio: se deriva de los anticipos con `planId`.

## Concurrencia

Un ítem solo puede estar en una orden: el reclamo es un `updateMany` condicionado a `estado = PENDIENTE`, plan ACTIVO y paciente del plan, dentro de la misma transacción que crea la orden. Si `count` no coincide con los ítems pedidos se revierte todo y se responde "Algún ítem del plan ya no está disponible".

## Seguridad y alcance

Sin RLS: cada consulta filtra por `organizationId`; un id de otro centro responde 404. Roles: admin, recepción y especialista ven y crean planes; solo admin y recepción registran anticipos; el doctor remitente no accede.

## Limitaciones conocidas (decisiones de la versión mínima)

- Los ítems **libres** de una cotización (sin servicio del catálogo) no entran al plan, igual que no pasan a la orden al convertir: el plan solo cubre servicios del catálogo. El total del plan puede ser menor que el de la cotización; el evento `plan.creado` registra cuántos quedaron fuera.
- Una cotización con plan **no** se convierte en orden completa (evita cobrar dos veces); se piden ítems desde el plan.
- El anticipo no se aplica solo a la cuenta de cada orden: se aplica manualmente desde Facturación (la cuenta lista todos los anticipos disponibles del paciente, no solo los del plan).
- La orden por plan se crea con entrega digital por defecto y sin convenio efectivo sobre los ítems del plan (su precio no se recalcula); el convenio solo afecta los servicios sueltos agregados.
- No hay edición de ítems de un plan creado ni reasignación entre planes.
