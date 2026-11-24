-- Bodega e inventario.
-- CreateEnum
CREATE TYPE "TipoInsumo" AS ENUM ('CONSUMIBLE', 'MEDICAMENTO', 'DESECHABLE', 'INSTRUMENTAL', 'RADIOLOGICO', 'LABORATORIO', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('ENTRADA_COMPRA', 'ENTRADA_AJUSTE', 'ENTRADA_TRASLADO', 'SALIDA_CONSUMO', 'SALIDA_AJUSTE', 'SALIDA_TRASLADO', 'SALIDA_VENCIMIENTO');

-- CreateEnum
CREATE TYPE "EstadoOrdenCompra" AS ENUM ('BORRADOR', 'ENVIADA', 'PARCIAL', 'RECIBIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoCotizacionProveedor" AS ENUM ('SOLICITADA', 'RECIBIDA', 'ELEGIDA', 'DESCARTADA');

-- CreateTable
CREATE TABLE "Insumo" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "tipo" "TipoInsumo" NOT NULL DEFAULT 'CONSUMIBLE',
    "unidad" TEXT NOT NULL DEFAULT 'unidad',
    "presentacion" TEXT,
    "factorPresentacion" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "stockMinimo" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "stockTotal" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "costoPromedio" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "controlaLote" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bodega" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Bodega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nit" TEXT,
    "contacto" TEXT,
    "correo" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoteInsumo" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "venceEn" DATE,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoteInsumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Existencia" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bodegaId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "loteId" TEXT,
    "cantidad" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "Existencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoInventario" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "insumoId" TEXT NOT NULL,
    "bodegaId" TEXT NOT NULL,
    "loteId" TEXT,
    "cantidad" DECIMAL(14,4) NOT NULL,
    "costoUnitario" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "saldoPosterior" DECIMAL(14,4) NOT NULL,
    "costoPromedioPosterior" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "tipoReferencia" TEXT,
    "referenciaId" TEXT,
    "ordenCompraId" TEXT,
    "motivo" TEXT,
    "registradoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecetaServicio" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "cantidad" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "RecetaServicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenCompra" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "bodegaId" TEXT,
    "estado" "EstadoOrdenCompra" NOT NULL DEFAULT 'BORRADOR',
    "notas" TEXT,
    "creadaPorId" TEXT,
    "enviadaEn" TIMESTAMP(3),
    "recibidaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrdenCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemOrdenCompra" (
    "id" TEXT NOT NULL,
    "ordenCompraId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "cantidad" DECIMAL(14,4) NOT NULL,
    "cantidadRecibida" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "costoUnitario" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "ItemOrdenCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotizacionProveedor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "estado" "EstadoCotizacionProveedor" NOT NULL DEFAULT 'SOLICITADA',
    "vigenteHasta" DATE,
    "notas" TEXT,
    "ordenCompraId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CotizacionProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCotizacionProveedor" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "cantidad" DECIMAL(14,4) NOT NULL,
    "precioUnitario" DECIMAL(14,4),

    CONSTRAINT "ItemCotizacionProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Insumo_organizationId_activo_idx" ON "Insumo"("organizationId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "Insumo_organizationId_nombre_key" ON "Insumo"("organizationId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Bodega_organizationId_nombre_key" ON "Bodega"("organizationId", "nombre");

-- CreateIndex
CREATE INDEX "Proveedor_organizationId_idx" ON "Proveedor"("organizationId");

-- CreateIndex
CREATE INDEX "LoteInsumo_organizationId_venceEn_idx" ON "LoteInsumo"("organizationId", "venceEn");

-- CreateIndex
CREATE UNIQUE INDEX "LoteInsumo_insumoId_codigo_key" ON "LoteInsumo"("insumoId", "codigo");

-- CreateIndex
CREATE INDEX "Existencia_organizationId_insumoId_idx" ON "Existencia"("organizationId", "insumoId");

-- CreateIndex
-- NULLS NOT DISTINCT: (bodega, insumo, sin lote) también es único (Postgres 15+).
CREATE UNIQUE INDEX "Existencia_bodegaId_insumoId_loteId_key" ON "Existencia"("bodegaId", "insumoId", "loteId") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "MovimientoInventario_organizationId_insumoId_creadoEn_idx" ON "MovimientoInventario"("organizationId", "insumoId", "creadoEn");

-- CreateIndex
CREATE INDEX "MovimientoInventario_bodegaId_idx" ON "MovimientoInventario"("bodegaId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoInventario_tipoReferencia_referenciaId_insumoId_t_key" ON "MovimientoInventario"("tipoReferencia", "referenciaId", "insumoId", "tipo");

-- CreateIndex
CREATE INDEX "RecetaServicio_organizationId_idx" ON "RecetaServicio"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "RecetaServicio_servicioId_insumoId_key" ON "RecetaServicio"("servicioId", "insumoId");

-- CreateIndex
CREATE INDEX "OrdenCompra_organizationId_estado_idx" ON "OrdenCompra"("organizationId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCompra_organizationId_numero_key" ON "OrdenCompra"("organizationId", "numero");

-- CreateIndex
CREATE INDEX "ItemOrdenCompra_ordenCompraId_idx" ON "ItemOrdenCompra"("ordenCompraId");

-- CreateIndex
CREATE INDEX "CotizacionProveedor_organizationId_estado_idx" ON "CotizacionProveedor"("organizationId", "estado");

-- CreateIndex
CREATE INDEX "ItemCotizacionProveedor_cotizacionId_idx" ON "ItemCotizacionProveedor"("cotizacionId");

-- AddForeignKey
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bodega" ADD CONSTRAINT "Bodega_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proveedor" ADD CONSTRAINT "Proveedor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteInsumo" ADD CONSTRAINT "LoteInsumo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteInsumo" ADD CONSTRAINT "LoteInsumo_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Existencia" ADD CONSTRAINT "Existencia_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Existencia" ADD CONSTRAINT "Existencia_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "Bodega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Existencia" ADD CONSTRAINT "Existencia_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Existencia" ADD CONSTRAINT "Existencia_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteInsumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "Bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteInsumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaServicio" ADD CONSTRAINT "RecetaServicio_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaServicio" ADD CONSTRAINT "RecetaServicio_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaServicio" ADD CONSTRAINT "RecetaServicio_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "Bodega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOrdenCompra" ADD CONSTRAINT "ItemOrdenCompra_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "OrdenCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOrdenCompra" ADD CONSTRAINT "ItemOrdenCompra_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionProveedor" ADD CONSTRAINT "CotizacionProveedor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionProveedor" ADD CONSTRAINT "CotizacionProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionProveedor" ADD CONSTRAINT "CotizacionProveedor_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "OrdenCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCotizacionProveedor" ADD CONSTRAINT "ItemCotizacionProveedor_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "CotizacionProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCotizacionProveedor" ADD CONSTRAINT "ItemCotizacionProveedor_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
