"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cifrar, descifrar, secretoCifrado } from "@/lib/cifrado";
import { ErrorPasarela, type Llaves } from "@/lib/pagos/proveedor";
import { ADAPTADORES, esProveedor, obtenerProveedor } from "@/lib/pagos/registro";
import { conciliarLinks } from "@/lib/pagos/servicio";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

type R = { error?: string };
const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const modoSchema = z.enum(["SANDBOX", "PRODUCCION"]);
const llavesSchema = z.record(z.string().max(40), z.string().max(500));

/** Solo administradores del centro, nunca un superadmin suplantando, siempre dentro de su centro. */
async function contexto() {
  const ctx = await exigirContexto(ADMIN);
  if (ctx.suplantadoPor) return { error: "Un superadmin dentro del centro no puede gestionar pasarelas" } as const;
  return ctx;
}
const secreto = () => {
  const s = secretoCifrado();
  if (!s) throw new Error("Falta CIFRADO_SECRETO o BETTER_AUTH_SECRET");
  return s;
};

/** Solo las claves del adaptador, todas obligatorias. */
function validarLlaves(proveedor: string, crudas: unknown): { llaves: Llaves } | { error: string } {
  if (!esProveedor(proveedor)) return { error: "Pasarela no disponible" };
  const p = llavesSchema.safeParse(crudas);
  if (!p.success) return { error: "Llaves no válidas" };
  const llaves: Llaves = {};
  for (const c of ADAPTADORES[proveedor].campos) {
    const v = (p.data[c.clave] ?? "").trim();
    if (!v) return { error: `Falta: ${c.etiqueta}` };
    llaves[c.clave] = v;
  }
  return { llaves };
}

/** Prueba con las llaves escritas o, si se dejan vacías, con las guardadas. Solo toca hosts fijos del proveedor. */
export async function probarPasarela(entrada: { proveedor: string; modo: string; pasarelaId?: string; llaves?: Record<string, string> }): Promise<R & { mensaje?: string }> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const modo = modoSchema.safeParse(entrada.modo);
  if (!modo.success || !esProveedor(entrada.proveedor)) return { error: "Pasarela no disponible" };
  let llaves: Llaves;
  let modoReal = modo.data;
  if (entrada.pasarelaId) {
    const id = idSchema.safeParse(entrada.pasarelaId);
    const p = id.success ? await prisma.pasarelaPago.findFirst({ where: { id: id.data, organizationId: ctx.organizationId, proveedor: entrada.proveedor } }) : null;
    if (!p) return { error: "Pasarela no encontrada" };
    llaves = JSON.parse(descifrar(p.llavesCifradas, secreto()));
    modoReal = p.modo;
  } else {
    const v = validarLlaves(entrada.proveedor, entrada.llaves);
    if ("error" in v) return v;
    llaves = v.llaves;
  }
  try {
    const r = await obtenerProveedor(entrada.proveedor, modoReal).probarConexion(llaves, modoReal);
    return r.ok ? { mensaje: r.mensaje } : { error: r.mensaje };
  } catch (e) {
    return { error: e instanceof ErrorPasarela ? e.message : "No se pudo probar la conexión" };
  }
}

/** Crea la pasarela o rota sus llaves (siempre se piden todas de nuevo; nunca se devuelven). */
export async function guardarPasarela(entrada: { proveedor: string; modo: string; llaves: Record<string, string> }): Promise<R & { id?: string }> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const modo = modoSchema.safeParse(entrada.modo);
  if (!modo.success || !esProveedor(entrada.proveedor)) return { error: "Pasarela no disponible" };
  const adaptador = ADAPTADORES[entrada.proveedor];
  if (modo.data === "PRODUCCION" && adaptador.bloqueadoProduccion) return { error: `${adaptador.nombre} está marcada «No probado»: solo se permite en SANDBOX hasta probarla en una cuenta real` };
  const v = validarLlaves(entrada.proveedor, entrada.llaves);
  if ("error" in v) return v;
  const org = ctx.organizationId;
  const existente = await prisma.pasarelaPago.findUnique({ where: { organizationId_proveedor: { organizationId: org, proveedor: entrada.proveedor } } });
  const llavesCifradas = cifrar(JSON.stringify(v.llaves), secreto());
  const p = existente
    ? await prisma.pasarelaPago.update({ where: { id: existente.id }, data: { modo: modo.data, llavesCifradas } })
    : await prisma.pasarelaPago.create({ data: { organizationId: org, proveedor: entrada.proveedor, modo: modo.data, llavesCifradas } });
  await prisma.evento.create({ data: { organizationId: org, actorId: ctx.usuario.id, tipo: existente ? "pasarela.llaves_rotadas" : "pasarela.creada", detalle: { pasarelaId: p.id, proveedor: p.proveedor, modo: p.modo } } });
  revalidatePath("/integraciones/pasarelas");
  return { id: p.id };
}

export async function alternarPasarela(id: string, activa: boolean): Promise<R> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const idOk = idSchema.safeParse(id);
  const activaOk = z.boolean().safeParse(activa);
  if (!idOk.success || !activaOk.success) return { error: "Identificador no válido" };
  const r = await prisma.pasarelaPago.updateMany({ where: { id: idOk.data, organizationId: ctx.organizationId }, data: { activa: activaOk.data } });
  if (!r.count) return { error: "Pasarela no encontrada" };
  await prisma.evento.create({ data: { organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: activaOk.data ? "pasarela.activada" : "pasarela.desactivada", detalle: { pasarelaId: idOk.data } } });
  revalidatePath("/integraciones/pasarelas");
  return {};
}

export async function eliminarPasarela(id: string): Promise<R> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const idOk = idSchema.safeParse(id);
  if (!idOk.success) return { error: "Identificador no válido" };
  const p = await prisma.pasarelaPago.findFirst({ where: { id: idOk.data, organizationId: ctx.organizationId }, include: { _count: { select: { links: true } } } });
  if (!p) return { error: "Pasarela no encontrada" };
  if (p._count.links > 0) return { error: "Ya tiene links de pago: desactívala en lugar de eliminarla" };
  await prisma.pasarelaPago.delete({ where: { id: p.id } });
  await prisma.evento.create({ data: { organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "pasarela.eliminada", detalle: { pasarelaId: p.id, proveedor: p.proveedor } } });
  revalidatePath("/integraciones/pasarelas");
  return {};
}

/** Consulta a la pasarela los links sin resolver del centro (por si se perdió un webhook). */
export async function conciliarPasarelas(): Promise<R & { resumen?: string }> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const r = await conciliarLinks(ctx.organizationId, { actorId: ctx.usuario.id, descifrarLlaves: (c) => JSON.parse(descifrar(c, secreto())) });
  await prisma.evento.create({ data: { organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "pasarela.conciliada", detalle: r } });
  revalidatePath("/integraciones/pasarelas");
  return { resumen: `${r.revisados} revisados, ${r.aprobados} aprobados, ${r.expirados} vencidos${r.noSoportados ? `, ${r.noSoportados} sin consulta disponible en su pasarela` : ""}${r.errores ? `, ${r.errores} con error` : ""}` };
}
