-- CreateTable
CREATE TABLE "TokenApi" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "prefijo" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "permisos" TEXT[],
    "vence" TIMESTAMP(3),
    "revocadoEn" TIMESTAMP(3),
    "ultimoUso" TIMESTAMP(3),
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenApi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaveIdempotencia" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "metodoRuta" TEXT NOT NULL,
    "estadoHttp" INTEGER NOT NULL,
    "respuesta" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaveIdempotencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretoCifrado" TEXT NOT NULL,
    "eventos" TEXT[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEntrega" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codigoRespuesta" INTEGER,
    "error" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entregadoEn" TIMESTAMP(3),

    CONSTRAINT "WebhookEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integracion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "credencialesCifradas" TEXT NOT NULL,
    "config" JSONB,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "secretoEntrada" TEXT,
    "ultimaSync" TIMESTAMP(3),
    "estadoSync" TEXT,
    "errorSync" TEXT,
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Integracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VinculoExterno" (
    "id" TEXT NOT NULL,
    "integracionId" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "idInterno" TEXT NOT NULL,
    "idExterno" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VinculoExterno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenApi_tokenHash_key" ON "TokenApi"("tokenHash");

-- CreateIndex
CREATE INDEX "TokenApi_organizationId_idx" ON "TokenApi"("organizationId");

-- CreateIndex
CREATE INDEX "ClaveIdempotencia_creadoEn_idx" ON "ClaveIdempotencia"("creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "ClaveIdempotencia_organizationId_clave_key" ON "ClaveIdempotencia"("organizationId", "clave");

-- CreateIndex
CREATE INDEX "Webhook_organizationId_idx" ON "Webhook"("organizationId");

-- CreateIndex
CREATE INDEX "WebhookEntrega_estado_proximoIntento_idx" ON "WebhookEntrega"("estado", "proximoIntento");

-- CreateIndex
CREATE INDEX "WebhookEntrega_webhookId_creadoEn_idx" ON "WebhookEntrega"("webhookId", "creadoEn");

-- CreateIndex
CREATE INDEX "Integracion_organizationId_idx" ON "Integracion"("organizationId");

-- CreateIndex
CREATE INDEX "VinculoExterno_integracionId_entidad_idInterno_idx" ON "VinculoExterno"("integracionId", "entidad", "idInterno");

-- CreateIndex
CREATE UNIQUE INDEX "VinculoExterno_integracionId_entidad_idExterno_key" ON "VinculoExterno"("integracionId", "entidad", "idExterno");

-- AddForeignKey
ALTER TABLE "TokenApi" ADD CONSTRAINT "TokenApi_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEntrega" ADD CONSTRAINT "WebhookEntrega_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integracion" ADD CONSTRAINT "Integracion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoExterno" ADD CONSTRAINT "VinculoExterno_integracionId_fkey" FOREIGN KEY ("integracionId") REFERENCES "Integracion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
