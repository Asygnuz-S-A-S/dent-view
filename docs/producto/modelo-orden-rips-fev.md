# Modelo: orden como eje (RIPS, evolutivos, FEV, presupuestos virtuales, convenios)

Cambios 100 % aditivos (columnas opcionales o con default, tablas y enums nuevos). Nada se renombra ni se borra. Migraciones `202611260000NN_*` en `packages/db/prisma/migrations`. Esquema en `packages/db/prisma/schema/` (`dominio`, `finanzas`, `evolucion`, `convenios`, `fev`).

## Decisiones

- **Proveedor de facturación electrónica = `String`** (`ConexionFE.proveedor`), no enum. Lo valida el registro de adaptadores (`SIMULADO`, `SIIGO`, `ALEGRA`, `FACTUS`, `MATIAS`, `OTRO`); agregar un proveedor no exige migración. Por eso no existe el enum `ProveedorFE`.
- `EstadoPresupuesto.VISTO` se agregó al final del enum (`ALTER TYPE ADD VALUE`). No hay `switch` exhaustivo sobre el enum en el código: no hubo que corregir nada.
- `profesionalAtiendeId`, `emitidoPorId`, `generadoPorId`, y en Presupuesto `valoracionId`, `leadId`, `ordenId` son ids sin FK (como `profesionalId` de Cita).
- `DocumentoElectronico`, `EnvioRips` y `Presupuesto.ordenId` no son solo-inserta (la app actualiza estado); `rol-app.sql` no cambia (los permisos por defecto cubren tablas nuevas; `EvolucionClinica`/`RegistroToma` siguen solo INSERT+SELECT, verificado).
- FKs fiscales/clínicas con `Restrict` (`DocumentoElectronico`, `EnvioRips` hacia Organization; `DocumentoElectronico`->Factura/NotaCredito/ConexionFE; `EvolucionClinica`->Orden). `ConfigFacturacion` y `ConexionFE` caen en cascada con la organización.
- `BorradorEvolucion` recibió `ordenId` sin FK (el borrador es desechable). `PlantillaEvolucion` y `EvolucionClinica` ya tenían motivo, hallazgos, procedimiento, diagnósticos, plan e indicaciones: no se tocaron. `RegistroToma.ordenId` ya existía.
- Módulos (`tipo-centro.ts`): `convenios` habilitado en CENTRO_ODONTOLOGICO y CLINICA_ODONTOLOGICA (no en ODONTOLOGO_PARTICULAR); nuevo módulo `facturacion-electronica` (ruta `/integraciones/facturacion`) en todos los tipos; `rips` NO es módulo (es pestaña).

## Modelo -> campos nuevos -> quién los usa

| Modelo | Campos / cambio | Usa |
|---|---|---|
| enum `TipoRips` | CONSULTA, PROCEDIMIENTO, OTRO_SERVICIO | RIPS |
| `Servicio` | `codigoCups` VarChar(6)?, `tipoRips` (def PROCEDIMIENTO), `codServicioReps` Int? | RIPS, catálogo |
| `OrdenItem` | `codigoCups` VarChar(6)?, `tipoRips` (def PROCEDIMIENTO), `finalidad`?, `diagnostico` VarChar(4)? | RIPS, orden |
| `Orden` | `tipoUsuario`, `numAutorizacion`, `finalidad`, `causaMotivoAtencion`, `viaIngreso`, `diagnosticoPrincipal` VarChar(4), `diagnosticosRelacionados` String[] (def []), `tipoDiagnostico`, `profesionalAtiendeId`, `ripsActualizadoEn` (todos opcionales) | RIPS, orden |
| `PacienteTenant` | `sexo` (H/M/I), `codPaisResidencia` (def "170"), `codMunicipio` VarChar(5), `zonaTerritorial`, `codPaisOrigen` (def "170"), `tipoUsuarioDefecto`, `aseguradoraNit` | RIPS, pacientes |
| enums `EstadoDocFE`, `TipoDocFE` | BORRADOR/ENVIANDO/ACEPTADA/RECHAZADA/ERROR/ANULADA; FACTURA/NOTA_CREDITO/NOTA_DEBITO | FEV |
| `ConfigFacturacion` (PK `organizationId`) | `nit`, `dv`, `razonSocial`, `nombreComercial`, `codigoPrestador` VarChar(12), `generaRips`, `emiteFev` (def false), `modalidadDefecto`, `grupoServiciosDefecto`, `prefijoFactura`, `regimen`, `responsabilidadFiscal`, `actualizadoEn` | FEV, RIPS |
| `ConexionFE` | `proveedor` String, `modo` ModoPasarela (def SANDBOX), `credencialesCifradas`, `webhookSecretCifrado`?, `configJson`?, `activa`, `creadoEn`; único (organizationId, proveedor) | FEV |
| `DocumentoElectronico` | `tipo`, `facturaId`, `notaCreditoId`? único, `ordenId`?, `conexionId`, `estado` (def BORRADOR), `claveIdempotencia` único, `idExterno`, `numeroDian`, `cufe` único, `xmlKey`, `pdfKey`, `attachedKey`, `hashXml`, `mensajes` Json, `intentos`, `proximoIntento` (def now), `emitidoPorId`, `enviadoEn`, `aceptadoEn`, `creadoEn`, `actualizadoEn`; índices (org, estado), (estado, proximoIntento), (facturaId) | FEV, worker |
| `EnvioRips` | `ordenId`?, `documentoId`?, `version`, `jsonKey`, `hashJson`, `estado` String (GENERADO/VALIDADO_LOCAL/DESCARGADO/ENVIADO/APROBADO/RECHAZADO), `cuv`, `resultados` Json, `generadoPorId`, `creadoEn`; índices (org, estado), (ordenId), (documentoId) | RIPS |
| `Presupuesto` | `valoracionId`, `leadId`, `ordenId`, `codigoHash`, `intentosCodigo` (def 0), `enviadoEn`, `vistoEn`, `textoAceptacionVersion`, `textoAceptacionHash`, `aceptadoDocumento`, `rechazoMotivo`; índices (org, ordenId), (org, valoracionId), (org, leadId); `EstadoPresupuesto` + `VISTO` | Cotización virtual |
| `EvolucionClinica` | `ordenId` (FK Orden, Restrict) + índice (org, ordenId); sigue solo-inserta | Evolutivos |
| `BorradorEvolucion` | `ordenId` + índice (org, ordenId) | Evolutivos |
| `Convenio` | `tipoPagador` (PARTICULAR/EPS/PREPAGADA/POLIZA/EMPRESA/OTRO), `cucon`, `coberturaPlan`, `nitPagador` | Convenios, RIPS, FEV |

## Migraciones

1. `20261126000001_rips_orden`
2. `20261126000002_fev`
3. `20261126000003_presupuesto_virtual`
4. `20261126000004_evolucion_orden`
5. `20261126000005_convenios_pagador`
