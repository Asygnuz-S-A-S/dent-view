-- Valoración virtual (teleodontología), CRM (leads, secuencias, tareas), fidelización (generada con prisma migrate diff desde el esquema anterior, revisada a mano)
-- CreateEnum
CREATE TYPE "EtapaLead" AS ENUM ('NUEVO', 'CONTACTADO', 'VALORACION_AGENDADA', 'VALORACION_REALIZADA', 'PROPUESTA', 'GANADO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "TipoActividad" AS ENUM ('NOTA', 'LLAMADA', 'CORREO', 'WHATSAPP', 'VISITA', 'CAMBIO_ETAPA', 'VALORACION', 'AUTOMATICA', 'TAREA');

-- CreateEnum
CREATE TYPE "DisparadorSecuencia" AS ENUM ('LEAD_NUEVO', 'LEAD_SIN_RESPUESTA', 'VALORACION_COMPLETADA', 'ORDEN_ENTREGADA', 'TRATAMIENTO_TERMINADO', 'PACIENTE_INACTIVO', 'CUMPLEANOS', 'CONTROL_PERIODICO', 'MANUAL');

-- CreateEnum
CREATE TYPE "AccionPaso" AS ENUM ('CORREO', 'TAREA', 'CAMBIAR_ETAPA', 'FINALIZAR');

-- CreateEnum
CREATE TYPE "EstadoInscripcion" AS ENUM ('ACTIVA', 'COMPLETADA', 'PAUSADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoEjecucion" AS ENUM ('ENVIADO', 'FALLIDO', 'OMITIDO', 'TAREA_CREADA');

-- CreateEnum
CREATE TYPE "EstadoTarea" AS ENUM ('PENDIENTE', 'HECHA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoValoracion" AS ENUM ('BORRADOR', 'PENDIENTE_PACIENTE', 'RECIBIDA', 'EN_REVISION', 'REQUIERE_MAS_INFO', 'COMPLETADA', 'CANCELADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "TipoMedia" AS ENUM ('FOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "AnguloMedia" AS ENUM ('FRONTAL_REPOSO', 'SONRISA', 'LATERAL_DERECHA', 'LATERAL_IZQUIERDA', 'OCLUSAL_SUPERIOR', 'OCLUSAL_INFERIOR', 'INTRAORAL_FRONTAL', 'INTRAORAL_DERECHA', 'INTRAORAL_IZQUIERDA', 'ZONA_DOLOR', 'RADIOGRAFIA', 'VIDEO_APERTURA', 'OTRO');

-- CreateEnum
CREATE TYPE "AutorMensaje" AS ENUM ('PACIENTE', 'PROFESIONAL');

-- AlterTable
ALTER TABLE "PacienteTenant" ADD COLUMN     "proximoControlEn" TIMESTAMP(3),
ADD COLUMN     "ultimaVisitaEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "correo" TEXT,
    "ciudad" TEXT,
    "origen" TEXT NOT NULL,
    "interes" TEXT,
    "etapa" "EtapaLead" NOT NULL DEFAULT 'NUEVO',
    "valorEstimado" INTEGER,
    "responsableId" TEXT,
    "pacienteId" TEXT,
    "proximoContacto" TIMESTAMP(3),
    "ultimoContactoEn" TIMESTAMP(3),
    "motivoPerdida" TEXT,
    "consentimientoMercadeo" BOOLEAN NOT NULL DEFAULT false,
    "consentimientoEn" TIMESTAMP(3),
    "noContactar" BOOLEAN NOT NULL DEFAULT false,
    "cerradoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActividadLead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT,
    "pacienteId" TEXT,
    "tipo" "TipoActividad" NOT NULL,
    "texto" TEXT,
    "autorId" TEXT,
    "automatica" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActividadLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecuenciaCRM" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "disparador" "DisparadorSecuencia" NOT NULL,
    "diasInactividad" INTEGER,
    "filtro" JSONB,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "creadaPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecuenciaCRM_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasoSecuencia" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "secuenciaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "esperaDias" INTEGER NOT NULL DEFAULT 0,
    "esperaHoras" INTEGER NOT NULL DEFAULT 0,
    "accion" "AccionPaso" NOT NULL,
    "asunto" TEXT,
    "cuerpo" TEXT,
    "etapaDestino" "EtapaLead",
    "tareaTitulo" TEXT,

    CONSTRAINT "PasoSecuencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InscripcionSecuencia" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "secuenciaId" TEXT NOT NULL,
    "leadId" TEXT,
    "pacienteId" TEXT,
    "valoracionId" TEXT,
    "claveUnica" TEXT NOT NULL,
    "estado" "EstadoInscripcion" NOT NULL DEFAULT 'ACTIVA',
    "pasoActual" INTEGER NOT NULL DEFAULT 0,
    "proximaEjecucion" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEn" TIMESTAMP(3),
    "motivoFin" TEXT,

    CONSTRAINT "InscripcionSecuencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EjecucionPaso" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inscripcionId" TEXT NOT NULL,
    "pasoId" TEXT,
    "estado" "EstadoEjecucion" NOT NULL,
    "detalle" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EjecucionPaso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TareaCRM" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT,
    "pacienteId" TEXT,
    "titulo" TEXT NOT NULL,
    "vence" TIMESTAMP(3),
    "asignadoId" TEXT,
    "estado" "EstadoTarea" NOT NULL DEFAULT 'PENDIENTE',
    "automatica" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completadaEn" TIMESTAMP(3),

    CONSTRAINT "TareaCRM_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigFidelizacion" (
    "organizationId" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "diasControl" INTEGER NOT NULL DEFAULT 180,
    "recordarCumpleanos" BOOLEAN NOT NULL DEFAULT true,
    "mensajeCumpleanos" TEXT,

    CONSTRAINT "ConfigFidelizacion_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "Valoracion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT,
    "leadId" TEXT,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "correo" TEXT,
    "ciudad" TEXT,
    "motivo" TEXT NOT NULL,
    "cuestionario" JSONB,
    "estado" "EstadoValoracion" NOT NULL DEFAULT 'PENDIENTE_PACIENTE',
    "doctorId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "codigoHash" TEXT,
    "intentosCodigo" INTEGER NOT NULL DEFAULT 0,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "consentimientoEn" TIMESTAMP(3),
    "consentimientoVersion" TEXT,
    "consentimientoIp" TEXT,
    "diagnosticoPreliminar" TEXT,
    "recomendaciones" TEXT,
    "requierePresencial" BOOLEAN NOT NULL DEFAULT false,
    "presupuestoEstimado" INTEGER,
    "tratamientoSugerido" TEXT,
    "completadaEn" TIMESTAMP(3),
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Valoracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValoracionMedia" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "valoracionId" TEXT NOT NULL,
    "tipo" "TipoMedia" NOT NULL,
    "angulo" "AnguloMedia" NOT NULL,
    "claveS3" TEXT NOT NULL,
    "claveMiniatura" TEXT,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "duracionSeg" INTEGER,
    "ancho" INTEGER,
    "alto" INTEGER,
    "nota" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValoracionMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValoracionMensaje" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "valoracionId" TEXT NOT NULL,
    "autor" "AutorMensaje" NOT NULL,
    "autorId" TEXT,
    "texto" TEXT NOT NULL,
    "solicitaMedia" "AnguloMedia",
    "leidoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValoracionMensaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_organizationId_etapa_idx" ON "Lead"("organizationId", "etapa");

-- CreateIndex
CREATE INDEX "Lead_organizationId_responsableId_idx" ON "Lead"("organizationId", "responsableId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_proximoContacto_idx" ON "Lead"("organizationId", "proximoContacto");

-- CreateIndex
CREATE INDEX "ActividadLead_leadId_creadoEn_idx" ON "ActividadLead"("leadId", "creadoEn");

-- CreateIndex
CREATE INDEX "ActividadLead_pacienteId_creadoEn_idx" ON "ActividadLead"("pacienteId", "creadoEn");

-- CreateIndex
CREATE INDEX "ActividadLead_organizationId_idx" ON "ActividadLead"("organizationId");

-- CreateIndex
CREATE INDEX "SecuenciaCRM_organizationId_activa_disparador_idx" ON "SecuenciaCRM"("organizationId", "activa", "disparador");

-- CreateIndex
CREATE INDEX "PasoSecuencia_organizationId_idx" ON "PasoSecuencia"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PasoSecuencia_secuenciaId_orden_key" ON "PasoSecuencia"("secuenciaId", "orden");

-- CreateIndex
CREATE INDEX "InscripcionSecuencia_estado_proximaEjecucion_idx" ON "InscripcionSecuencia"("estado", "proximaEjecucion");

-- CreateIndex
CREATE INDEX "InscripcionSecuencia_organizationId_idx" ON "InscripcionSecuencia"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "InscripcionSecuencia_secuenciaId_claveUnica_key" ON "InscripcionSecuencia"("secuenciaId", "claveUnica");

-- CreateIndex
CREATE INDEX "EjecucionPaso_inscripcionId_creadoEn_idx" ON "EjecucionPaso"("inscripcionId", "creadoEn");

-- CreateIndex
CREATE INDEX "EjecucionPaso_organizationId_idx" ON "EjecucionPaso"("organizationId");

-- CreateIndex
CREATE INDEX "TareaCRM_organizationId_estado_vence_idx" ON "TareaCRM"("organizationId", "estado", "vence");

-- CreateIndex
CREATE INDEX "TareaCRM_asignadoId_estado_idx" ON "TareaCRM"("asignadoId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Valoracion_tokenHash_key" ON "Valoracion"("tokenHash");

-- CreateIndex
CREATE INDEX "Valoracion_organizationId_estado_idx" ON "Valoracion"("organizationId", "estado");

-- CreateIndex
CREATE INDEX "Valoracion_organizationId_doctorId_idx" ON "Valoracion"("organizationId", "doctorId");

-- CreateIndex
CREATE INDEX "Valoracion_pacienteId_idx" ON "Valoracion"("pacienteId");

-- CreateIndex
CREATE INDEX "Valoracion_leadId_idx" ON "Valoracion"("leadId");

-- CreateIndex
CREATE INDEX "ValoracionMedia_valoracionId_idx" ON "ValoracionMedia"("valoracionId");

-- CreateIndex
CREATE INDEX "ValoracionMedia_organizationId_idx" ON "ValoracionMedia"("organizationId");

-- CreateIndex
CREATE INDEX "ValoracionMensaje_valoracionId_creadoEn_idx" ON "ValoracionMensaje"("valoracionId", "creadoEn");

-- CreateIndex
CREATE INDEX "ValoracionMensaje_organizationId_idx" ON "ValoracionMensaje"("organizationId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActividadLead" ADD CONSTRAINT "ActividadLead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActividadLead" ADD CONSTRAINT "ActividadLead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActividadLead" ADD CONSTRAINT "ActividadLead_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecuenciaCRM" ADD CONSTRAINT "SecuenciaCRM_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasoSecuencia" ADD CONSTRAINT "PasoSecuencia_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasoSecuencia" ADD CONSTRAINT "PasoSecuencia_secuenciaId_fkey" FOREIGN KEY ("secuenciaId") REFERENCES "SecuenciaCRM"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionSecuencia" ADD CONSTRAINT "InscripcionSecuencia_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionSecuencia" ADD CONSTRAINT "InscripcionSecuencia_secuenciaId_fkey" FOREIGN KEY ("secuenciaId") REFERENCES "SecuenciaCRM"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionSecuencia" ADD CONSTRAINT "InscripcionSecuencia_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionSecuencia" ADD CONSTRAINT "InscripcionSecuencia_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionSecuencia" ADD CONSTRAINT "InscripcionSecuencia_valoracionId_fkey" FOREIGN KEY ("valoracionId") REFERENCES "Valoracion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EjecucionPaso" ADD CONSTRAINT "EjecucionPaso_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EjecucionPaso" ADD CONSTRAINT "EjecucionPaso_inscripcionId_fkey" FOREIGN KEY ("inscripcionId") REFERENCES "InscripcionSecuencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EjecucionPaso" ADD CONSTRAINT "EjecucionPaso_pasoId_fkey" FOREIGN KEY ("pasoId") REFERENCES "PasoSecuencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaCRM" ADD CONSTRAINT "TareaCRM_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaCRM" ADD CONSTRAINT "TareaCRM_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaCRM" ADD CONSTRAINT "TareaCRM_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaCRM" ADD CONSTRAINT "TareaCRM_asignadoId_fkey" FOREIGN KEY ("asignadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigFidelizacion" ADD CONSTRAINT "ConfigFidelizacion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valoracion" ADD CONSTRAINT "Valoracion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valoracion" ADD CONSTRAINT "Valoracion_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valoracion" ADD CONSTRAINT "Valoracion_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valoracion" ADD CONSTRAINT "Valoracion_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValoracionMedia" ADD CONSTRAINT "ValoracionMedia_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValoracionMedia" ADD CONSTRAINT "ValoracionMedia_valoracionId_fkey" FOREIGN KEY ("valoracionId") REFERENCES "Valoracion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValoracionMensaje" ADD CONSTRAINT "ValoracionMensaje_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValoracionMensaje" ADD CONSTRAINT "ValoracionMensaje_valoracionId_fkey" FOREIGN KEY ("valoracionId") REFERENCES "Valoracion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

