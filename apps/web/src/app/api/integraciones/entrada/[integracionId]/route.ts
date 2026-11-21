// Webhook de entrada: el sistema externo nos avisa de cambios. Autenticado por firma HMAC (no por sesión). Ver docs/integraciones/conectores.md.
import { prisma } from "@dent-view/db";
import { z } from "zod";
import { descifrar, secretoCifrado } from "@/lib/cifrado";
import { CABECERA_FIRMA, CABECERA_MARCA, MAX_CUERPO, verificarEntrada } from "@/lib/integraciones/entrada";
import { normalizarCita, normalizarPaciente } from "@/lib/integraciones/normalizar";
import { aplicarCita, aplicarPaciente, conteosVacios } from "@/lib/integraciones/sincronizar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const respuesta = (estado: number, cuerpo: object) => Response.json(cuerpo, { status: estado, headers: { "Cache-Control": "no-store" } });
// Misma respuesta para firma inválida, integración inexistente, inactiva o sin secreto: no revela cuáles existen.
const noAutorizado = () => respuesta(401, { error: "No autorizado" });

const esquema = z.strictObject({ id: z.string().min(1).max(100), tipo: z.enum(["paciente", "cita"]), datos: z.record(z.string(), z.unknown()) });

// shortcut: contador en memoria por proceso (se reinicia al desplegar y no se comparte entre réplicas); pasar a Redis/BD si se escala a varias instancias.
const VENTANA_MS = 60_000;
const MAX_POR_VENTANA = 120;
const contadores = new Map<string, { n: number; hasta: number }>();
function limitado(llave: string, ahora = Date.now()) {
  if (contadores.size > 10_000) for (const [k, v] of contadores) if (v.hasta <= ahora) contadores.delete(k);
  const c = contadores.get(llave);
  if (!c || c.hasta <= ahora) return contadores.set(llave, { n: 1, hasta: ahora + VENTANA_MS }), false;
  return ++c.n > MAX_POR_VENTANA;
}

/** Lee el cuerpo como stream y corta al pasar MAX_CUERPO: no se confía en Content-Length. */
async function leerAcotado(req: Request): Promise<string | null> {
  if (!req.body) return "";
  const lector = req.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_CUERPO) {
      await lector.cancel().catch(() => {});
      return null;
    }
    trozos.push(value);
  }
  return Buffer.concat(trozos).toString("utf8");
}

export async function POST(req: Request, { params }: { params: Promise<{ integracionId: string }> }) {
  const { integracionId } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocida";
  if (limitado(`ip:${ip}`) || limitado(`integ:${integracionId.slice(0, 100)}`)) return respuesta(429, { error: "Demasiadas peticiones" });
  const cuerpo = await leerAcotado(req);
  if (cuerpo === null) return respuesta(413, { error: "Cuerpo demasiado grande" });

  const integ = await prisma.integracion.findUnique({ where: { id: integracionId } });
  let secreto: string | null = null;
  try {
    if (integ?.activa && integ.secretoEntrada && secretoCifrado()) secreto = descifrar(integ.secretoEntrada, secretoCifrado()!);
  } catch {
    secreto = null;
  }
  if (!integ || !secreto || !verificarEntrada({ secreto, marca: req.headers.get(CABECERA_MARCA), firma: req.headers.get(CABECERA_FIRMA), cuerpo })) return noAutorizado();

  let json: unknown;
  try {
    json = JSON.parse(cuerpo);
  } catch {
    return respuesta(400, { error: "JSON no válido" });
  }
  const e = esquema.safeParse(json);
  if (!e.success) return respuesta(400, { error: "Evento no válido" });

  // Idempotencia por id de evento: el vínculo es único por (integración, entidad, id), así que reclamar el id es atómico.
  try {
    await prisma.vinculoExterno.create({ data: { integracionId: integ.id, entidad: "evento", idInterno: "-", idExterno: e.data.id } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return respuesta(200, { ok: true, duplicado: true });
    return respuesta(500, { error: "Error interno" });
  }
  const conteos = conteosVacios();
  try {
    if (e.data.tipo === "paciente") {
      const p = normalizarPaciente(e.data.datos);
      p ? await aplicarPaciente(integ, p, conteos) : conteos.omitidos++;
    } else {
      const c = normalizarCita(e.data.datos);
      c ? await aplicarCita(integ, c, conteos) : conteos.omitidos++;
    }
    await prisma.evento.create({ data: { organizationId: integ.organizationId, tipo: "integracion.entrada", detalle: { integracionId: integ.id, proveedor: integ.proveedor, evento: e.data.tipo, ...conteos } } });
  } catch {
    // Libera el id para que el proveedor pueda reintentar el mismo evento.
    await prisma.vinculoExterno.deleteMany({ where: { integracionId: integ.id, entidad: "evento", idExterno: e.data.id } }).catch(() => {});
    return respuesta(500, { error: "Error interno" });
  }
  return respuesta(200, { ok: true });
}
