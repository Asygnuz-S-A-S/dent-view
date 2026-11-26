"use server";

import { prisma, type Prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cifrar, secretoCifrado } from "@/lib/cifrado";
import { digitoVerificacionNit } from "@/lib/fe/dian";
import { ErrorFE, type CampoConfig, type Llaves } from "@/lib/fe/proveedor";
import { obtenerProveedor } from "@/lib/fe/registro";
import { contextoDe, reintentarDocumento } from "@/lib/fe/servicio";
import { ADMIN } from "@/lib/roles";
import { exigirContexto, exigirModulo } from "@/lib/sesion";

type R = { error?: string };
const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const modoSchema = z.enum(["SANDBOX", "PRODUCCION"]);
const mapaTexto = z.record(z.string().max(40), z.string().max(500));
const REVALIDAR = "/integraciones/facturacion";

/** Solo administradores del centro, nunca un superadmin suplantando, siempre dentro de su centro. */
async function contexto() {
  const ctx = await exigirContexto(ADMIN);
  await exigirModulo(ctx, "facturacion-electronica");
  if (ctx.suplantadoPor) return { error: "Un superadmin dentro del centro no puede gestionar la facturación electrónica" } as const;
  return ctx;
}
const secreto = () => {
  const s = secretoCifrado();
  if (!s) throw new Error("Falta CIFRADO_SECRETO o BETTER_AUTH_SECRET");
  return s;
};
const auditar = (organizationId: string, actorId: string, tipo: string, detalle: object) => prisma.evento.create({ data: { organizationId, actorId, tipo, detalle } });

const esquemaFacturador = z.object({
  nit: z.string().trim().regex(/^\d{5,15}$/, "El NIT debe tener entre 5 y 15 dígitos, sin puntos ni dígito de verificación"),
  razonSocial: z.string().trim().min(2, "Falta la razón social").max(200),
  nombreComercial: z.string().trim().max(200).optional(),
  codigoPrestador: z.string().trim().regex(/^\d{12}$/, "El código de prestador tiene 12 dígitos").or(z.literal("")).optional(),
  prefijoFactura: z.string().trim().max(5).regex(/^[A-Za-z0-9]*$/, "El prefijo solo lleva letras y números").optional(),
  regimen: z.string().trim().max(60).optional(),
  responsabilidadFiscal: z.string().trim().max(60).optional(),
  modalidadDefecto: z.string().trim().max(60).optional(),
  grupoServiciosDefecto: z.string().trim().max(60).optional(),
  generaRips: z.boolean(),
  emiteFev: z.boolean(),
});

/** Datos del facturador: el dígito de verificación se calcula, nunca se confía en el que escriba el cliente. */
export async function guardarFacturador(entrada: z.input<typeof esquemaFacturador>): Promise<R & { dv?: string }> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const p = esquemaFacturador.safeParse(entrada);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Datos no válidos" };
  const d = p.data;
  if (d.generaRips && !d.codigoPrestador) return { error: "El código de prestador (12 dígitos) es obligatorio para generar RIPS" };
  const dv = digitoVerificacionNit(d.nit)!;
  const datos = {
    nit: d.nit, dv, razonSocial: d.razonSocial, nombreComercial: d.nombreComercial || null, codigoPrestador: d.codigoPrestador || null, prefijoFactura: d.prefijoFactura || null,
    regimen: d.regimen || null, responsabilidadFiscal: d.responsabilidadFiscal || null, modalidadDefecto: d.modalidadDefecto || null, grupoServiciosDefecto: d.grupoServiciosDefecto || null,
    generaRips: d.generaRips, emiteFev: d.emiteFev,
  };
  const org = ctx.organizationId;
  await prisma.configFacturacion.upsert({ where: { organizationId: org }, create: { organizationId: org, ...datos }, update: datos });
  await auditar(org, ctx.usuario.id, "fe.facturador_actualizado", { emiteFev: d.emiteFev, generaRips: d.generaRips });
  revalidatePath(REVALIDAR);
  return { dv };
}

/** Solo las claves declaradas por el adaptador (más el tratamiento tributario), con select validado. */
function validarConfig(campos: CampoConfig[], cruda: unknown): { config: Record<string, string> } | { error: string } {
  const p = mapaTexto.safeParse(cruda ?? {});
  if (!p.success) return { error: "Ajustes no válidos" };
  const config: Record<string, string> = {};
  const iva = p.data.tratamientoIva ?? "EXCLUIDO";
  if (iva !== "EXCLUIDO" && iva !== "IVA_19") return { error: "Tratamiento tributario no válido" };
  config.tratamientoIva = iva;
  for (const c of campos) {
    const v = (p.data[c.clave] ?? "").trim();
    if (!v) {
      if (c.opcional) continue;
      return { error: `Falta: ${c.etiqueta}` };
    }
    if (c.tipo === "numero" && !/^\d{1,12}$/.test(v)) return { error: `${c.etiqueta} debe ser un número` };
    if (c.tipo === "select" && !c.opciones?.some((o) => o.valor === v)) return { error: `${c.etiqueta} no es válido` };
    config[c.clave] = v;
  }
  return { config };
}

function validarLlaves(campos: { clave: string; etiqueta: string; opcional?: boolean }[], crudas: unknown): { llaves: Llaves } | { error: string } {
  const p = mapaTexto.safeParse(crudas);
  if (!p.success) return { error: "Credenciales no válidas" };
  const llaves: Llaves = {};
  for (const c of campos) {
    const v = (p.data[c.clave] ?? "").trim();
    if (!v) {
      if (c.opcional) continue;
      return { error: `Falta: ${c.etiqueta}` };
    }
    llaves[c.clave] = v;
  }
  return { llaves };
}

/** Prueba con las credenciales escritas o, si se piden las guardadas (conexionId), con las de la conexión. Solo toca hosts fijos del proveedor. */
export async function probarConexionFe(entrada: { proveedor: string; modo: string; conexionId?: string; llaves?: Record<string, string>; config?: Record<string, string> }): Promise<R & { mensaje?: string }> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const modo = modoSchema.safeParse(entrada.modo);
  const proveedor = obtenerProveedor(entrada.proveedor);
  if (!modo.success || !proveedor) return { error: "Proveedor no disponible" };
  try {
    let c;
    if (entrada.conexionId) {
      const id = idSchema.safeParse(entrada.conexionId);
      const conexion = id.success ? await prisma.conexionFE.findFirst({ where: { id: id.data, organizationId: ctx.organizationId, proveedor: proveedor.clave } }) : null;
      if (!conexion) return { error: "Conexión no encontrada" };
      c = contextoDe(conexion);
    } else {
      const v = validarLlaves(proveedor.campos, entrada.llaves);
      if ("error" in v) return v;
      const cfg = validarConfig(proveedor.camposConfig ?? [], entrada.config);
      c = { llaves: v.llaves, modo: modo.data, config: "config" in cfg ? cfg.config : {} };
    }
    const r = await proveedor.probarConexion(c);
    return r.ok ? { mensaje: r.mensaje } : { error: r.mensaje };
  } catch (e) {
    return { error: e instanceof ErrorFE ? e.message : "No se pudo probar la conexión" };
  }
}

/** Crea la conexión o rota sus credenciales (se piden todas de nuevo; nunca se devuelven). */
export async function guardarConexionFe(entrada: { proveedor: string; modo: string; llaves: Record<string, string>; config?: Record<string, string> }): Promise<R & { id?: string }> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const modo = modoSchema.safeParse(entrada.modo);
  const proveedor = obtenerProveedor(entrada.proveedor); // el simulado devuelve null fuera de localhost
  if (!modo.success || !proveedor) return { error: "Proveedor no disponible" };
  if (modo.data === "PRODUCCION" && proveedor.bloqueadoProduccion) return { error: `${proveedor.nombre} está marcado «No probado»: solo se permite en SANDBOX hasta probarlo con una cuenta real` };
  const v = validarLlaves(proveedor.campos, entrada.llaves);
  if ("error" in v) return v;
  const cfg = validarConfig(proveedor.camposConfig ?? [], entrada.config);
  if ("error" in cfg) return cfg;
  const org = ctx.organizationId;
  const existente = await prisma.conexionFE.findUnique({ where: { organizationId_proveedor: { organizationId: org, proveedor: proveedor.clave } } });
  const datos = { modo: modo.data, credencialesCifradas: cifrar(JSON.stringify(v.llaves), secreto()), configJson: cfg.config as Prisma.InputJsonValue };
  const c = existente
    ? await prisma.conexionFE.update({ where: { id: existente.id }, data: datos })
    : await prisma.conexionFE.create({ data: { organizationId: org, proveedor: proveedor.clave, ...datos } });
  await auditar(org, ctx.usuario.id, existente ? "fe.conexion_rotada" : "fe.conexion_creada", { conexionId: c.id, proveedor: c.proveedor, modo: c.modo });
  revalidatePath(REVALIDAR);
  return { id: c.id };
}

/** Cambia los ajustes no secretos (escenario, ids de resolución, tratamiento tributario) sin tocar las credenciales. */
export async function guardarAjustesConexionFe(id: string, entrada: { modo: string; config: Record<string, string> }): Promise<R> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const idOk = idSchema.safeParse(id);
  const modo = modoSchema.safeParse(entrada.modo);
  if (!idOk.success || !modo.success) return { error: "Datos no válidos" };
  const c = await prisma.conexionFE.findFirst({ where: { id: idOk.data, organizationId: ctx.organizationId } });
  const proveedor = c ? obtenerProveedor(c.proveedor) : null;
  if (!c || !proveedor) return { error: "Conexión no encontrada" };
  if (modo.data === "PRODUCCION" && proveedor.bloqueadoProduccion) return { error: `${proveedor.nombre} está marcado «No probado»: solo se permite en SANDBOX` };
  const cfg = validarConfig(proveedor.camposConfig ?? [], entrada.config);
  if ("error" in cfg) return cfg;
  await prisma.conexionFE.update({ where: { id: c.id }, data: { modo: modo.data, configJson: cfg.config as Prisma.InputJsonValue } });
  await auditar(c.organizationId, ctx.usuario.id, "fe.conexion_ajustada", { conexionId: c.id, proveedor: c.proveedor, modo: modo.data });
  revalidatePath(REVALIDAR);
  return {};
}

export async function alternarConexionFe(id: string, activa: boolean): Promise<R> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const idOk = idSchema.safeParse(id);
  const activaOk = z.boolean().safeParse(activa);
  if (!idOk.success || !activaOk.success) return { error: "Identificador no válido" };
  const r = await prisma.conexionFE.updateMany({ where: { id: idOk.data, organizationId: ctx.organizationId }, data: { activa: activaOk.data } });
  if (!r.count) return { error: "Conexión no encontrada" };
  await auditar(ctx.organizationId, ctx.usuario.id, activaOk.data ? "fe.conexion_activada" : "fe.conexion_desactivada", { conexionId: idOk.data });
  revalidatePath(REVALIDAR);
  return {};
}

export async function eliminarConexionFe(id: string): Promise<R> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const idOk = idSchema.safeParse(id);
  if (!idOk.success) return { error: "Identificador no válido" };
  const c = await prisma.conexionFE.findFirst({ where: { id: idOk.data, organizationId: ctx.organizationId }, include: { _count: { select: { documentos: true } } } });
  if (!c) return { error: "Conexión no encontrada" };
  if (c._count.documentos > 0) return { error: "Ya emitió documentos: desactívala en lugar de eliminarla" };
  await prisma.conexionFE.delete({ where: { id: c.id } });
  await auditar(ctx.organizationId, ctx.usuario.id, "fe.conexion_eliminada", { conexionId: c.id, proveedor: c.proveedor });
  revalidatePath(REVALIDAR);
  return {};
}

/** Reintento manual desde el historial (admin). */
export async function reintentarDocumentoFe(documentoId: string): Promise<R> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const idOk = idSchema.safeParse(documentoId);
  if (!idOk.success) return { error: "Identificador no válido" };
  const r = await reintentarDocumento(idOk.data, { organizationId: ctx.organizationId, userId: ctx.usuario.id });
  revalidatePath(REVALIDAR);
  return r.ok ? {} : { error: r.error };
}
