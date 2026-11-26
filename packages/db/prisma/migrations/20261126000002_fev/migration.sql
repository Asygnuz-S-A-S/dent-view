-- CreateEnum
CREATE TYPE "EstadoDocFE" AS ENUM ('BORRADOR', 'ENVIANDO', 'ACEPTADA', 'RECHAZADA', 'ERROR', 'ANULADA');

-- CreateEnum
CREATE TYPE "TipoDocFE" AS ENUM ('FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO');

-- CreateTable
CREATE TABLE "ConfigFacturacion" (
    "organizationId" TEXT NOT NULL,
    "nit" TEXT,
    "dv" TEXT,
    "razonSocial" TEXT,
    "nombreComercial" TEXT,
    "codigoPrestador" VARCHAR(12),
    "generaRips" BOOLEAN NOT NULL DEFAULT false,
    "emiteFev" BOOLEAN NOT NULL DEFAULT false,
    "modalidadDefecto" TEXT,
    "grupoServiciosDefecto" TEXT,
    "prefijoFactura" TEXT,
    "regimen" TEXT,
    "responsabilidadFiscal" TEXT,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigFacturacion_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "ConexionFE" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "modo" "ModoPasarela" NOT NULL DEFAULT 'SANDBOX',
    "credencialesCifradas" TEXT NOT NULL,
    "webhookSecretCifrado" TEXT,
    "configJson" JSONB,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConexionFE_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoElectronico" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tipo" "TipoDocFE" NOT NULL,
    "facturaId" TEXT NOT NULL,
    "notaCreditoId" TEXT,
    "ordenId" TEXT,
    "conexionId" TEXT NOT NULL,
    "estado" "EstadoDocFE" NOT NULL DEFAULT 'BORRADOR',
    "claveIdempotencia" TEXT NOT NULL,
    "idExterno" TEXT,
    "numeroDian" TEXT,
    "cufe" TEXT,
    "xmlKey" TEXT,
    "pdfKey" TEXT,
    "attachedKey" TEXT,
    "hashXml" TEXT,
    "mensajes" JSONB,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidoPorId" TEXT,
    "enviadoEn" TIMESTAMP(3),
    "aceptadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoElectronico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvioRips" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ordenId" TEXT,
    "documentoId" TEXT,
    "version" TEXT NOT NULL,
    "jsonKey" TEXT NOT NULL,
    "hashJson" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "cuv" TEXT,
    "resultados" JSONB,
    "generadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvioRips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConexionFE_organizationId_proveedor_key" ON "ConexionFE"("organizationId", "proveedor");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoElectronico_notaCreditoId_key" ON "DocumentoElectronico"("notaCreditoId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoElectronico_claveIdempotencia_key" ON "DocumentoElectronico"("claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoElectronico_cufe_key" ON "DocumentoElectronico"("cufe");

-- CreateIndex
CREATE INDEX "DocumentoElectronico_organizationId_estado_idx" ON "DocumentoElectronico"("organizationId", "estado");

-- CreateIndex
CREATE INDEX "DocumentoElectronico_estado_proximoIntento_idx" ON "DocumentoElectronico"("estado", "proximoIntento");

-- CreateIndex
CREATE INDEX "DocumentoElectronico_facturaId_idx" ON "DocumentoElectronico"("facturaId");

-- CreateIndex
CREATE INDEX "EnvioRips_organizationId_estado_idx" ON "EnvioRips"("organizationId", "estado");

-- CreateIndex
CREATE INDEX "EnvioRips_ordenId_idx" ON "EnvioRips"("ordenId");

-- CreateIndex
CREATE INDEX "EnvioRips_documentoId_idx" ON "EnvioRips"("documentoId");

-- AddForeignKey
ALTER TABLE "ConfigFacturacion" ADD CONSTRAINT "ConfigFacturacion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConexionFE" ADD CONSTRAINT "ConexionFE_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoElectronico" ADD CONSTRAINT "DocumentoElectronico_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoElectronico" ADD CONSTRAINT "DocumentoElectronico_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoElectronico" ADD CONSTRAINT "DocumentoElectronico_notaCreditoId_fkey" FOREIGN KEY ("notaCreditoId") REFERENCES "NotaCredito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoElectronico" ADD CONSTRAINT "DocumentoElectronico_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoElectronico" ADD CONSTRAINT "DocumentoElectronico_conexionId_fkey" FOREIGN KEY ("conexionId") REFERENCES "ConexionFE"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvioRips" ADD CONSTRAINT "EnvioRips_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvioRips" ADD CONSTRAINT "EnvioRips_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvioRips" ADD CONSTRAINT "EnvioRips_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "DocumentoElectronico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

