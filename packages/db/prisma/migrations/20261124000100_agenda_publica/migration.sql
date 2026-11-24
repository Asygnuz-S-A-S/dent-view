-- Autoagendamiento público: horarios, configuración, reservas y campos nuevos de Servicio/Cita.
-- (Esta migración también añade la restricción de no cruce de citas; el SQL de tablas va primero.)
-- CreateEnum
CREATE TYPE "AnticipoTipo" AS ENUM ('NINGUNO', 'FIJO', 'PORCENTAJE');

-- CreateEnum
CREATE TYPE "OrigenCita" AS ENUM ('INTERNA', 'PUBLICA', 'API');

-- CreateEnum
CREATE TYPE "EstadoReservaPublica" AS ENUM ('PENDIENTE_CODIGO', 'PENDIENTE_ORDEN', 'PENDIENTE_PAGO', 'CONFIRMADA', 'RECHAZADA', 'EXPIRADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "Servicio" ADD COLUMN     "anticipoTipo" "AnticipoTipo" NOT NULL DEFAULT 'NINGUNO',
ADD COLUMN     "anticipoValor" INTEGER,
ADD COLUMN     "duracionMin" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "holguraMin" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requiereOrden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reservableEnLinea" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Cita" ADD COLUMN     "cruceHistorico" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origen" "OrigenCita" NOT NULL DEFAULT 'INTERNA',
ADD COLUMN     "profesionalId" TEXT,
ADD COLUMN     "servicioId" TEXT;

-- CreateTable
CREATE TABLE "HorarioAtencion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salaId" TEXT,
    "profesionalId" TEXT,
    "diaSemana" INTEGER NOT NULL,
    "inicioMin" INTEGER NOT NULL,
    "finMin" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HorarioAtencion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExcepcionHorario" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salaId" TEXT,
    "profesionalId" TEXT,
    "fecha" DATE NOT NULL,
    "cerrado" BOOLEAN NOT NULL DEFAULT true,
    "inicioMin" INTEGER,
    "finMin" INTEGER,
    "motivo" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExcepcionHorario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigAgendaPublica" (
    "organizationId" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "horasMinAnticipacion" INTEGER NOT NULL DEFAULT 2,
    "diasVentana" INTEGER NOT NULL DEFAULT 30,
    "horasMinCancelar" INTEGER NOT NULL DEFAULT 24,
    "mensajeBienvenida" TEXT,
    "versionPolitica" TEXT,
    "captchaActivo" BOOLEAN NOT NULL DEFAULT false,
    "anticipoReembolsable" BOOLEAN NOT NULL DEFAULT true,
    "horasLimiteReembolso" INTEGER NOT NULL DEFAULT 24,
    "retieneSiNoAsiste" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ConfigAgendaPublica_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "ServicioSala" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "salaId" TEXT NOT NULL,

    CONSTRAINT "ServicioSala_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicioProfesional" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "profesionalId" TEXT NOT NULL,

    CONSTRAINT "ServicioProfesional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservaPublica" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "estado" "EstadoReservaPublica" NOT NULL DEFAULT 'PENDIENTE_CODIGO',
    "servicioId" TEXT NOT NULL,
    "salaId" TEXT NOT NULL,
    "profesionalId" TEXT,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL DEFAULT 'CC',
    "numeroDocumento" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "celular" TEXT,
    "tokenGestionHash" TEXT NOT NULL,
    "codigoHash" TEXT,
    "codigoExpiraEn" TIMESTAMP(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "consentimientoDatos" BOOLEAN NOT NULL DEFAULT false,
    "consentimientoMercadeo" BOOLEAN NOT NULL DEFAULT false,
    "consentimientoEn" TIMESTAMP(3),
    "versionPolitica" TEXT,
    "ordenArchivoKey" TEXT,
    "ordenId" TEXT,
    "citaId" TEXT,
    "leadId" TEXT,
    "pacienteId" TEXT,
    "ipHash" TEXT,
    "motivoRechazo" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservaPublica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HorarioAtencion_organizationId_diaSemana_idx" ON "HorarioAtencion"("organizationId", "diaSemana");

-- CreateIndex
CREATE INDEX "HorarioAtencion_salaId_idx" ON "HorarioAtencion"("salaId");

-- CreateIndex
CREATE INDEX "HorarioAtencion_profesionalId_idx" ON "HorarioAtencion"("profesionalId");

-- CreateIndex
CREATE INDEX "ExcepcionHorario_organizationId_fecha_idx" ON "ExcepcionHorario"("organizationId", "fecha");

-- CreateIndex
CREATE INDEX "ServicioSala_organizationId_idx" ON "ServicioSala"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ServicioSala_servicioId_salaId_key" ON "ServicioSala"("servicioId", "salaId");

-- CreateIndex
CREATE INDEX "ServicioProfesional_organizationId_idx" ON "ServicioProfesional"("organizationId");

-- CreateIndex
CREATE INDEX "ServicioProfesional_profesionalId_idx" ON "ServicioProfesional"("profesionalId");

-- CreateIndex
CREATE UNIQUE INDEX "ServicioProfesional_servicioId_profesionalId_key" ON "ServicioProfesional"("servicioId", "profesionalId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservaPublica_tokenGestionHash_key" ON "ReservaPublica"("tokenGestionHash");

-- CreateIndex
CREATE UNIQUE INDEX "ReservaPublica_citaId_key" ON "ReservaPublica"("citaId");

-- CreateIndex
CREATE INDEX "ReservaPublica_organizationId_estado_idx" ON "ReservaPublica"("organizationId", "estado");

-- CreateIndex
CREATE INDEX "ReservaPublica_organizationId_inicio_idx" ON "ReservaPublica"("organizationId", "inicio");

-- CreateIndex
CREATE INDEX "ReservaPublica_organizationId_ipHash_creadoEn_idx" ON "ReservaPublica"("organizationId", "ipHash", "creadoEn");

-- CreateIndex
CREATE INDEX "ReservaPublica_organizationId_correo_creadoEn_idx" ON "ReservaPublica"("organizationId", "correo", "creadoEn");

-- CreateIndex
CREATE INDEX "ReservaPublica_organizationId_numeroDocumento_creadoEn_idx" ON "ReservaPublica"("organizationId", "numeroDocumento", "creadoEn");

-- CreateIndex
CREATE INDEX "Cita_profesionalId_inicio_idx" ON "Cita"("profesionalId", "inicio");

-- AddForeignKey
ALTER TABLE "HorarioAtencion" ADD CONSTRAINT "HorarioAtencion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioAtencion" ADD CONSTRAINT "HorarioAtencion_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcepcionHorario" ADD CONSTRAINT "ExcepcionHorario_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcepcionHorario" ADD CONSTRAINT "ExcepcionHorario_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigAgendaPublica" ADD CONSTRAINT "ConfigAgendaPublica_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicioSala" ADD CONSTRAINT "ServicioSala_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicioSala" ADD CONSTRAINT "ServicioSala_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicioSala" ADD CONSTRAINT "ServicioSala_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicioProfesional" ADD CONSTRAINT "ServicioProfesional_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicioProfesional" ADD CONSTRAINT "ServicioProfesional_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaPublica" ADD CONSTRAINT "ReservaPublica_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaPublica" ADD CONSTRAINT "ReservaPublica_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaPublica" ADD CONSTRAINT "ReservaPublica_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaPublica" ADD CONSTRAINT "ReservaPublica_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaPublica" ADD CONSTRAINT "ReservaPublica_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaPublica" ADD CONSTRAINT "ReservaPublica_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaPublica" ADD CONSTRAINT "ReservaPublica_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- No cruce de citas (btree_gist). tstzrange(inicio, fin) es [) : una cita puede empezar justo cuando otra termina.
-- Las citas CANCELADA y NO_ASISTIO no ocupan el hueco.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Datos existentes: si ya hay citas activas que se cruzan en la misma sala, la más reciente de cada cruce
-- se marca como cruceHistorico y queda FUERA de la restricción (no se borra ni se cambia nada más).
UPDATE "Cita" b SET "cruceHistorico" = true
WHERE b.estado NOT IN ('CANCELADA', 'NO_ASISTIO') AND b.fin > b.inicio
  AND EXISTS (
    SELECT 1 FROM "Cita" a
    WHERE a.id <> b.id AND a."salaId" = b."salaId"
      AND a.estado NOT IN ('CANCELADA', 'NO_ASISTIO') AND a.fin > a.inicio
      AND (a.inicio, a.id) < (b.inicio, b.id)
      AND a.inicio < b.fin AND b.inicio < a.fin
  );

-- Citas con fin <= inicio (datos inválidos) tampoco entran: tstzrange fallaría con fin < inicio.
UPDATE "Cita" SET "cruceHistorico" = true WHERE fin <= inicio;

ALTER TABLE "Cita" ADD CONSTRAINT "Cita_sin_cruce_sala" EXCLUDE USING gist (
  "salaId" WITH =, tstzrange(inicio, fin) WITH &&
) WHERE (estado NOT IN ('CANCELADA', 'NO_ASISTIO') AND NOT "cruceHistorico");

ALTER TABLE "Cita" ADD CONSTRAINT "Cita_sin_cruce_profesional" EXCLUDE USING gist (
  "profesionalId" WITH =, tstzrange(inicio, fin) WITH &&
) WHERE ("profesionalId" IS NOT NULL AND estado NOT IN ('CANCELADA', 'NO_ASISTIO') AND NOT "cruceHistorico");
