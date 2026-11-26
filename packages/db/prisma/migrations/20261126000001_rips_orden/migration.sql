-- CreateEnum
CREATE TYPE "TipoRips" AS ENUM ('CONSULTA', 'PROCEDIMIENTO', 'OTRO_SERVICIO');

-- AlterTable
ALTER TABLE "PacienteTenant" ADD COLUMN     "aseguradoraNit" TEXT,
ADD COLUMN     "codMunicipio" VARCHAR(5),
ADD COLUMN     "codPaisOrigen" TEXT DEFAULT '170',
ADD COLUMN     "codPaisResidencia" TEXT DEFAULT '170',
ADD COLUMN     "sexo" TEXT,
ADD COLUMN     "tipoUsuarioDefecto" TEXT,
ADD COLUMN     "zonaTerritorial" TEXT;

-- AlterTable
ALTER TABLE "Servicio" ADD COLUMN     "codServicioReps" INTEGER,
ADD COLUMN     "codigoCups" VARCHAR(6),
ADD COLUMN     "tipoRips" "TipoRips" NOT NULL DEFAULT 'PROCEDIMIENTO';

-- AlterTable
ALTER TABLE "Orden" ADD COLUMN     "causaMotivoAtencion" TEXT,
ADD COLUMN     "diagnosticoPrincipal" VARCHAR(4),
ADD COLUMN     "diagnosticosRelacionados" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "finalidad" TEXT,
ADD COLUMN     "numAutorizacion" TEXT,
ADD COLUMN     "profesionalAtiendeId" TEXT,
ADD COLUMN     "ripsActualizadoEn" TIMESTAMP(3),
ADD COLUMN     "tipoDiagnostico" TEXT,
ADD COLUMN     "tipoUsuario" TEXT,
ADD COLUMN     "viaIngreso" TEXT;

-- AlterTable
ALTER TABLE "OrdenItem" ADD COLUMN     "codigoCups" VARCHAR(6),
ADD COLUMN     "diagnostico" VARCHAR(4),
ADD COLUMN     "finalidad" TEXT,
ADD COLUMN     "tipoRips" "TipoRips" NOT NULL DEFAULT 'PROCEDIMIENTO';

