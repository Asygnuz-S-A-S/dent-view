# Modelo de datos: agenda pública, finanzas, bodega y evolutivos

Esquema en `packages/db/prisma/schema/{agenda-publica,finanzas,bodega,evolucion}.prisma`. Migraciones (en este orden): `20261124000100_agenda_publica`, `…200_bodega`, `…300_finanzas`, `…400_evolucion`.
Todos los modelos nuevos llevan `organizationId`. Ids de usuario (`profesionalId`, `firmanteId`, `tecnicoId`, `creadaPorId`…) son `User.id` **sin FK**, como el resto del esquema. Montos en pesos enteros (`Int`); cantidades y costos de bodega en `Decimal(14,4)`. Back-relations en `Organization`: `horariosAtencion`, `reservasPublicas`, `anticipos`, `notasCredito`, `presupuestos`, `sesionesCaja`, `egresos`, `insumos`, `bodegas`, `proveedores`, `ordenesCompra`, `evolucionesClinicas`, `registrosToma`, etc.

## Cambios en modelos existentes
- **Servicio**: `duracionMin`(30), `holguraMin`(0), `reservableEnLinea`, `requiereOrden`, `anticipoTipo` (`AnticipoTipo` NINGUNO|FIJO|PORCENTAJE), `anticipoValor Int?`.
- **Cita**: `profesionalId?`, `servicioId?`, `origen` (`OrigenCita` INTERNA|PUBLICA|API, default INTERNA), `cruceHistorico` (ver restricción).
- **Factura**: `anuladoEn`, `anuladoPorId`, `motivoAnulacion`, `convenioId?` (relación `convenioRef`; el texto `convenio` se conserva), `ultimoRecordatorioCobroEn`.
- **FacturaItem**: `servicioId?`, `profesionalId?`, `descuento`(0).
- **Pago**: `anuladoEn`, `anuladoPorId`, `motivoAnulacion` (anulado = `anuladoEn != null`; **las sumas deben excluirlos**), `sesionCajaId?`, `anticipoId?`.
- **MedioPago**: nuevo valor `ANTICIPO` (`ETIQUETA_MEDIO` ya lo incluye; no está en `MEDIOS_PAGO`, el selector manual).

## Agenda pública
| Modelo | Propósito | Campos clave |
|---|---|---|
| HorarioAtencion | franja semanal | `salaId?`, `profesionalId?`, `diaSemana` 1-7 ISO, `inicioMin`, `finMin` (min desde 00:00 Bogotá), `activo` |
| ExcepcionHorario | festivo/cierre/apertura especial | `salaId?`, `profesionalId?`, `fecha` Date, `cerrado`, `inicioMin?`, `finMin?`, `motivo` |
| ConfigAgendaPublica | una por centro (PK `organizationId`) | `activa`, `horasMinAnticipacion`(2), `diasVentana`(30), `horasMinCancelar`(24), `mensajeBienvenida`, `versionPolitica`, `captchaActivo`, `anticipoReembolsable`, `horasLimiteReembolso`, `retieneSiNoAsiste` |
| ServicioSala / ServicioProfesional | qué sala/profesional presta cada servicio | `@@unique([servicioId, salaId])`, `@@unique([servicioId, profesionalId])` |
| ReservaPublica | reserva antes de existir la Cita | `estado` (`EstadoReservaPublica`), `servicioId`, `salaId`, `profesionalId?`, `inicio`, `fin`, `nombre`, `tipoDocumento`, `numeroDocumento`, `correo`, `celular`, `tokenGestionHash` **unique**, `codigoHash`, `codigoExpiraEn`, `intentos`, `expiraEn`, `consentimientoDatos`, `consentimientoMercadeo`, `consentimientoEn`, `versionPolitica`, `ordenArchivoKey`, `ordenId`, `citaId` **unique**, `leadId`, `pacienteId`, `ipHash`, `motivoRechazo`. Índices por (org, estado/inicio/ipHash/correo/numeroDocumento + creadoEn) para límites anti-abuso |

**No cruce de citas**: constraints `Cita_sin_cruce_sala` y `Cita_sin_cruce_profesional` (`EXCLUDE USING gist` con `tstzrange(inicio, fin)`, `[)`: citas contiguas se permiten). Ignoran `CANCELADA`, `NO_ASISTIO` y `cruceHistorico = true`. Al migrar, si había citas activas cruzadas en una sala, la más reciente de cada cruce queda con `cruceHistorico = true` (no se borra nada); las citas nuevas siempre nacen `false`. En la BD local se marcaron 17 de 34. Al crear/mover una cita un cruce concurrente lanza error Postgres `23P01` (exclusion_violation): capturarlo y responder "ya hay una cita a esa hora". Prisma no modela estas constraints (el diff queda vacío).

## Finanzas
| Modelo | Propósito | Campos clave / decisiones |
|---|---|---|
| Anticipo | dinero previo a la atención | `estado` (DISPONIBLE\|APLICADO\|REEMBOLSADO\|ANULADO\|RETENIDO), `pacienteId?`, `citaId?`, `reservaId?`, `linkPagoId?` **unique** (idempotencia del webhook), `valor`, `valorAplicado`, `medio`, `referencia`, copia de la política al cobrar (`reembolsable`, `horasLimiteReembolso`, `retieneSiNoAsiste`), `motivo`, `resueltoEn`. Se aplica creando un `Pago` con `medio=ANTICIPO` y `anticipoId` |
| NotaCredito | solo inserta | `consecutivo` (`@@unique([organizationId, consecutivo])`), `facturaId`, `valor`, `motivo`, `creadaPorId` |
| Presupuesto / ItemPresupuesto | cotización de tratamiento | `numero` unique por centro, `estado` (BORRADOR\|ENVIADO\|ACEPTADO\|RECHAZADO\|VENCIDO\|CONVERTIDO), `tokenHash` unique, `aceptadoEn/Nombre/IpHash`, `margen`; ítem: `servicioId?`, `diente`, `fase`, `cantidad`, `valorUnitario`, `costoUnitario`, `descuento`, `facturaId?` (se llena al convertir; un ítem se factura una vez) |
| CuotaFactura | plan de cuotas | `@@unique([facturaId, numero])`, `valor`, `vence`, `estado` (`EstadoCuota`), `ultimoRecordatorioEn` |
| PromesaPago | compromiso de pago | `facturaId`, `fechaPromesa`, `valor`, `estado` (`EstadoPromesa`) |
| SesionCaja | apertura/cierre | `numero` unique por centro, `estado` (ABIERTA\|CERRADA), `abiertaPorId`, `baseApertura`, `esperadoPorMedio` Json, `contadoPorMedio` Json, `diferencia`. Índice único parcial: una ABIERTA por (centro, usuario) |
| Egreso | gastos | `categoria` texto, `valor`, `medio`, `proveedorId?`, `soporteKey`, `sesionCajaId?`, `ordenCompraId?`, `anuladoEn/anuladoPorId/motivoAnulacion` |
| ContratoProfesional / ReglaComisionServicio / Liquidacion / LiquidacionItem | liquidación SOLO a odontólogos del centro (nunca a remitentes) | contrato: `profesionalId`, `porcentajeDefault`, vigencia; regla: `@@unique([contratoId, servicioId])`, `tipo` (PORCENTAJE\|FIJO), `valor`; liquidación: `desde`, `hasta`, `estado`, `totalBase`, `totalComision`; ítem: `@@unique([pagoId, facturaItemId])` (un pago/ítem se liquida una vez) |
| ConfigFinanzas | PK `organizationId` | `cobroAutomaticoActivo`, `diasRecordatorioCobro`(3), `margenCotizacionDefault` Decimal(30) |

## Bodega
| Modelo | Campos clave / decisiones |
|---|---|
| Insumo | `@@unique([organizationId, nombre])`, `tipo` (`TipoInsumo`), `unidad`, `presentacion`, `factorPresentacion`, `stockMinimo`, `stockTotal` (puede ser negativo), `costoPromedio`, `controlaLote` |
| Bodega, Proveedor | `@@unique([organizationId, nombre])` en Bodega; `principal` |
| LoteInsumo | `@@unique([insumoId, codigo])`, `venceEn` |
| Existencia | `@@unique([bodegaId, insumoId, loteId])` con **NULLS NOT DISTINCT** en SQL (sin lote también es único); Prisma no acepta `findUnique` con `loteId` null: usar `findFirst` |
| MovimientoInventario | kardex solo-inserta; `tipo` (`TipoMovimiento`: ENTRADA_COMPRA\|ENTRADA_AJUSTE\|ENTRADA_TRASLADO\|SALIDA_CONSUMO\|SALIDA_AJUSTE\|SALIDA_TRASLADO\|SALIDA_VENCIMIENTO), `cantidad` siempre positiva, `costoUnitario`, `saldoPosterior`, `costoPromedioPosterior`, `tipoReferencia`/`referenciaId`, `ordenCompraId`. Idempotencia: `@@unique([tipoReferencia, referenciaId, insumoId, tipo])` (llave Prisma `tipoReferencia_referenciaId_insumoId_tipo`; se agregó `tipo` para permitir las dos patas de un traslado). Con `tipoReferencia` null no restringe |
| RecetaServicio | `@@unique([servicioId, insumoId])`, `cantidad` en unidad de consumo |
| OrdenCompra / ItemOrdenCompra | `numero` unique por centro, `estado` (BORRADOR\|ENVIADA\|PARCIAL\|RECIBIDA\|CANCELADA), `cantidadRecibida` |
| CotizacionProveedor / ItemCotizacionProveedor | `estado` (SOLICITADA\|RECIBIDA\|ELEGIDA\|DESCARTADA), `ordenCompraId?`, `precioUnitario?` |

## Evolutivos (solo inserta: EvolucionClinica, AdendaEvolucion, AdjuntoEvolucion, RegistroToma)
| Modelo | Campos clave / decisiones |
|---|---|
| PlantillaEvolucion | `@@unique([organizationId, nombre, version])`, `campos` Json; cambiar = insertar versión nueva |
| BorradorEvolucion | editable/borrable; `autorId`, `citaId?`, `plantillaId?`, `contenido` Json |
| EvolucionClinica | `@@unique([organizationId, pacienteId, folio])`, `citaId?`, `plantillaId?`, `plantillaVersion`, `motivoConsulta`, `hallazgos`, `procedimiento`, `serviciosRealizados` Json `[{servicioId,cantidad,diente?}]` (base del consumo por receta), `diagnosticosCie10` Json, `plan`, `indicaciones`, `proximaCita` Date, `odontogramaSnapshot` Json; firma: `firmanteId`, `firmanteNombre`, `firmanteTarjeta`, `hashContenido`, `metodoFirma` (`MetodoFirma` CLAVE\|TOTP\|CLAVE_TOTP), `firmadaEn` |
| AdendaEvolucion | `evolucionId`, `texto` + los mismos campos de firma |
| AdjuntoEvolucion | `evolucionId`, `key`, `nombre`, `mime`, `tamano`, `hash`, `subidoPorId` |
| RegistroToma | `pacienteId?`, `estudioId?`, `ordenId?`, `tecnicoId`, `salaId?`, `tomadoEn`, `repeticiones`, `motivoRepeticion`, `incidencias` |
| OdontogramaHistorial | `pacienteId`, `autorId?`, `snapshot` Json, `motivo`; sin uso todavía (CondicionDental sigue sobrescribiéndose). También solo-inserta por convención, pero no se le revocó UPDATE/DELETE |

## Conservación y permisos
- FKs de datos clínicos/inmutables (EvolucionClinica, Adenda, Adjunto, RegistroToma, MovimientoInventario, NotaCredito, SesionCaja, OdontogramaHistorial) usan `onDelete: Restrict`, incluida la de `Organization`: un centro con historia no se puede borrar de golpe (15 años, Res. 839/2017).
- `infra/postgres/rol-app.sql` revoca `UPDATE, DELETE` a `dentview_app` en EvolucionClinica, AdendaEvolucion, AdjuntoEvolucion, RegistroToma, MovimientoInventario y NotaCredito. Corre en cada arranque de web tras `prisma migrate deploy` (CMD del Dockerfile). Consecuencia: en esas tablas no usar `update`/`upsert`/`delete`, ni `SELECT … FOR UPDATE`.
- Tipo de centro: módulos `agenda-publica` (`/ajustes/agenda-publica`), `inventario`, `caja`, `gastos`, `presupuestos`, `evolucion` en `lib/tipo-centro.ts`. Particular sin `caja`; radiológico sin `evolucion`.
