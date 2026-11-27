-- Valoración virtual guiada: plantilla de captura, tomas pedidas, marcas de seguimiento y notas internas (aditiva).
ALTER TABLE "Valoracion"
  ADD COLUMN "plantillaCaptura" TEXT,
  ADD COLUMN "angulosPedidos" "AnguloMedia"[] DEFAULT ARRAY[]::"AnguloMedia"[],
  ADD COLUMN "enlaceEnviadoEn" TIMESTAMP(3),
  ADD COLUMN "ultimoAccesoEn" TIMESTAMP(3),
  ADD COLUMN "recibidaEn" TIMESTAMP(3),
  ADD COLUMN "resultadoEnviadoEn" TIMESTAMP(3),
  ADD COLUMN "recordatoriosEnviados" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ultimoRecordatorioEn" TIMESTAMP(3),
  ADD COLUMN "notasInternas" TEXT;

ALTER TABLE "ValoracionMedia" ADD COLUMN "imagenEstudioId" TEXT;

CREATE INDEX "Valoracion_estado_expiraEn_idx" ON "Valoracion"("estado", "expiraEn");

-- Backfill desde los eventos ya registrados (primera recepción, último envío de resultado) y creación como envío del enlace.
UPDATE "Valoracion" v SET "recibidaEn" = e.t
  FROM (SELECT detalle->>'valoracionId' AS vid, MIN("creadoEn") AS t FROM "Evento" WHERE tipo = 'valoracion.recibida' GROUP BY 1) e
  WHERE e.vid = v.id;
UPDATE "Valoracion" v SET "resultadoEnviadoEn" = e.t
  FROM (SELECT detalle->>'valoracionId' AS vid, MAX("creadoEn") AS t FROM "Evento" WHERE tipo = 'valoracion.resultado_enviado' GROUP BY 1) e
  WHERE e.vid = v.id;
UPDATE "Valoracion" SET "enlaceEnviadoEn" = "creadoEn" WHERE "enlaceEnviadoEn" IS NULL;
