-- CreateTable
CREATE TABLE "ContextoMedico" (
    "pacienteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "embarazo" BOOLEAN NOT NULL DEFAULT false,
    "semanasEmbarazo" INTEGER,
    "lactancia" BOOLEAN NOT NULL DEFAULT false,
    "anticoagulantes" BOOLEAN NOT NULL DEFAULT false,
    "anticoagulanteNombre" TEXT,
    "inr" DOUBLE PRECISION,
    "inrFecha" DATE,
    "reaccionAnestesia" BOOLEAN NOT NULL DEFAULT false,
    "detalleAnestesia" TEXT,
    "implantesMetalicos" BOOLEAN NOT NULL DEFAULT false,
    "marcapasos" BOOLEAN NOT NULL DEFAULT false,
    "claustrofobia" BOOLEAN NOT NULL DEFAULT false,
    "estudiosRecientes" TEXT,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoPorId" TEXT,

    CONSTRAINT "ContextoMedico_pkey" PRIMARY KEY ("pacienteId")
);

-- CreateTable
CREATE TABLE "AlergiaPaciente" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "gravedad" TEXT NOT NULL,
    "reaccion" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivadoEn" TIMESTAMP(3),

    CONSTRAINT "AlergiaPaciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicacionPaciente" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivadoEn" TIMESTAMP(3),

    CONSTRAINT "MedicacionPaciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnfermedadPaciente" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "critica" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivadoEn" TIMESTAMP(3),

    CONSTRAINT "EnfermedadPaciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactoEmergencia" (
    "pacienteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "parentesco" TEXT,
    "telefono" TEXT NOT NULL,
    "correo" TEXT,
    "esRepresentante" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactoEmergencia_pkey" PRIMARY KEY ("pacienteId")
);

-- CreateTable
CREATE TABLE "RepresentanteLegal" (
    "pacienteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "parentesco" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL DEFAULT 'CC',
    "numeroDocumento" TEXT,
    "telefono" TEXT NOT NULL,
    "correo" TEXT,
    "direccion" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepresentanteLegal_pkey" PRIMARY KEY ("pacienteId")
);

-- CreateTable
CREATE TABLE "Autorizacion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'DATOS',
    "finalidad" TEXT NOT NULL,
    "otorgada" BOOLEAN NOT NULL,
    "textoMostrado" TEXT,
    "version" TEXT,
    "ordenId" TEXT,
    "otorgadaEn" TIMESTAMP(3),
    "revocadaEn" TIMESTAMP(3),
    "registradoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Autorizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudTitular" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT,
    "solicitanteNombre" TEXT NOT NULL,
    "solicitanteCorreo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'RECIBIDA',
    "notas" TEXT,
    "recibidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "resueltaEn" TIMESTAMP(3),
    "registradoPorId" TEXT,

    CONSTRAINT "SolicitudTitular_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigCentro" (
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT,
    "direccion" TEXT,
    "telefono" TEXT,
    "correo" TEXT,
    "registro" TEXT,
    "logo" TEXT,
    "recordatorioHoras" INTEGER NOT NULL DEFAULT 24,

    CONSTRAINT "ConfigCentro_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "Informe" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "pacienteId" TEXT NOT NULL,
    "ordenId" TEXT,
    "estudioId" TEXT,
    "motivo" TEXT,
    "tecnica" TEXT,
    "hallazgos" TEXT NOT NULL DEFAULT '',
    "impresion" TEXT NOT NULL DEFAULT '',
    "recomendaciones" TEXT,
    "firmanteId" TEXT,
    "firmanteNombre" TEXT,
    "firmanteTarjeta" TEXT,
    "codigo" TEXT,
    "pdf" BYTEA,
    "motivoCorreccion" TEXT,
    "emitidoEn" TIMESTAMP(3),
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Informe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreferenciaContacto" (
    "pacienteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "noContactar" BOOLEAN NOT NULL DEFAULT false,
    "correo" BOOLEAN NOT NULL DEFAULT true,
    "sms" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp" BOOLEAN NOT NULL DEFAULT true,
    "tiposRechazados" TEXT[],

    CONSTRAINT "PreferenciaContacto_pkey" PRIMARY KEY ("pacienteId")
);

-- CreateTable
CREATE TABLE "Seguimiento" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "prioridad" TEXT NOT NULL DEFAULT 'NORMAL',
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "mesObjetivo" DATE NOT NULL,
    "nota" TEXT,
    "ordenId" TEXT,
    "citaId" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimoIntentoEn" TIMESTAMP(3),
    "completadoEn" TIMESTAMP(3),
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Seguimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentoContacto" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seguimientoId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "nota" TEXT,
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentoContacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensaje" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT,
    "tipo" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'CORREO',
    "destinatario" TEXT,
    "asunto" TEXT,
    "cuerpo" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'EN_COLA',
    "motivo" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "maxIntentos" INTEGER NOT NULL DEFAULT 5,
    "proximoIntento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proveedor" TEXT,
    "simulado" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "claveUnica" TEXT,
    "contexto" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoEn" TIMESTAMP(3),

    CONSTRAINT "Mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantillaMensaje" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'CORREO',
    "asunto" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlantillaMensaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContextoMedico_organizationId_idx" ON "ContextoMedico"("organizationId");

-- CreateIndex
CREATE INDEX "AlergiaPaciente_pacienteId_activo_idx" ON "AlergiaPaciente"("pacienteId", "activo");

-- CreateIndex
CREATE INDEX "MedicacionPaciente_pacienteId_activo_idx" ON "MedicacionPaciente"("pacienteId", "activo");

-- CreateIndex
CREATE INDEX "EnfermedadPaciente_pacienteId_activo_idx" ON "EnfermedadPaciente"("pacienteId", "activo");

-- CreateIndex
CREATE INDEX "ContactoEmergencia_organizationId_idx" ON "ContactoEmergencia"("organizationId");

-- CreateIndex
CREATE INDEX "RepresentanteLegal_organizationId_idx" ON "RepresentanteLegal"("organizationId");

-- CreateIndex
CREATE INDEX "Autorizacion_pacienteId_finalidad_creadoEn_idx" ON "Autorizacion"("pacienteId", "finalidad", "creadoEn");

-- CreateIndex
CREATE INDEX "Autorizacion_organizationId_idx" ON "Autorizacion"("organizationId");

-- CreateIndex
CREATE INDEX "SolicitudTitular_organizationId_estado_venceEn_idx" ON "SolicitudTitular"("organizationId", "estado", "venceEn");

-- CreateIndex
CREATE UNIQUE INDEX "Informe_codigo_key" ON "Informe"("codigo");

-- CreateIndex
CREATE INDEX "Informe_organizationId_estado_creadoEn_idx" ON "Informe"("organizationId", "estado", "creadoEn");

-- CreateIndex
CREATE INDEX "Informe_pacienteId_idx" ON "Informe"("pacienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Informe_grupoId_version_key" ON "Informe"("grupoId", "version");

-- CreateIndex
CREATE INDEX "PreferenciaContacto_organizationId_idx" ON "PreferenciaContacto"("organizationId");

-- CreateIndex
CREATE INDEX "Seguimiento_organizationId_estado_mesObjetivo_idx" ON "Seguimiento"("organizationId", "estado", "mesObjetivo");

-- CreateIndex
CREATE INDEX "Seguimiento_pacienteId_idx" ON "Seguimiento"("pacienteId");

-- CreateIndex
CREATE INDEX "IntentoContacto_seguimientoId_idx" ON "IntentoContacto"("seguimientoId");

-- CreateIndex
CREATE INDEX "Mensaje_estado_proximoIntento_idx" ON "Mensaje"("estado", "proximoIntento");

-- CreateIndex
CREATE INDEX "Mensaje_organizationId_creadoEn_idx" ON "Mensaje"("organizationId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Mensaje_organizationId_claveUnica_key" ON "Mensaje"("organizationId", "claveUnica");

-- CreateIndex
CREATE UNIQUE INDEX "PlantillaMensaje_organizationId_tipo_canal_key" ON "PlantillaMensaje"("organizationId", "tipo", "canal");
