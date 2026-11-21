-- AlterTable
ALTER TABLE "Orden" ADD COLUMN     "convenioId" TEXT;

-- CreateTable
CREATE TABLE "Convenio" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nit" TEXT,
    "contacto" TEXT,
    "descuentoGeneral" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "vigenteDesde" DATE,
    "vigenteHasta" DATE,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Convenio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarifaEspecial" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "convenioId" TEXT,
    "doctorId" TEXT,
    "precioImpreso" INTEGER,
    "precioDigital" INTEGER,

    CONSTRAINT "TarifaEspecial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Convenio_organizationId_idx" ON "Convenio"("organizationId");

-- CreateIndex
CREATE INDEX "TarifaEspecial_organizationId_idx" ON "TarifaEspecial"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TarifaEspecial_convenioId_servicioId_key" ON "TarifaEspecial"("convenioId", "servicioId");

-- CreateIndex
CREATE UNIQUE INDEX "TarifaEspecial_doctorId_servicioId_key" ON "TarifaEspecial"("doctorId", "servicioId");

-- AddForeignKey
ALTER TABLE "Convenio" ADD CONSTRAINT "Convenio_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaEspecial" ADD CONSTRAINT "TarifaEspecial_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaEspecial" ADD CONSTRAINT "TarifaEspecial_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaEspecial" ADD CONSTRAINT "TarifaEspecial_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "Convenio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "Convenio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
