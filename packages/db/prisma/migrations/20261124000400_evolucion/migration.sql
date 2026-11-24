-- Evolutivos clínicos (solo inserción; ver infra/postgres/rol-app.sql).
-- CreateEnum
CREATE TYPE "MetodoFirma" AS ENUM ('CLAVE', 'TOTP', 'CLAVE_TOTP');

-- CreateTable
CREATE TABLE "PlantillaEvolucion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "campos" JSONB NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadaPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlantillaEvolucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BorradorEvolucion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "citaId" TEXT,
    "plantillaId" TEXT,
    "contenido" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BorradorEvolucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvolucionClinica" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "citaId" TEXT,
    "plantillaId" TEXT,
    "plantillaVersion" INTEGER,
    "motivoConsulta" TEXT,
    "hallazgos" TEXT,
    "procedimiento" TEXT,
    "serviciosRealizados" JSONB,
    "diagnosticosCie10" JSONB,
    "plan" TEXT,
    "indicaciones" TEXT,
    "proximaCita" DATE,
    "odontogramaSnapshot" JSONB,
    "firmanteId" TEXT NOT NULL,
    "firmanteNombre" TEXT NOT NULL,
    "firmanteTarjeta" TEXT,
    "hashContenido" TEXT NOT NULL,
    "metodoFirma" "MetodoFirma" NOT NULL,
    "firmadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvolucionClinica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdendaEvolucion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "evolucionId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "firmanteId" TEXT NOT NULL,
    "firmanteNombre" TEXT NOT NULL,
    "firmanteTarjeta" TEXT,
    "hashContenido" TEXT NOT NULL,
    "metodoFirma" "MetodoFirma" NOT NULL,
    "firmadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdendaEvolucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdjuntoEvolucion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "evolucionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "hash" TEXT,
    "subidoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdjuntoEvolucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroToma" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT,
    "estudioId" TEXT,
    "ordenId" TEXT,
    "tecnicoId" TEXT NOT NULL,
    "salaId" TEXT,
    "tomadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repeticiones" INTEGER NOT NULL DEFAULT 0,
    "motivoRepeticion" TEXT,
    "incidencias" TEXT,

    CONSTRAINT "RegistroToma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OdontogramaHistorial" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "autorId" TEXT,
    "snapshot" JSONB NOT NULL,
    "motivo" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OdontogramaHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlantillaEvolucion_organizationId_nombre_version_key" ON "PlantillaEvolucion"("organizationId", "nombre", "version");

-- CreateIndex
CREATE INDEX "BorradorEvolucion_organizationId_pacienteId_autorId_idx" ON "BorradorEvolucion"("organizationId", "pacienteId", "autorId");

-- CreateIndex
CREATE INDEX "EvolucionClinica_organizationId_pacienteId_firmadaEn_idx" ON "EvolucionClinica"("organizationId", "pacienteId", "firmadaEn");

-- CreateIndex
CREATE UNIQUE INDEX "EvolucionClinica_organizationId_pacienteId_folio_key" ON "EvolucionClinica"("organizationId", "pacienteId", "folio");

-- CreateIndex
CREATE INDEX "AdendaEvolucion_evolucionId_idx" ON "AdendaEvolucion"("evolucionId");

-- CreateIndex
CREATE INDEX "AdendaEvolucion_organizationId_idx" ON "AdendaEvolucion"("organizationId");

-- CreateIndex
CREATE INDEX "AdjuntoEvolucion_evolucionId_idx" ON "AdjuntoEvolucion"("evolucionId");

-- CreateIndex
CREATE INDEX "AdjuntoEvolucion_organizationId_idx" ON "AdjuntoEvolucion"("organizationId");

-- CreateIndex
CREATE INDEX "RegistroToma_organizationId_tomadoEn_idx" ON "RegistroToma"("organizationId", "tomadoEn");

-- CreateIndex
CREATE INDEX "RegistroToma_estudioId_idx" ON "RegistroToma"("estudioId");

-- CreateIndex
CREATE INDEX "RegistroToma_ordenId_idx" ON "RegistroToma"("ordenId");

-- CreateIndex
CREATE INDEX "OdontogramaHistorial_organizationId_pacienteId_creadoEn_idx" ON "OdontogramaHistorial"("organizationId", "pacienteId", "creadoEn");

-- AddForeignKey
ALTER TABLE "PlantillaEvolucion" ADD CONSTRAINT "PlantillaEvolucion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorradorEvolucion" ADD CONSTRAINT "BorradorEvolucion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorradorEvolucion" ADD CONSTRAINT "BorradorEvolucion_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorradorEvolucion" ADD CONSTRAINT "BorradorEvolucion_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "PlantillaEvolucion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvolucionClinica" ADD CONSTRAINT "EvolucionClinica_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvolucionClinica" ADD CONSTRAINT "EvolucionClinica_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvolucionClinica" ADD CONSTRAINT "EvolucionClinica_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvolucionClinica" ADD CONSTRAINT "EvolucionClinica_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "PlantillaEvolucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdendaEvolucion" ADD CONSTRAINT "AdendaEvolucion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdendaEvolucion" ADD CONSTRAINT "AdendaEvolucion_evolucionId_fkey" FOREIGN KEY ("evolucionId") REFERENCES "EvolucionClinica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjuntoEvolucion" ADD CONSTRAINT "AdjuntoEvolucion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjuntoEvolucion" ADD CONSTRAINT "AdjuntoEvolucion_evolucionId_fkey" FOREIGN KEY ("evolucionId") REFERENCES "EvolucionClinica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroToma" ADD CONSTRAINT "RegistroToma_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroToma" ADD CONSTRAINT "RegistroToma_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroToma" ADD CONSTRAINT "RegistroToma_estudioId_fkey" FOREIGN KEY ("estudioId") REFERENCES "Estudio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroToma" ADD CONSTRAINT "RegistroToma_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroToma" ADD CONSTRAINT "RegistroToma_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdontogramaHistorial" ADD CONSTRAINT "OdontogramaHistorial_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdontogramaHistorial" ADD CONSTRAINT "OdontogramaHistorial_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
