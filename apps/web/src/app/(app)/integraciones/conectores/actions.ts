"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cifrar, descifrar, secretoCifrado } from "@/lib/cifrado";
import { generarSecretoEntrada } from "@/lib/integraciones/entrada";
import { obtenerAdaptador } from "@/lib/integraciones/registro";
import { sincronizar } from "@/lib/integraciones/sincronizar";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

type R = { error?: string };
const ID_INVALIDO = "Identificador no válido";
const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const credencialesSchema = z.record(z.string().max(40), z.string().max(500));

/** Solo administradores del centro, nunca un superadmin suplantando, y siempre dentro de su centro. */
async function contexto() {
  const ctx = await exigirContexto(ADMIN);
  if (ctx.suplantadoPor) return { error: "Un superadmin dentro del centro no puede gestionar conectores" } as const;
  return ctx;
}
const secreto = () => {
  const s = secretoCifrado();
  if (!s) throw new Error("Falta CIFRADO_SECRETO o BETTER_AUTH_SECRET");
  return s;
};

/** Solo las claves que declara el adaptador, todas obligatorias. */
function validarCredenciales(proveedor: string, crudas: unknown): { cred: Record<string, string> } | { error: string } {
  const adaptador = obtenerAdaptador(proveedor);
  if (!adaptador) return { error: "Conector no disponible" };
  const p = credencialesSchema.safeParse(crudas);
  if (!p.success) return { error: "Credenciales no válidas" };
  const cred: Record<string, string> = {};
  for (const campo of adaptador.campos) {
    const v = (p.data[campo.clave] ?? "").trim();
    if (!v) return { error: `Falta: ${campo.etiqueta}` };
    cred[campo.clave] = v;
  }
  return { cred };
}

/** Prueba con las credenciales escritas o, si se deja vacío, con las guardadas de esa integración. */
export async function probarConexion(entrada: { proveedor: string; integracionId?: string; credenciales?: Record<string, string> }): Promise<R & { mensaje?: string }> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const prov = z.string().max(40).safeParse(entrada.proveedor);
  const adaptador = prov.success ? obtenerAdaptador(prov.data) : null;
  if (!adaptador) return { error: "Conector no disponible" };
  let cred: Record<string, string>;
  if (entrada.integracionId) {
    const idOk = idSchema.safeParse(entrada.integracionId);
    if (!idOk.success) return { error: ID_INVALIDO };
    const integ = await prisma.integracion.findFirst({ where: { id: idOk.data, organizationId: ctx.organizationId, proveedor: adaptador.clave } });
    if (!integ) return { error: "Conexión no encontrada" };
    cred = JSON.parse(descifrar(integ.credencialesCifradas, secreto()));
  } else {
    const v = validarCredenciales(adaptador.clave, entrada.credenciales);
    if ("error" in v) return v;
    cred = v.cred;
  }
  const r = await adaptador.probarConexion(cred);
  return r.ok ? { mensaje: r.mensaje } : { error: r.mensaje };
}

/** Crea la conexión. Devuelve el secreto del webhook de entrada UNA sola vez (en la BD queda cifrado). */
export async function crearIntegracion(entrada: { proveedor: string; credenciales: Record<string, string> }): Promise<R & { id?: string; secretoEntrada?: string }> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const prov = z.string().max(40).safeParse(entrada.proveedor);
  const adaptador = prov.success ? obtenerAdaptador(prov.data) : null;
  if (!adaptador) return { error: "Conector no disponible" };
  if (await prisma.integracion.findFirst({ where: { organizationId: ctx.organizationId, proveedor: adaptador.clave }, select: { id: true } })) return { error: "Ya hay una conexión con este conector: edítala o elimínala primero" };
  const v = validarCredenciales(adaptador.clave, entrada.credenciales);
  if ("error" in v) return v;
  const s = generarSecretoEntrada();
  const integ = await prisma.integracion.create({
    data: { organizationId: ctx.organizationId, proveedor: adaptador.clave, nombre: adaptador.nombre, credencialesCifradas: cifrar(JSON.stringify(v.cred), secreto()), secretoEntrada: cifrar(s, secreto()), creadoPorId: ctx.usuario.id },
  });
  await prisma.evento.create({ data: { organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "integracion.creada", detalle: { integracionId: integ.id, proveedor: adaptador.clave } } });
  revalidatePath("/integraciones/conectores");
  return { id: integ.id, secretoEntrada: s };
}

export async function actualizarCredenciales(entrada: { id: string; credenciales: Record<string, string> }): Promise<R> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const idOk = idSchema.safeParse(entrada.id);
  if (!idOk.success) return { error: ID_INVALIDO };
  const integ = await prisma.integracion.findFirst({ where: { id: idOk.data, organizationId: ctx.organizationId } });
  if (!integ) return { error: "Conexión no encontrada" };
  const v = validarCredenciales(integ.proveedor, entrada.credenciales);
  if ("error" in v) return v;
  await prisma.integracion.update({ where: { id: integ.id }, data: { credencialesCifradas: cifrar(JSON.stringify(v.cred), secreto()), estadoSync: null, errorSync: null } });
  await prisma.evento.create({ data: { organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "integracion.credenciales", detalle: { integracionId: integ.id } } });
  revalidatePath("/integraciones/conectores");
  return {};
}

export async function alternarIntegracion(id: string, activa: boolean): Promise<R> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const idOk = idSchema.safeParse(id);
  const activaOk = z.boolean().safeParse(activa);
  if (!idOk.success || !activaOk.success) return { error: ID_INVALIDO };
  const r = await prisma.integracion.updateMany({ where: { id: idOk.data, organizationId: ctx.organizationId }, data: { activa: activaOk.data } });
  if (!r.count) return { error: "Conexión no encontrada" };
  await prisma.evento.create({ data: { organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: activaOk.data ? "integracion.activada" : "integracion.desactivada", detalle: { integracionId: idOk.data } } });
  revalidatePath("/integraciones/conectores");
  return {};
}

export async function sincronizarAhora(id: string): Promise<R & { resumen?: string }> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const idOk = idSchema.safeParse(id);
  if (!idOk.success) return { error: ID_INVALIDO };
  const integ = await prisma.integracion.findFirst({ where: { id: idOk.data, organizationId: ctx.organizationId } });
  if (!integ) return { error: "Conexión no encontrada" };
  const r = await sincronizar(integ, undefined, secreto());
  revalidatePath("/integraciones/conectores");
  if (!r.ok) return { error: r.error };
  const c = r.conteos;
  return { resumen: `${c.pacientesCreados} pacientes nuevos, ${c.pacientesCompletados} completados, ${c.citasCreadas} citas, ${c.omitidos} omitidos` };
}

/** Rota el secreto del webhook de entrada y lo devuelve UNA sola vez. */
export async function rotarSecretoEntrada(id: string): Promise<R & { secretoEntrada?: string }> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const idOk = idSchema.safeParse(id);
  if (!idOk.success) return { error: ID_INVALIDO };
  const s = generarSecretoEntrada();
  const r = await prisma.integracion.updateMany({ where: { id: idOk.data, organizationId: ctx.organizationId }, data: { secretoEntrada: cifrar(s, secreto()) } });
  if (!r.count) return { error: "Conexión no encontrada" };
  await prisma.evento.create({ data: { organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "integracion.secreto_rotado", detalle: { integracionId: idOk.data } } });
  revalidatePath("/integraciones/conectores");
  return { secretoEntrada: s };
}

export async function eliminarIntegracion(id: string): Promise<R> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const idOk = idSchema.safeParse(id);
  if (!idOk.success) return { error: ID_INVALIDO };
  const r = await prisma.integracion.deleteMany({ where: { id: idOk.data, organizationId: ctx.organizationId } });
  if (!r.count) return { error: "Conexión no encontrada" };
  await prisma.evento.create({ data: { organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "integracion.eliminada", detalle: { integracionId: idOk.data } } });
  revalidatePath("/integraciones/conectores");
  return {};
}
