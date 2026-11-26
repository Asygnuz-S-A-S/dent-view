-- CreateEnum
CREATE TYPE "EstadoVinculo" AS ENUM ('PENDIENTE', 'ACTIVO', 'RECHAZADO', 'REVOCADO');

-- CreateEnum
CREATE TYPE "EstadoRemision" AS ENUM ('ENVIADA', 'RECIBIDA', 'EN_PROCESO', 'DEVUELTA', 'RECHAZADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "VinculoCentro" (
    "id" TEXT NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "receptorId" TEXT NOT NULL,
    "estado" "EstadoVinculo" NOT NULL DEFAULT 'PENDIENTE',
    "solicitadoPorId" TEXT NOT NULL,
    "respondidoPorId" TEXT,
    "respondidoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VinculoCentro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remision" (
    "id" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "origenId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,
    "estado" "EstadoRemision" NOT NULL DEFAULT 'ENVIADA',
    "pacienteOrigenId" TEXT NOT NULL,
    "autorizacionId" TEXT NOT NULL,
    "creadoPorId" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaNacimiento" DATE,
    "celular" TEXT,
    "embarazo" BOOLEAN,
    "motivo" TEXT NOT NULL,
    "estudiosSolicitados" TEXT NOT NULL,
    "remitenteNombre" TEXT NOT NULL,
    "alcance" TEXT[],
    "consentimientoTexto" TEXT NOT NULL,
    "consentimientoVersion" TEXT NOT NULL,
    "consentimientoPorId" TEXT NOT NULL,
    "consentimientoEn" TIMESTAMP(3) NOT NULL,
    "pacienteDestinoId" TEXT,
    "ordenDestinoId" TEXT,
    "motivoRechazo" TEXT,
    "informeId" TEXT,
    "estudioUids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "devueltaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Remision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemisionEvento" (
    "id" TEXT NOT NULL,
    "remisionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "tipo" TEXT NOT NULL,
    "nota" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemisionEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VinculoCentro_receptorId_estado_idx" ON "VinculoCentro"("receptorId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "VinculoCentro_solicitanteId_receptorId_key" ON "VinculoCentro"("solicitanteId", "receptorId");

-- CreateIndex
CREATE UNIQUE INDEX "Remision_ordenDestinoId_key" ON "Remision"("ordenDestinoId");

-- CreateIndex
CREATE INDEX "Remision_origenId_estado_creadoEn_idx" ON "Remision"("origenId", "estado", "creadoEn");

-- CreateIndex
CREATE INDEX "Remision_destinoId_estado_creadoEn_idx" ON "Remision"("destinoId", "estado", "creadoEn");

-- CreateIndex
CREATE INDEX "RemisionEvento_remisionId_creadoEn_idx" ON "RemisionEvento"("remisionId", "creadoEn");

-- AddForeignKey
ALTER TABLE "VinculoCentro" ADD CONSTRAINT "VinculoCentro_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoCentro" ADD CONSTRAINT "VinculoCentro_receptorId_fkey" FOREIGN KEY ("receptorId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remision" ADD CONSTRAINT "Remision_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "VinculoCentro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remision" ADD CONSTRAINT "Remision_origenId_fkey" FOREIGN KEY ("origenId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remision" ADD CONSTRAINT "Remision_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remision" ADD CONSTRAINT "Remision_pacienteOrigenId_fkey" FOREIGN KEY ("pacienteOrigenId") REFERENCES "PacienteTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remision" ADD CONSTRAINT "Remision_pacienteDestinoId_fkey" FOREIGN KEY ("pacienteDestinoId") REFERENCES "PacienteTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remision" ADD CONSTRAINT "Remision_ordenDestinoId_fkey" FOREIGN KEY ("ordenDestinoId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemisionEvento" ADD CONSTRAINT "RemisionEvento_remisionId_fkey" FOREIGN KEY ("remisionId") REFERENCES "Remision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
