-- AlterTable: datos del paciente propios de cada centro (se copian desde Persona y desde ahora divergen por centro)
ALTER TABLE "PacienteTenant" ADD COLUMN "nombre" TEXT,
ADD COLUMN "fechaNacimiento" TIMESTAMP(3),
ADD COLUMN "celular" TEXT,
ADD COLUMN "correo" TEXT,
ADD COLUMN "direccion" TEXT;

UPDATE "PacienteTenant" pt SET
  "nombre" = p."nombre", "fechaNacimiento" = p."fechaNacimiento", "celular" = p."celular",
  "correo" = p."correo", "direccion" = p."direccion"
FROM "Persona" p WHERE p."id" = pt."personaId";

ALTER TABLE "PacienteTenant" ALTER COLUMN "nombre" SET NOT NULL;

-- AlterTable
ALTER TABLE "Persona" ALTER COLUMN "nombre" SET DEFAULT '';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "debeCambiarClave" BOOLEAN NOT NULL DEFAULT false;
