-- Tipo de centro, imágenes no DICOM, seguimiento de doctores y pasarelas de pago (generada con prisma migrate diff, revisada a mano)
CREATE TYPE "OrigenCaptura" AS ENUM ('IMAGEN', 'DICOM');

-- CreateEnum
CREATE TYPE "ProveedorPasarela" AS ENUM ('WOMPI', 'EPAYCO', 'PAYU', 'MERCADOPAGO', 'BOLD');

-- CreateEnum
CREATE TYPE "ModoPasarela" AS ENUM ('SANDBOX', 'PRODUCCION');

-- CreateEnum
CREATE TYPE "EstadoLinkPago" AS ENUM ('CREADO', 'PENDIENTE', 'APROBADO', 'RECHAZADO', 'EXPIRADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "TipoCentro" AS ENUM ('CENTRO_RADIOLOGICO', 'CENTRO_ODONTOLOGICO', 'CLINICA_ODONTOLOGICA', 'ODONTOLOGO_PARTICULAR');

-- CreateEnum
CREATE TYPE "EstadoSeguimientoDoctor" AS ENUM ('PENDIENTE', 'CONTACTADO', 'PROGRAMADO', 'RECUPERADO', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "MotivoSeguimientoDoctor" AS ENUM ('SIN_REMISIONES', 'CAIDA_FRECUENCIA', 'NUEVO', 'OTRO');

-- CreateEnum
CREATE TYPE "CanalContactoDoctor" AS ENUM ('LLAMADA', 'VISITA', 'CORREO', 'WHATSAPP');

-- AlterEnum
ALTER TYPE "MedioPago" ADD VALUE 'PASARELA';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "esOdontologo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "linkPagoId" TEXT,
ADD COLUMN     "referenciaExterna" TEXT;

-- AlterTable
ALTER TABLE "ConfigCentro" ADD COLUMN     "tipoCentro" "TipoCentro" NOT NULL DEFAULT 'CENTRO_RADIOLOGICO';

-- CreateTable
CREATE TABLE "ImagenEstudio" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "estudioId" TEXT,
    "ordenId" TEXT,
    "claveS3" TEXT NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "ancho" INTEGER,
    "alto" INTEGER,
    "titulo" TEXT,
    "subidoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImagenEstudio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InformeImagen" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "informeId" TEXT NOT NULL,
    "origen" "OrigenCaptura" NOT NULL,
    "imagenId" TEXT,
    "estudioUid" TEXT,
    "serieUid" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "leyenda" TEXT,

    CONSTRAINT "InformeImagen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasarelaPago" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "proveedor" "ProveedorPasarela" NOT NULL,
    "modo" "ModoPasarela" NOT NULL DEFAULT 'SANDBOX',
    "llavesCifradas" TEXT NOT NULL,
    "webhookSecretCifrado" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasarelaPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkPago" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pasarelaId" TEXT NOT NULL,
    "facturaId" TEXT,
    "citaId" TEXT,
    "referencia" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "estado" "EstadoLinkPago" NOT NULL DEFAULT 'CREADO',
    "urlPago" TEXT,
    "idExterno" TEXT,
    "expiraEn" TIMESTAMP(3),
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagadoEn" TIMESTAMP(3),

    CONSTRAINT "LinkPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoPasarela" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "proveedor" "ProveedorPasarela" NOT NULL,
    "idEventoExterno" TEXT NOT NULL,
    "payload" JSONB,
    "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesadoEn" TIMESTAMP(3),

    CONSTRAINT "EventoPasarela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigSeguimientoDoctor" (
    "organizationId" TEXT NOT NULL,
    "umbralRiesgoFactor" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "diasInactivo" INTEGER NOT NULL DEFAULT 60,
    "diasInactivoCritico" INTEGER NOT NULL DEFAULT 90,

    CONSTRAINT "ConfigSeguimientoDoctor_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "SeguimientoDoctor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "estado" "EstadoSeguimientoDoctor" NOT NULL DEFAULT 'PENDIENTE',
    "motivo" "MotivoSeguimientoDoctor" NOT NULL,
    "responsableId" TEXT,
    "proximoContacto" TIMESTAMP(3),
    "nota" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradoEn" TIMESTAMP(3),

    CONSTRAINT "SeguimientoDoctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactoDoctor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "seguimientoId" TEXT,
    "canal" "CanalContactoDoctor" NOT NULL,
    "resultado" TEXT,
    "nota" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registradoPorId" TEXT,

    CONSTRAINT "ContactoDoctor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImagenEstudio_organizationId_pacienteId_idx" ON "ImagenEstudio"("organizationId", "pacienteId");

-- CreateIndex
CREATE INDEX "ImagenEstudio_estudioId_idx" ON "ImagenEstudio"("estudioId");

-- CreateIndex
CREATE INDEX "ImagenEstudio_ordenId_idx" ON "ImagenEstudio"("ordenId");

-- CreateIndex
CREATE INDEX "InformeImagen_informeId_orden_idx" ON "InformeImagen"("informeId", "orden");

-- CreateIndex
CREATE INDEX "InformeImagen_organizationId_idx" ON "InformeImagen"("organizationId");

-- CreateIndex
CREATE INDEX "InformeImagen_imagenId_idx" ON "InformeImagen"("imagenId");

-- CreateIndex
CREATE UNIQUE INDEX "PasarelaPago_organizationId_proveedor_key" ON "PasarelaPago"("organizationId", "proveedor");

-- CreateIndex
CREATE UNIQUE INDEX "LinkPago_referencia_key" ON "LinkPago"("referencia");

-- CreateIndex
CREATE INDEX "LinkPago_organizationId_estado_idx" ON "LinkPago"("organizationId", "estado");

-- CreateIndex
CREATE INDEX "LinkPago_pasarelaId_idx" ON "LinkPago"("pasarelaId");

-- CreateIndex
CREATE INDEX "LinkPago_facturaId_idx" ON "LinkPago"("facturaId");

-- CreateIndex
CREATE INDEX "LinkPago_citaId_idx" ON "LinkPago"("citaId");

-- CreateIndex
CREATE INDEX "EventoPasarela_organizationId_recibidoEn_idx" ON "EventoPasarela"("organizationId", "recibidoEn");

-- CreateIndex
CREATE UNIQUE INDEX "EventoPasarela_proveedor_idEventoExterno_key" ON "EventoPasarela"("proveedor", "idEventoExterno");

-- CreateIndex
CREATE INDEX "SeguimientoDoctor_organizationId_estado_idx" ON "SeguimientoDoctor"("organizationId", "estado");

-- CreateIndex
CREATE INDEX "SeguimientoDoctor_organizationId_doctorId_idx" ON "SeguimientoDoctor"("organizationId", "doctorId");

-- CreateIndex
CREATE INDEX "ContactoDoctor_organizationId_doctorId_fecha_idx" ON "ContactoDoctor"("organizationId", "doctorId", "fecha");

-- CreateIndex
CREATE INDEX "ContactoDoctor_seguimientoId_idx" ON "ContactoDoctor"("seguimientoId");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_linkPagoId_key" ON "Pago"("linkPagoId");

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_linkPagoId_fkey" FOREIGN KEY ("linkPagoId") REFERENCES "LinkPago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagenEstudio" ADD CONSTRAINT "ImagenEstudio_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagenEstudio" ADD CONSTRAINT "ImagenEstudio_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagenEstudio" ADD CONSTRAINT "ImagenEstudio_estudioId_fkey" FOREIGN KEY ("estudioId") REFERENCES "Estudio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagenEstudio" ADD CONSTRAINT "ImagenEstudio_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformeImagen" ADD CONSTRAINT "InformeImagen_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformeImagen" ADD CONSTRAINT "InformeImagen_informeId_fkey" FOREIGN KEY ("informeId") REFERENCES "Informe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformeImagen" ADD CONSTRAINT "InformeImagen_imagenId_fkey" FOREIGN KEY ("imagenId") REFERENCES "ImagenEstudio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasarelaPago" ADD CONSTRAINT "PasarelaPago_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkPago" ADD CONSTRAINT "LinkPago_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkPago" ADD CONSTRAINT "LinkPago_pasarelaId_fkey" FOREIGN KEY ("pasarelaId") REFERENCES "PasarelaPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkPago" ADD CONSTRAINT "LinkPago_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkPago" ADD CONSTRAINT "LinkPago_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoPasarela" ADD CONSTRAINT "EventoPasarela_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigSeguimientoDoctor" ADD CONSTRAINT "ConfigSeguimientoDoctor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeguimientoDoctor" ADD CONSTRAINT "SeguimientoDoctor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeguimientoDoctor" ADD CONSTRAINT "SeguimientoDoctor_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactoDoctor" ADD CONSTRAINT "ContactoDoctor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactoDoctor" ADD CONSTRAINT "ContactoDoctor_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactoDoctor" ADD CONSTRAINT "ContactoDoctor_seguimientoId_fkey" FOREIGN KEY ("seguimientoId") REFERENCES "SeguimientoDoctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

