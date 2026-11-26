-- AlterEnum
ALTER TYPE "EstadoPresupuesto" ADD VALUE 'VISTO';

-- AlterTable
ALTER TABLE "Presupuesto" ADD COLUMN     "aceptadoDocumento" TEXT,
ADD COLUMN     "codigoHash" TEXT,
ADD COLUMN     "enviadoEn" TIMESTAMP(3),
ADD COLUMN     "intentosCodigo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "leadId" TEXT,
ADD COLUMN     "ordenId" TEXT,
ADD COLUMN     "rechazoMotivo" TEXT,
ADD COLUMN     "textoAceptacionHash" TEXT,
ADD COLUMN     "textoAceptacionVersion" TEXT,
ADD COLUMN     "valoracionId" TEXT,
ADD COLUMN     "vistoEn" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Presupuesto_organizationId_ordenId_idx" ON "Presupuesto"("organizationId", "ordenId");

-- CreateIndex
CREATE INDEX "Presupuesto_organizationId_valoracionId_idx" ON "Presupuesto"("organizationId", "valoracionId");

-- CreateIndex
CREATE INDEX "Presupuesto_organizationId_leadId_idx" ON "Presupuesto"("organizationId", "leadId");

