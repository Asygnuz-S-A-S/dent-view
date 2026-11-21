-- CreateTable
CREATE TABLE "EnlaceEntrega" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "informeId" TEXT,
    "estudioUids" TEXT[],
    "destinatarioTipo" TEXT NOT NULL,
    "destinatarioNombre" TEXT,
    "destinatarioCorreo" TEXT,
    "origenId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "revocadoEn" TIMESTAMP(3),
    "accesos" INTEGER NOT NULL DEFAULT 0,
    "ultimoAccesoEn" TIMESTAMP(3),
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnlaceEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnlaceEntrega_tokenHash_key" ON "EnlaceEntrega"("tokenHash");

-- CreateIndex
CREATE INDEX "EnlaceEntrega_organizationId_pacienteId_idx" ON "EnlaceEntrega"("organizationId", "pacienteId");

-- CreateIndex
CREATE INDEX "EnlaceEntrega_informeId_idx" ON "EnlaceEntrega"("informeId");
