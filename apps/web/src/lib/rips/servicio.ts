// Generar, guardar (S3 + EnvioRips) y auditar un RIPS. Compartido por la server action y la ruta de descarga.
import { createHash, randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@dent-view/db";
import { registrarEvento } from "../eventos";
import { numeroOrden } from "../ordenes";
import { s3 } from "../s3";
import { cargarEntradaRips } from "./datos";
import { generarRips, VERSION_RIPS, type Hallazgo, type RipsJson } from "./generar";

export type ResultadoGeneracion =
  | { estado: "no_encontrada" } | { estado: "desactivado" } | { estado: "sin_almacenamiento" }
  | { estado: "incompleta"; errores: Hallazgo[]; advertencias: Hallazgo[] }
  | { estado: "ok"; errores: []; advertencias: Hallazgo[]; json: RipsJson; envioId: string; hash: string; nombre: string };

export async function generarYGuardarRips(a: { organizationId: string; actorId: string; ordenId: string }): Promise<ResultadoGeneracion> {
  const datos = await cargarEntradaRips(a.organizationId, a.ordenId);
  if (!datos) return { estado: "no_encontrada" };
  if (!datos.config?.generaRips) return { estado: "desactivado" };
  const { json, errores, advertencias } = generarRips(datos.entrada);
  if (errores.length) return { estado: "incompleta", errores, advertencias };
  const cuerpo = JSON.stringify(json, null, 2);
  const hash = createHash("sha256").update(cuerpo).digest("hex");
  const key = `tenants/${a.organizationId}/rips/${a.ordenId}/${randomUUID()}.json`;
  try {
    await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET_ESTUDIOS, Key: key, Body: cuerpo, ContentType: "application/json" }));
  } catch (e) {
    console.error("No se pudo guardar el RIPS", e);
    return { estado: "sin_almacenamiento" };
  }
  const envio = await prisma.envioRips.create({
    data: { organizationId: a.organizationId, ordenId: a.ordenId, version: VERSION_RIPS, jsonKey: key, hashJson: hash, estado: "VALIDADO_LOCAL", resultados: { advertencias }, generadoPorId: a.actorId },
  });
  await registrarEvento({ organizationId: a.organizationId, pacienteId: datos.orden.pacienteId, actorId: a.actorId, tipo: "rips.generado", detalle: { ordenId: a.ordenId, envioId: envio.id, hash, version: VERSION_RIPS } });
  return { estado: "ok", errores: [], advertencias, json, envioId: envio.id, hash, nombre: `RIPS-${numeroOrden(datos.orden.numero).slice(1)}.json` };
}
