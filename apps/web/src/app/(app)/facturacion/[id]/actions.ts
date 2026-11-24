"use server";

import { randomBytes } from "node:crypto";
import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { contarPeticion } from "@/lib/api-limite";
import { descifrar, secretoCifrado } from "@/lib/cifrado";
import { conectores } from "@/lib/conectores";
import { marcaDeCentro } from "@/lib/correo/marca";
import { numeroFactura } from "@/lib/facturacion";
import { fechaCorta } from "@/lib/fechas";
import { renderPlantilla } from "@/lib/notificaciones";
import { linkActivo } from "@/lib/pagos/decision";
import { ErrorPasarela, esLocal, type Llaves } from "@/lib/pagos/proveedor";
import { ADAPTADORES, obtenerProveedor } from "@/lib/pagos/registro";
import { reservarLinkPago } from "@/lib/pagos/reserva";
import { conciliarLinks } from "@/lib/pagos/servicio";
import { cop } from "@/lib/precios";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

type R = { error?: string };
const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const VIGENCIA_DIAS = 7;
const limites = new Map<string, { inicio: number; cuenta: number }>();
const baseUrl = () => process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const secreto = () => {
  const s = secretoCifrado();
  if (!s) throw new Error("Falta CIFRADO_SECRETO o BETTER_AUTH_SECRET");
  return s;
};
const revalidar = (facturaId: string) => {
  revalidatePath(`/facturacion/${facturaId}`);
  revalidatePath("/facturacion");
  revalidatePath("/cartera");
};

/**
 * Genera un link de pago por la pasarela del centro. El monto sale SIEMPRE del servidor: el saldo pendiente de la cuenta
 * (o un abono parcial que no lo supere), descontando lo ya comprometido en otros links activos.
 */
export async function generarLinkPago(facturaId: string, entrada: { pasarelaId: string; abono?: number }): Promise<R & { id?: string; aviso?: string }> {
  const ctx = await exigirContexto(GESTION);
  if (!contarPeticion(limites, `gen:${ctx.usuario.id}`, Date.now(), 20).permitido) return { error: "Demasiados intentos, espera un minuto" };
  const ids = z.object({ f: idSchema, p: idSchema }).safeParse({ f: facturaId, p: entrada.pasarelaId });
  const abono = z.number().int().optional().safeParse(entrada.abono);
  if (!ids.success || !abono.success) return { error: "Datos inválidos" };
  const org = ctx.organizationId;
  const f = await prisma.factura.findFirst({ where: { id: ids.data.f, organizationId: org }, include: { paciente: true } });
  if (!f) return { error: "Cuenta de cobro no encontrada" };
  if (f.estado !== "ABIERTA") return { error: "La cuenta no está abierta" };
  const pasarela = await prisma.pasarelaPago.findFirst({ where: { id: ids.data.p, organizationId: org, activa: true } });
  if (!pasarela) return { error: "Pasarela no disponible" };
  const adaptador = ADAPTADORES[pasarela.proveedor];
  if (pasarela.modo === "PRODUCCION" && adaptador.bloqueadoProduccion) return { error: `${adaptador.nombre} no está habilitada para producción` };

  const referencia = `dv${randomBytes(16).toString("base64url")}`; // 24 caracteres, no adivinable
  const expiraEn = new Date(Date.now() + VIGENCIA_DIAS * 86_400_000);
  const reserva = await reservarLinkPago(prisma, { organizationId: org, facturaId: f.id, pasarelaId: pasarela.id, abono: abono.data, referencia, expiraEn, creadoPorId: ctx.usuario.id });
  if ("error" in reserva) return { error: reserva.error };
  const { monto } = reserva;
  const link = { id: reserva.id };
  // Pasarela de pruebas en un servidor real: el link se crea, pero sus pagos no se aplican (ver procesarEvento) y queda marcado como prueba.
  const prueba = pasarela.modo === "SANDBOX" && !esLocal();
  try {
    const llaves: Llaves = JSON.parse(descifrar(pasarela.llavesCifradas, secreto()));
    const https = baseUrl().startsWith("https://");
    const r = await obtenerProveedor(pasarela.proveedor, pasarela.modo).crearLink(llaves, pasarela.modo, {
      referencia, monto, expiraEn, descripcion: `Cuenta de cobro ${numeroFactura(f.numero)}${prueba ? " (PRUEBA)" : ""}`,
      urlRetorno: https ? `${baseUrl()}/` : null, urlWebhook: `${baseUrl()}/api/pagos/${pasarela.proveedor.toLowerCase()}/${pasarela.id}`, correoPagador: f.paciente?.correo,
    });
    await prisma.linkPago.update({ where: { id: link.id }, data: { idExterno: r.idExterno, urlPago: r.urlPago, expiraEn: r.expiraEn } });
  } catch (e) {
    await prisma.linkPago.delete({ where: { id: link.id } }); // sin id externo no hay nada que conciliar
    return { error: e instanceof ErrorPasarela ? e.message : "No se pudo generar el link con la pasarela" };
  }
  await prisma.evento.create({ data: { organizationId: org, pacienteId: f.pacienteId, actorId: ctx.usuario.id, tipo: "pago.link_creado", detalle: { linkPagoId: link.id, facturaId: f.id, factura: numeroFactura(f.numero), monto, proveedor: pasarela.proveedor, ...(prueba ? { prueba: true } : {}) } } });
  revalidar(f.id);
  return { id: link.id, ...(prueba ? { aviso: "Link de PRUEBA: la pasarela está en modo de pruebas y sus pagos no se aplican a la cuenta" } : {}) };
}

/** Anula el link en dent-view. Nota: algunas pasarelas no permiten cerrarlo por API; si el cliente pagara igual, el pago se aplica (el dinero ya llegó). */
export async function anularLinkPago(linkId: string): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  const id = idSchema.safeParse(linkId);
  if (!id.success) return { error: "Identificador no válido" };
  const l = await prisma.linkPago.findFirst({ where: { id: id.data, organizationId: ctx.organizationId, estado: { in: ["CREADO", "PENDIENTE"] } }, include: { factura: { select: { pacienteId: true, id: true } } } });
  if (!l) return { error: "El link no existe o ya no se puede anular" };
  const r = await prisma.linkPago.updateMany({ where: { id: l.id, estado: { in: ["CREADO", "PENDIENTE"] } }, data: { estado: "ANULADO" } });
  if (!r.count) return { error: "El link ya cambió de estado" };
  await prisma.evento.create({ data: { organizationId: ctx.organizationId, pacienteId: l.factura?.pacienteId, actorId: ctx.usuario.id, tipo: "pago.link_anulado", detalle: { linkPagoId: l.id } } });
  if (l.facturaId) revalidar(l.facturaId);
  return {};
}

/** Envía el link al correo del paciente. El cuerpo no lleva datos clínicos; el enlace no se guarda en el evento. */
export async function enviarLinkPorCorreo(linkId: string): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  if (!contarPeticion(limites, `mail:${ctx.usuario.id}`, Date.now(), 10).permitido) return { error: "Demasiados envíos, espera un minuto" };
  const id = idSchema.safeParse(linkId);
  if (!id.success) return { error: "Identificador no válido" };
  const l = await prisma.linkPago.findFirst({
    where: { id: id.data, organizationId: ctx.organizationId },
    include: { factura: { include: { paciente: { include: { persona: true } } } } },
  });
  if (!l?.urlPago || !linkActivo(l)) return { error: "El link no está disponible para enviar" };
  const pac = l.factura?.paciente;
  if (!pac?.correo) return { error: "El paciente no tiene correo registrado" };
  const pref = await prisma.preferenciaContacto.findUnique({ where: { pacienteId: pac.id } });
  if (pref?.noContactar || pref?.correo === false) return { error: "El paciente no desea recibir correos" };
  const marca = await marcaDeCentro(ctx.organizationId);
  const vars = { centro: marca.nombre, paciente: pac.nombre, monto: cop(l.monto), enlace: l.urlPago, vence: l.expiraEn ? fechaCorta(l.expiraEn) : "" };
  try {
    await conectores.CORREO.enviar({
      para: pac.correo,
      asunto: renderPlantilla("Tienes un pago pendiente en {{centro}}", vars),
      marca,
      vista: { titulo: "Tienes un pago pendiente", boton: { texto: "Pagar ahora", url: l.urlPago }, aviso: "Si no esperabas este mensaje, puedes ignorarlo." },
      cuerpo: renderPlantilla("Hola {{paciente}}, tienes un pago pendiente de {{monto}} en {{centro}}.\nPuedes pagarlo de forma segura en este enlace: {{enlace}}\nEl enlace vence el {{vence}}.", vars),
    });
  } catch {
    return { error: "No se pudo enviar el correo" };
  }
  await prisma.evento.create({ data: { organizationId: ctx.organizationId, pacienteId: pac.id, actorId: ctx.usuario.id, tipo: "pago.link_enviado", detalle: { linkPagoId: l.id, canal: "CORREO" } } });
  return {};
}

/** Consulta a la pasarela el estado de los links sin resolver de esta cuenta (por si se perdió un webhook). */
export async function actualizarLinksFactura(facturaId: string): Promise<R & { resumen?: string }> {
  const ctx = await exigirContexto(GESTION);
  const id = idSchema.safeParse(facturaId);
  if (!id.success) return { error: "Identificador no válido" };
  const r = await conciliarLinks(ctx.organizationId, { facturaId: id.data, actorId: ctx.usuario.id, descifrarLlaves: (c) => JSON.parse(descifrar(c, secreto())) });
  revalidar(id.data);
  return { resumen: r.aprobados ? `${r.aprobados} pago(s) confirmado(s)` : r.noSoportados ? "Tu pasarela no permite consultar el estado: se actualiza solo al recibir su aviso" : "Sin cambios" };
}
