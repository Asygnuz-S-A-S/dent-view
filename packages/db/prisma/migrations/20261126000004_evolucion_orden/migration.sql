-- AlterTable
ALTER TABLE "BorradorEvolucion" ADD COLUMN     "ordenId" TEXT;

-- AlterTable
ALTER TABLE "EvolucionClinica" ADD COLUMN     "ordenId" TEXT;

-- CreateIndex
CREATE INDEX "BorradorEvolucion_organizationId_ordenId_idx" ON "BorradorEvolucion"("organizationId", "ordenId");

-- CreateIndex
CREATE INDEX "EvolucionClinica_organizationId_ordenId_idx" ON "EvolucionClinica"("organizationId", "ordenId");

-- AddForeignKey
ALTER TABLE "EvolucionClinica" ADD CONSTRAINT "EvolucionClinica_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

