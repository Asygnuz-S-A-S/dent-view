-- CreateEnum
CREATE TYPE "EstadoPlan" AS ENUM ('PLANEADO', 'ACEPTADO', 'REALIZADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('ABIERTA', 'PAGADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "Responsable" AS ENUM ('PACIENTE', 'DOCTOR', 'CONVENIO');

-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoLab" AS ENUM ('PENDIENTE', 'ENVIADO', 'RECIBIDO', 'ENTREGADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "PlanTratamientoItem" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "diente" INTEGER,
    "superficie" TEXT,
    "descripcion" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoPlan" NOT NULL DEFAULT 'PLANEADO',
    "notas" TEXT,
    "posicion" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanTratamientoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaClinica" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "autorId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "texto" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaClinica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factura" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "pacienteId" TEXT,
    "ordenId" TEXT,
    "responsable" "Responsable" NOT NULL DEFAULT 'PACIENTE',
    "responsableId" TEXT,
    "convenio" TEXT,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'ABIERTA',
    "total" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vence" TIMESTAMP(3),
    "notas" TEXT,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaItem" (
    "id" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "valorUnitario" INTEGER NOT NULL,

    CONSTRAINT "FacturaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "medio" "MedioPago" NOT NULL DEFAULT 'EFECTIVO',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nota" TEXT,
    "registradoPorId" TEXT,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CasoLaboratorio" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "ordenId" TEXT,
    "laboratorio" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dientes" TEXT,
    "valor" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoLab" NOT NULL DEFAULT 'PENDIENTE',
    "enviado" TIMESTAMP(3),
    "entregaEsperada" TIMESTAMP(3),
    "recibido" TIMESTAMP(3),
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CasoLaboratorio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanTratamientoItem_pacienteId_idx" ON "PlanTratamientoItem"("pacienteId");

-- CreateIndex
CREATE INDEX "NotaClinica_pacienteId_fecha_idx" ON "NotaClinica"("pacienteId", "fecha");

-- CreateIndex
CREATE INDEX "Factura_organizationId_estado_idx" ON "Factura"("organizationId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_organizationId_numero_key" ON "Factura"("organizationId", "numero");

-- CreateIndex
CREATE INDEX "Pago_facturaId_idx" ON "Pago"("facturaId");

-- CreateIndex
CREATE INDEX "CasoLaboratorio_organizationId_estado_idx" ON "CasoLaboratorio"("organizationId", "estado");

-- AddForeignKey
ALTER TABLE "PlanTratamientoItem" ADD CONSTRAINT "PlanTratamientoItem_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaClinica" ADD CONSTRAINT "NotaClinica_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaItem" ADD CONSTRAINT "FacturaItem_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasoLaboratorio" ADD CONSTRAINT "CasoLaboratorio_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasoLaboratorio" ADD CONSTRAINT "CasoLaboratorio_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasoLaboratorio" ADD CONSTRAINT "CasoLaboratorio_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE SET NULL ON UPDATE CASCADE;
