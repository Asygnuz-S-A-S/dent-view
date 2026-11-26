// Webhook entrante de un proveedor de facturación electrónica. Autenticado por la firma del proveedor con el secreto DE LA CONEXIÓN (no por sesión).
// El centro sale de la conexión de la URL, nunca del payload. Si el proveedor no ofrece webhook firmado, la ruta responde 404.
import { prisma } from "@dent-view/db";
import { contarPeticion } from "@/lib/api-limite";
import { descifrar, secretoCifrado } from "@/lib/cifrado";
import { leerCuerpoAcotado } from "@/lib/pagos/cuerpo";
import { proveedorDeSlug } from "@/lib/fe/registro";
import { aplicarEventoWebhook } from "@/lib/fe/servicio";
import type { EntradaWebhook, Llaves } from "@/lib/fe/proveedor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const respuesta = (estado: number, cuerpo: object) => Response.json(cuerpo, { status: estado, headers: { "Cache-Control": "no-store" } });
const noAutorizado = () => respuesta(401, { error: "No autorizado" }); // misma respuesta para conexión inexistente, inactiva o firma inválida
// shortcut: contadores en memoria por proceso; con varias réplicas el tope efectivo se multiplica. Pasar a Redis al escalar.
const limites = new Map<string, { inicio: number; cuenta: number }>();

export async function POST(req: Request, { params }: { params: Promise<{ proveedor: string; conexionId: string }> }) {
  const { proveedor: slug, conexionId } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocida";
  if (!contarPeticion(limites, `ip:${ip}`, Date.now(), 120).permitido || !contarPeticion(limites, `c:${conexionId.slice(0, 60)}`, Date.now(), 300).permitido) return respuesta(429, { error: "Demasiadas peticiones" });
  const rawBody = await leerCuerpoAcotado(req);
  if (rawBody === null) return respuesta(413, { error: "Cuerpo demasiado grande" });

  const proveedor = proveedorDeSlug(slug);
  if (proveedor && (!proveedor.verificarWebhook || !proveedor.mapearEvento)) return respuesta(404, { error: "Este proveedor no usa webhook" });
  const conexion = proveedor && /^[A-Za-z0-9_-]{1,40}$/.test(conexionId) ? await prisma.conexionFE.findFirst({ where: { id: conexionId, proveedor: proveedor.clave, activa: true } }) : null;
  let llaves: Llaves | null = null;
  try {
    if (conexion && secretoCifrado()) llaves = JSON.parse(descifrar(conexion.credencialesCifradas, secretoCifrado()!));
  } catch {
    llaves = null;
  }
  if (!proveedor || !conexion || !llaves) return noAutorizado();
  const entrada: EntradaWebhook = { headers: req.headers, rawBody, llaves, modo: conexion.modo };
  if (!proveedor.verificarWebhook!(entrada)) return noAutorizado();

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return respuesta(400, { error: "Cuerpo no válido" });
  }
  try {
    const ev = proveedor.mapearEvento!(payload, entrada);
    if (!ev) return respuesta(200, { ok: true, ignorado: true });
    const r = await aplicarEventoWebhook(conexion, ev);
    return respuesta(200, { ok: true, ...(r === "duplicado" ? { duplicado: true } : {}) });
  } catch (e) {
    console.error("Webhook FE falló", proveedor.clave, e instanceof Error ? e.message : "error");
    return respuesta(500, { error: "Error interno" }); // el proveedor reintenta
  }
}
