-- AlterTable: foto de perfil del paciente (clave en S3; nunca URL pública)
ALTER TABLE "PacienteTenant" ADD COLUMN "fotoKey" TEXT;
