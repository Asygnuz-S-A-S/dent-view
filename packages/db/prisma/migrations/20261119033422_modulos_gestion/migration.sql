-- CreateEnum
CREATE TYPE "EstadoOrden" AS ENUM ('SOLICITADA', 'AGENDADA', 'TOMADA', 'INFORMADA', 'ENTREGADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "Entrega" AS ENUM ('IMPRESA', 'DIGITAL');

-- CreateEnum
CREATE TYPE "EstadoCita" AS ENUM ('PROGRAMADA', 'CONFIRMADA', 'LLEGO', 'EN_ATENCION', 'ATENDIDA', 'NO_ASISTIO', 'CANCELADA');

-- AlterTable
ALTER TABLE "Estudio" ADD COLUMN     "ordenId" TEXT;

-- AlterTable
ALTER TABLE "PacienteTenant" ADD COLUMN     "alertas" TEXT,
ADD COLUMN     "notas" TEXT;

-- AlterTable
ALTER TABLE "Persona" ADD COLUMN     "direccion" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "impersonatedBy" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "banExpires" TIMESTAMP(3),
ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "banned" BOOLEAN,
ADD COLUMN     "role" TEXT;

-- CreateTable
CREATE TABLE "PerfilDoctor" (
    "userId" TEXT NOT NULL,
    "tarjetaProfesional" TEXT,
    "especialidad" TEXT,
    "telefono" TEXT,
    "consultorio" TEXT,

    CONSTRAINT "PerfilDoctor_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Servicio" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precioImpreso" INTEGER,
    "precioDigital" INTEGER,
    "descuento" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orden" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "doctorRemitenteId" TEXT,
    "estado" "EstadoOrden" NOT NULL DEFAULT 'SOLICITADA',
    "entrega" "Entrega" NOT NULL DEFAULT 'DIGITAL',
    "observaciones" TEXT,
    "embarazo" BOOLEAN NOT NULL DEFAULT false,
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Orden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenItem" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "servicioId" TEXT,
    "nombre" TEXT NOT NULL,
    "opciones" TEXT,
    "precio" INTEGER NOT NULL,
    "descuento" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrdenItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sala" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'teal',
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Sala_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cita" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salaId" TEXT NOT NULL,
    "pacienteId" TEXT,
    "ordenId" TEXT,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "estado" "EstadoCita" NOT NULL DEFAULT 'PROGRAMADA',
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondicionDental" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "diente" INTEGER NOT NULL,
    "superficie" TEXT,
    "condicion" TEXT NOT NULL,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CondicionDental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evento" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT,
    "actorId" TEXT,
    "tipo" TEXT NOT NULL,
    "detalle" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Servicio_organizationId_idx" ON "Servicio"("organizationId");

-- CreateIndex
CREATE INDEX "Orden_organizationId_estado_idx" ON "Orden"("organizationId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Orden_organizationId_numero_key" ON "Orden"("organizationId", "numero");

-- CreateIndex
CREATE INDEX "Sala_organizationId_idx" ON "Sala"("organizationId");

-- CreateIndex
CREATE INDEX "Cita_organizationId_inicio_idx" ON "Cita"("organizationId", "inicio");

-- CreateIndex
CREATE INDEX "CondicionDental_pacienteId_idx" ON "CondicionDental"("pacienteId");

-- CreateIndex
CREATE INDEX "Evento_organizationId_creadoEn_idx" ON "Evento"("organizationId", "creadoEn");

-- CreateIndex
CREATE INDEX "Evento_pacienteId_creadoEn_idx" ON "Evento"("pacienteId", "creadoEn");

-- AddForeignKey
ALTER TABLE "Estudio" ADD CONSTRAINT "Estudio_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilDoctor" ADD CONSTRAINT "PerfilDoctor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Servicio" ADD CONSTRAINT "Servicio_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_doctorRemitenteId_fkey" FOREIGN KEY ("doctorRemitenteId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenItem" ADD CONSTRAINT "OrdenItem_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenItem" ADD CONSTRAINT "OrdenItem_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sala" ADD CONSTRAINT "Sala_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondicionDental" ADD CONSTRAINT "CondicionDental_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
