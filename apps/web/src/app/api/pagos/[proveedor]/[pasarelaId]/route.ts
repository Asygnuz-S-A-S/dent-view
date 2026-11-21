// Webhook de pasarelas de pago. Autenticado por la firma del proveedor con el secreto DEL CENTRO (no por sesión).
// El centro sale de la pasarela de la URL, nunca del payload. Ver docs/integraciones/pasarelas.md.
import { prisma } from "@dent-view/db";
import { descifrar, secretoCifrado } from "@/lib/cifrado";
import { contarPeticion } from "@/lib/api-limite";
import { leerCuerpoAcotado } from "@/lib/pagos/cuerpo";
import { type EntradaWebhook, type Llaves } from "@/lib/pagos/proveedor";
import { obtenerProveedor, proveedorDeSlug } from "@/lib/pagos/registro";
import { procesarEvento } from "@/lib/pagos/servicio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const respuesta = (estado: number, cuerpo: object) => Response.json(cuerpo, { status: estado, headers: { "Cache-Control": "no-store" } });
// Misma respuesta para pasarela inexistente, inactiva, firma inválida o sin secreto: no revela cuáles existen.
const noAutorizado = () => respuesta(401, { error: "No autorizado" });

// shortcut: contadores en memoria por proceso; con varias réplicas el tope efectivo se multiplica. Pasar a Redis al escalar.
const limites = new Map<string, { inicio: number; cuenta: number }>();

export async function POST(req: Request, { params }: { params: Promise<{ proveedor: string; pasarelaId: string }> }) {
  const { proveedor: slug, pasarelaId } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocida";
  if (!contarPeticion(limites, `ip:${ip}`, Date.now(), 120).permitido || !contarPeticion(limites, `p:${pasarelaId.slice(0, 60)}`, Date.now(), 300).permitido) return respuesta(429, { error: "Demasiadas peticiones" });
  const rawBody = await leerCuerpoAcotado(req);
  if (rawBody === null) return respuesta(413, { error: "Cuerpo demasiado grande" });

  const clave = proveedorDeSlug(slug);
  const pasarela = clave && /^[A-Za-z0-9_-]{1,40}$/.test(pasarelaId) ? await prisma.pasarelaPago.findFirst({ where: { id: pasarelaId, proveedor: clave, activa: true } }) : null;
  let llaves: Llaves | null = null;
  try {
    if (pasarela && secretoCifrado()) llaves = JSON.parse(descifrar(pasarela.llavesCifradas, secretoCifrado()!));
  } catch {
    llaves = null;
  }
  if (!clave || !pasarela || !llaves) return noAutorizado();

  const proveedor = obtenerProveedor(clave, pasarela.modo);
  const entrada: EntradaWebhook = { headers: req.headers, rawBody, query: new URL(req.url).searchParams, llaves, modo: pasarela.modo };
  if (!proveedor.verificarWebhook(entrada)) return noAutorizado();

  let payload: unknown;
  try {
    payload = (req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded") ? Object.fromEntries(new URLSearchParams(rawBody)) : JSON.parse(rawBody);
  } catch {
    return respuesta(400, { error: "Cuerpo no válido" });
  }
  try {
    const ev = await proveedor.mapearEvento(payload, entrada);
    if (!ev) return respuesta(200, { ok: true, ignorado: true });
    const r = await procesarEvento(pasarela, ev);
    return respuesta(200, { ok: true, ...(r === "duplicado" ? { duplicado: true } : {}) });
  } catch (e) {
    console.error("Webhook de pasarela falló", clave, e instanceof Error ? e.message : "error");
    return respuesta(500, { error: "Error interno" }); // el proveedor reintenta
  }
}
