-- CreateEnum
CREATE TYPE "EstadoPlanTratamiento" AS ENUM ('ACTIVO', 'COMPLETADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoPlanItem" AS ENUM ('PENDIENTE', 'EN_ORDEN', 'REALIZADO');

-- AlterTable
ALTER TABLE "OrdenItem" ADD COLUMN     "planItemId" TEXT;

-- AlterTable
ALTER TABLE "Anticipo" ADD COLUMN     "planId" TEXT;

-- CreateTable
CREATE TABLE "PlanTratamiento" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "presupuestoId" TEXT,
    "titulo" TEXT,
    "estado" "EstadoPlanTratamiento" NOT NULL DEFAULT 'ACTIVO',
    "total" INTEGER NOT NULL,
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanTratamiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "servicioId" TEXT,
    "descripcion" TEXT NOT NULL,
    "diente" INTEGER,
    "fase" INTEGER NOT NULL DEFAULT 1,
    "posicion" INTEGER NOT NULL DEFAULT 0,
    "precio" INTEGER NOT NULL,
    "estado" "EstadoPlanItem" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrdenItem_planItemId_idx" ON "OrdenItem"("planItemId");

-- CreateIndex
CREATE INDEX "Anticipo_planId_idx" ON "Anticipo"("planId");

-- CreateIndex
CREATE INDEX "PlanTratamiento_organizationId_estado_idx" ON "PlanTratamiento"("organizationId", "estado");

-- CreateIndex
CREATE INDEX "PlanTratamiento_pacienteId_idx" ON "PlanTratamiento"("pacienteId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanTratamiento_organizationId_presupuestoId_key" ON "PlanTratamiento"("organizationId", "presupuestoId");

-- CreateIndex
CREATE INDEX "PlanItem_planId_estado_idx" ON "PlanItem"("planId", "estado");

-- CreateIndex
CREATE INDEX "PlanItem_organizationId_idx" ON "PlanItem"("organizationId");

-- AddForeignKey
ALTER TABLE "OrdenItem" ADD CONSTRAINT "OrdenItem_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anticipo" ADD CONSTRAINT "Anticipo_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanTratamiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTratamiento" ADD CONSTRAINT "PlanTratamiento_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTratamiento" ADD CONSTRAINT "PlanTratamiento_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTratamiento" ADD CONSTRAINT "PlanTratamiento_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "Presupuesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanTratamiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
