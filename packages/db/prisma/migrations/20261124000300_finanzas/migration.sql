-- Finanzas: anticipos, anulación auditada, notas crédito, presupuestos, cuotas, caja, egresos y liquidación.
-- CreateEnum
CREATE TYPE "EstadoAnticipo" AS ENUM ('DISPONIBLE', 'APLICADO', 'REEMBOLSADO', 'ANULADO', 'RETENIDO');

-- CreateEnum
CREATE TYPE "EstadoPresupuesto" AS ENUM ('BORRADOR', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'VENCIDO', 'CONVERTIDO');

-- CreateEnum
CREATE TYPE "EstadoCuota" AS ENUM ('PENDIENTE', 'PAGADA', 'VENCIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoPromesa" AS ENUM ('PENDIENTE', 'CUMPLIDA', 'INCUMPLIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoSesionCaja" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "TipoComision" AS ENUM ('PORCENTAJE', 'FIJO');

-- CreateEnum
CREATE TYPE "EstadoLiquidacion" AS ENUM ('BORRADOR', 'APROBADA', 'PAGADA', 'ANULADA');

-- AlterEnum
ALTER TYPE "MedioPago" ADD VALUE 'ANTICIPO';

-- AlterTable
ALTER TABLE "Factura" ADD COLUMN     "anuladoEn" TIMESTAMP(3),
ADD COLUMN     "anuladoPorId" TEXT,
ADD COLUMN     "convenioId" TEXT,
ADD COLUMN     "motivoAnulacion" TEXT,
ADD COLUMN     "ultimoRecordatorioCobroEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FacturaItem" ADD COLUMN     "descuento" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "profesionalId" TEXT,
ADD COLUMN     "servicioId" TEXT;

-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "anticipoId" TEXT,
ADD COLUMN     "anuladoEn" TIMESTAMP(3),
ADD COLUMN     "anuladoPorId" TEXT,
ADD COLUMN     "motivoAnulacion" TEXT,
ADD COLUMN     "sesionCajaId" TEXT;

-- CreateTable
CREATE TABLE "Anticipo" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "estado" "EstadoAnticipo" NOT NULL DEFAULT 'DISPONIBLE',
    "pacienteId" TEXT,
    "citaId" TEXT,
    "reservaId" TEXT,
    "linkPagoId" TEXT,
    "valor" INTEGER NOT NULL,
    "valorAplicado" INTEGER NOT NULL DEFAULT 0,
    "medio" "MedioPago" NOT NULL DEFAULT 'PASARELA',
    "referencia" TEXT,
    "reembolsable" BOOLEAN NOT NULL DEFAULT true,
    "horasLimiteReembolso" INTEGER NOT NULL DEFAULT 24,
    "retieneSiNoAsiste" BOOLEAN NOT NULL DEFAULT true,
    "motivo" TEXT,
    "resueltoEn" TIMESTAMP(3),
    "registradoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Anticipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaCredito" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "facturaId" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "creadaPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaCredito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presupuesto" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "profesionalId" TEXT,
    "estado" "EstadoPresupuesto" NOT NULL DEFAULT 'BORRADOR',
    "titulo" TEXT,
    "notas" TEXT,
    "margen" DECIMAL(5,2),
    "validoHasta" DATE,
    "tokenHash" TEXT,
    "aceptadoEn" TIMESTAMP(3),
    "aceptadoNombre" TEXT,
    "aceptadoIpHash" TEXT,
    "rechazadoEn" TIMESTAMP(3),
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPresupuesto" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "presupuestoId" TEXT NOT NULL,
    "servicioId" TEXT,
    "descripcion" TEXT NOT NULL,
    "diente" INTEGER,
    "fase" INTEGER NOT NULL DEFAULT 1,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "valorUnitario" INTEGER NOT NULL,
    "costoUnitario" INTEGER NOT NULL DEFAULT 0,
    "descuento" INTEGER NOT NULL DEFAULT 0,
    "posicion" INTEGER NOT NULL DEFAULT 0,
    "facturaId" TEXT,

    CONSTRAINT "ItemPresupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuotaFactura" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" INTEGER NOT NULL,
    "vence" DATE NOT NULL,
    "estado" "EstadoCuota" NOT NULL DEFAULT 'PENDIENTE',
    "ultimoRecordatorioEn" TIMESTAMP(3),

    CONSTRAINT "CuotaFactura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromesaPago" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "fechaPromesa" DATE NOT NULL,
    "valor" INTEGER NOT NULL,
    "estado" "EstadoPromesa" NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT,
    "creadaPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromesaPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionCaja" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoSesionCaja" NOT NULL DEFAULT 'ABIERTA',
    "abiertaPorId" TEXT NOT NULL,
    "abiertaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "baseApertura" INTEGER NOT NULL DEFAULT 0,
    "cerradaPorId" TEXT,
    "cerradaEn" TIMESTAMP(3),
    "esperadoPorMedio" JSONB,
    "contadoPorMedio" JSONB,
    "diferencia" INTEGER,
    "notas" TEXT,

    CONSTRAINT "SesionCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Egreso" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valor" INTEGER NOT NULL,
    "categoria" TEXT NOT NULL,
    "descripcion" TEXT,
    "medio" "MedioPago" NOT NULL DEFAULT 'EFECTIVO',
    "proveedorId" TEXT,
    "soporteKey" TEXT,
    "sesionCajaId" TEXT,
    "ordenCompraId" TEXT,
    "registradoPorId" TEXT,
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "motivoAnulacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Egreso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContratoProfesional" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profesionalId" TEXT NOT NULL,
    "porcentajeDefault" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vigenteDesde" DATE NOT NULL,
    "vigenteHasta" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContratoProfesional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaComisionServicio" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "tipo" "TipoComision" NOT NULL DEFAULT 'PORCENTAJE',
    "valor" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ReglaComisionServicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Liquidacion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profesionalId" TEXT NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "estado" "EstadoLiquidacion" NOT NULL DEFAULT 'BORRADOR',
    "totalBase" INTEGER NOT NULL DEFAULT 0,
    "totalComision" INTEGER NOT NULL DEFAULT 0,
    "creadaPorId" TEXT,
    "aprobadaEn" TIMESTAMP(3),
    "pagadaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidacionItem" (
    "id" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "facturaItemId" TEXT NOT NULL,
    "servicioId" TEXT,
    "base" INTEGER NOT NULL,
    "comision" INTEGER NOT NULL,

    CONSTRAINT "LiquidacionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigFinanzas" (
    "organizationId" TEXT NOT NULL,
    "cobroAutomaticoActivo" BOOLEAN NOT NULL DEFAULT false,
    "diasRecordatorioCobro" INTEGER NOT NULL DEFAULT 3,
    "margenCotizacionDefault" DECIMAL(5,2) NOT NULL DEFAULT 30,

    CONSTRAINT "ConfigFinanzas_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Anticipo_linkPagoId_key" ON "Anticipo"("linkPagoId");

-- CreateIndex
CREATE INDEX "Anticipo_organizationId_estado_idx" ON "Anticipo"("organizationId", "estado");

-- CreateIndex
CREATE INDEX "Anticipo_pacienteId_idx" ON "Anticipo"("pacienteId");

-- CreateIndex
CREATE INDEX "Anticipo_citaId_idx" ON "Anticipo"("citaId");

-- CreateIndex
CREATE INDEX "Anticipo_reservaId_idx" ON "Anticipo"("reservaId");

-- CreateIndex
CREATE INDEX "NotaCredito_facturaId_idx" ON "NotaCredito"("facturaId");

-- CreateIndex
CREATE UNIQUE INDEX "NotaCredito_organizationId_consecutivo_key" ON "NotaCredito"("organizationId", "consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "Presupuesto_tokenHash_key" ON "Presupuesto"("tokenHash");

-- CreateIndex
CREATE INDEX "Presupuesto_organizationId_estado_idx" ON "Presupuesto"("organizationId", "estado");

-- CreateIndex
CREATE INDEX "Presupuesto_pacienteId_idx" ON "Presupuesto"("pacienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Presupuesto_organizationId_numero_key" ON "Presupuesto"("organizationId", "numero");

-- CreateIndex
CREATE INDEX "ItemPresupuesto_presupuestoId_idx" ON "ItemPresupuesto"("presupuestoId");

-- CreateIndex
CREATE INDEX "ItemPresupuesto_organizationId_idx" ON "ItemPresupuesto"("organizationId");

-- CreateIndex
CREATE INDEX "CuotaFactura_organizationId_estado_vence_idx" ON "CuotaFactura"("organizationId", "estado", "vence");

-- CreateIndex
CREATE UNIQUE INDEX "CuotaFactura_facturaId_numero_key" ON "CuotaFactura"("facturaId", "numero");

-- CreateIndex
CREATE INDEX "PromesaPago_organizationId_estado_fechaPromesa_idx" ON "PromesaPago"("organizationId", "estado", "fechaPromesa");

-- CreateIndex
CREATE INDEX "PromesaPago_facturaId_idx" ON "PromesaPago"("facturaId");

-- CreateIndex
CREATE INDEX "SesionCaja_organizationId_estado_idx" ON "SesionCaja"("organizationId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "SesionCaja_organizationId_numero_key" ON "SesionCaja"("organizationId", "numero");

-- CreateIndex
CREATE INDEX "Egreso_organizationId_fecha_idx" ON "Egreso"("organizationId", "fecha");

-- CreateIndex
CREATE INDEX "Egreso_sesionCajaId_idx" ON "Egreso"("sesionCajaId");

-- CreateIndex
CREATE INDEX "ContratoProfesional_organizationId_profesionalId_idx" ON "ContratoProfesional"("organizationId", "profesionalId");

-- CreateIndex
CREATE UNIQUE INDEX "ReglaComisionServicio_contratoId_servicioId_key" ON "ReglaComisionServicio"("contratoId", "servicioId");

-- CreateIndex
CREATE INDEX "Liquidacion_organizationId_profesionalId_desde_idx" ON "Liquidacion"("organizationId", "profesionalId", "desde");

-- CreateIndex
CREATE INDEX "LiquidacionItem_liquidacionId_idx" ON "LiquidacionItem"("liquidacionId");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidacionItem_pagoId_facturaItemId_key" ON "LiquidacionItem"("pagoId", "facturaItemId");

-- CreateIndex
CREATE INDEX "FacturaItem_servicioId_idx" ON "FacturaItem"("servicioId");

-- CreateIndex
CREATE INDEX "Pago_sesionCajaId_idx" ON "Pago"("sesionCajaId");

-- CreateIndex
CREATE INDEX "Pago_anticipoId_idx" ON "Pago"("anticipoId");

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "Convenio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaItem" ADD CONSTRAINT "FacturaItem_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_sesionCajaId_fkey" FOREIGN KEY ("sesionCajaId") REFERENCES "SesionCaja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_anticipoId_fkey" FOREIGN KEY ("anticipoId") REFERENCES "Anticipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anticipo" ADD CONSTRAINT "Anticipo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anticipo" ADD CONSTRAINT "Anticipo_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anticipo" ADD CONSTRAINT "Anticipo_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anticipo" ADD CONSTRAINT "Anticipo_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "ReservaPublica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anticipo" ADD CONSTRAINT "Anticipo_linkPagoId_fkey" FOREIGN KEY ("linkPagoId") REFERENCES "LinkPago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presupuesto" ADD CONSTRAINT "Presupuesto_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presupuesto" ADD CONSTRAINT "Presupuesto_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPresupuesto" ADD CONSTRAINT "ItemPresupuesto_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPresupuesto" ADD CONSTRAINT "ItemPresupuesto_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "Presupuesto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPresupuesto" ADD CONSTRAINT "ItemPresupuesto_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPresupuesto" ADD CONSTRAINT "ItemPresupuesto_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuotaFactura" ADD CONSTRAINT "CuotaFactura_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuotaFactura" ADD CONSTRAINT "CuotaFactura_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromesaPago" ADD CONSTRAINT "PromesaPago_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromesaPago" ADD CONSTRAINT "PromesaPago_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionCaja" ADD CONSTRAINT "SesionCaja_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Egreso" ADD CONSTRAINT "Egreso_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Egreso" ADD CONSTRAINT "Egreso_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Egreso" ADD CONSTRAINT "Egreso_sesionCajaId_fkey" FOREIGN KEY ("sesionCajaId") REFERENCES "SesionCaja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Egreso" ADD CONSTRAINT "Egreso_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "OrdenCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoProfesional" ADD CONSTRAINT "ContratoProfesional_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaComisionServicio" ADD CONSTRAINT "ReglaComisionServicio_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "ContratoProfesional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaComisionServicio" ADD CONSTRAINT "ReglaComisionServicio_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionItem" ADD CONSTRAINT "LiquidacionItem_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionItem" ADD CONSTRAINT "LiquidacionItem_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionItem" ADD CONSTRAINT "LiquidacionItem_facturaItemId_fkey" FOREIGN KEY ("facturaItemId") REFERENCES "FacturaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigFinanzas" ADD CONSTRAINT "ConfigFinanzas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Una sesión de caja ABIERTA por usuario y centro.
CREATE UNIQUE INDEX "SesionCaja_una_abierta_por_usuario" ON "SesionCaja"("organizationId", "abiertaPorId") WHERE estado = 'ABIERTA';
