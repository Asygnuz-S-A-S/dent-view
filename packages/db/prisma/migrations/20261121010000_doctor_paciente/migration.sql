-- CreateTable: equipo tratante registrado a mano (paciente-doctor-especialidad)
CREATE TABLE "DoctorPaciente" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "especialidad" TEXT NOT NULL,
    "desde" DATE NOT NULL,
    "nota" TEXT,
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorPaciente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DoctorPaciente_organizationId_doctorId_idx" ON "DoctorPaciente"("organizationId", "doctorId");

-- CreateIndex
CREATE INDEX "DoctorPaciente_pacienteId_idx" ON "DoctorPaciente"("pacienteId");

-- AddForeignKey
ALTER TABLE "DoctorPaciente" ADD CONSTRAINT "DoctorPaciente_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "PacienteTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
