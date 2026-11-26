"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { alcanceLeads } from "@/lib/crm-datos";
import { enlaceWhatsapp } from "@/lib/crm";
import { cambiarEtapaLead } from "@/lib/crm-motor-datos";
import { registrarEvento } from "@/lib/eventos";
import { conReintentoNumero } from "@/lib/ordenes";
import { crearOrdenEnCentro } from "@/lib/ordenes-servicio";
import { esquemaNumeroDocumento, esquemaTipoDocumento } from "@/lib/pacientes";
import { crearPacienteEnCentro } from "@/lib/pacientes-centro";
import { convenioVigente, hoyBogota, resolverPrecio } from "@/lib/precios";
import { cargarConvenios } from "@/lib/precios-datos";
import {
  DIAS_VIGENCIA, MAX_TOTAL, aFechaDb, calcularTotales, esEditable, esquemaPresupuesto, estaVencida, fechaVigencia, lineaNeta, notaLibres, numeroPresupuesto,
  partirParaOrden, puedeAnular, puedeReenviar, serviciosParaOrden, totalGuardado, vigenciaValida, type EntradaPresupuesto, type EstadoPres,
} from "@/lib/presupuestos";
import {
  contextoPresupuestos, enlacePresupuesto, enviarCredencialesPresupuesto, fechaTexto, presupuestoVisible, regenerarCredenciales, type ContextoPres,
} from "@/lib/presupuestos-servidor";
import { exigirModulo } from "@/lib/sesion";
import { filtroValoraciones } from "@/lib/valoraciones";
import { nombreCentro } from "@/lib/valoraciones-servidor";

type R = { error?: string };
/** Con datos: se distingue con `"error" in r`. */
type D<T> = { error: string } | T;
export type CredencialesPres = { enlace: string; codigo: string; vence: string; whatsapp: string | null; correoEnviado: boolean };

const refrescar = (id?: string) => { revalidatePath("/presupuestos"); if (id) revalidatePath(`/presupuestos/${id}`); };
const ETAPAS_ANTERIORES = ["NUEVO", "CONTACTADO", "VALORACION_AGENDADA", "VALORACION_REALIZADA"];

// --- Origen: paciente, lead o valoración ---
async function resolverOrigen(ctx: ContextoPres, d: z.output<typeof esquemaPresupuesto>): Promise<D<{ pacienteId: string; leadId: string | null; valoracionId: string | null }>> {
  const org = ctx.organizationId;
  let pacienteId = d.pacienteId ?? null, leadId = d.leadId ?? null, valoracionId: string | null = null;
  if (d.valoracionId) {
    const v = await prisma.valoracion.findFirst({ where: { id: d.valoracionId, ...filtroValoraciones(org, ctx.usuario.id, ctx.rol), estado: "COMPLETADA" }, select: { id: true, pacienteId: true, leadId: true } });
    if (!v) return { error: "Valoración no encontrada o aún no completada" };
    valoracionId = v.id; pacienteId = v.pacienteId ?? pacienteId; leadId = v.leadId ?? leadId;
  }
  if (!pacienteId && leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, ...(valoracionId ? { organizationId: org } : alcanceLeads(ctx)) } });
    if (!lead) return { error: "Lead no encontrado" };
    if (lead.pacienteId) pacienteId = lead.pacienteId;
    else {
      // La cotización cuelga de un paciente: el lead se registra como tal con su documento, sin cambiar su etapa.
      const doc = z.object({ tipoDocumento: esquemaTipoDocumento, numeroDocumento: esquemaNumeroDocumento }).safeParse({ tipoDocumento: d.tipoDocumento, numeroDocumento: d.numeroDocumento ?? "" });
      if (!doc.success) return { error: "Este contacto aún no es paciente: escribe su tipo y número de documento." };
      const r = await crearPacienteEnCentro(org, doc.data, { nombre: lead.nombre, celular: lead.telefono, correo: lead.correo, notas: lead.interes ? `Interés al llegar como lead: ${lead.interes}` : null });
      pacienteId = "existente" in r ? r.existente : r.creado.id;
      const pid = pacienteId;
      await prisma.$transaction(async (tx) => {
        if (lead.noContactar) await tx.preferenciaContacto.upsert({ where: { pacienteId: pid }, update: { noContactar: true }, create: { pacienteId: pid, organizationId: org, noContactar: true } });
        await tx.lead.update({ where: { id: lead.id }, data: { pacienteId: pid } });
        await tx.actividadLead.create({ data: { organizationId: org, leadId: lead.id, tipo: "NOTA", texto: "Registrado como paciente para cotizar", autorId: ctx.usuario.id } });
      });
      if (!("existente" in r)) await registrarEvento({ organizationId: org, pacienteId: pid, actorId: ctx.usuario.id, tipo: "paciente.creado", detalle: { origen: "presupuesto" } });
    }
  }
  if (!pacienteId) return { error: "Selecciona un paciente" };
  const pac = await prisma.pacienteTenant.findFirst({ where: { id: pacienteId, organizationId: org }, select: { id: true } });
  if (!pac) return { error: "Paciente no encontrado" };
  return { pacienteId: pac.id, leadId, valoracionId };
}

// --- Ítems: el precio del catálogo siempre se resuelve aquí ---
async function resolverItems(ctx: ContextoPres, d: z.output<typeof esquemaPresupuesto>, previos: { servicioId: string | null; descripcion: string; costoUnitario: number }[]) {
  const org = ctx.organizationId;
  const ids = [...new Set(d.items.flatMap((i) => (i.servicioId ? [i.servicioId] : [])))];
  const servicios = ids.length ? await prisma.servicio.findMany({ where: { id: { in: ids }, organizationId: org, activo: true } }) : [];
  if (servicios.length !== ids.length) return { error: "Algún servicio ya no está disponible" };
  const porId = new Map(servicios.map((s) => [s.id, s]));
  const fecha = hoyBogota();
  const convenio = d.convenioId ? ((await cargarConvenios(org, d.convenioId))[0] ?? null) : null;
  if (d.convenioId && (!convenio || !convenioVigente(convenio, fecha))) return { error: "Convenio no válido o fuera de vigencia" };
  const costoPrevio = new Map(previos.map((p) => [`${p.servicioId ?? ""}|${p.descripcion}`, p.costoUnitario]));
  const lineas = [];
  for (const i of d.items) {
    const s = i.servicioId ? porId.get(i.servicioId)! : null;
    const valorUnitario = s ? resolverPrecio({ servicio: s, entrega: "DIGITAL", convenio: convenio && { ...convenio, tarifa: convenio.tarifas[s.id] }, fecha }).precio : i.valorUnitario;
    if (valorUnitario === null) return { error: `«${s!.nombre}» no tiene precio en el catálogo` };
    const descripcion = s ? s.nombre : i.descripcion;
    // Costo y margen son del administrador: los demás roles ni lo envían ni lo borran (se conserva el que ya había).
    const costoUnitario = ctx.esAdmin ? i.costoUnitario : (costoPrevio.get(`${s?.id ?? ""}|${descripcion}`) ?? 0);
    lineas.push({ servicioId: s?.id ?? null, descripcion, cantidad: i.cantidad, valorUnitario, descuento: i.descuento, fase: i.fase, diente: i.diente ?? null, costoUnitario });
  }
  const t = calcularTotales(lineas, d.descuentoGlobal);
  if (t.total > MAX_TOTAL) return { error: "El total supera el máximo permitido" };
  return { t };
}

/** Crea (id = null) o edita un BORRADOR. Totales y precios del catálogo se recalculan aquí. */
export async function guardarPresupuesto(id: string | null, entrada: EntradaPresupuesto): Promise<D<{ id: string }>> {
  const ctx = await contextoPresupuestos();
  const r = esquemaPresupuesto.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const d = r.data, org = ctx.organizationId;
  const errVig = vigenciaValida(d.validoHasta);
  if (errVig) return { error: errVig };

  let existente = null;
  if (id) {
    existente = await presupuestoVisible(ctx, id);
    if (!existente) return { error: "Cotización no encontrada" };
    if (!esEditable(existente)) return { error: "Una cotización enviada no se edita: duplícala para crear una nueva versión." };
  }
  const origen = existente ? { pacienteId: existente.pacienteId, leadId: existente.leadId, valoracionId: existente.valoracionId } : await resolverOrigen(ctx, d);
  if ("error" in origen) return origen;
  const previos = existente ? await prisma.itemPresupuesto.findMany({ where: { presupuestoId: existente.id, organizationId: org }, select: { servicioId: true, descripcion: true, costoUnitario: true } }) : [];
  const res = await resolverItems(ctx, d, previos);
  const t = res.t;
  if (!t) return { error: res.error ?? "Datos inválidos" };
  const margen = t.margenPct === null ? null : Math.max(-999.99, Math.min(999.99, t.margenPct));
  const items = t.items.map((i, posicion) => ({
    organizationId: org, servicioId: i.servicioId, descripcion: i.descripcion, diente: i.diente, fase: i.fase, cantidad: i.cantidad,
    valorUnitario: i.valorUnitario, costoUnitario: i.costoUnitario, descuento: i.descuento, posicion,
  }));
  const comunes = { titulo: d.titulo || null, notas: d.notas || null, validoHasta: aFechaDb(d.validoHasta), margen };

  if (existente) {
    const { count } = await prisma.$transaction(async (tx) => {
      const u = await tx.presupuesto.updateMany({ where: { id: existente.id, organizationId: org, estado: "BORRADOR" }, data: comunes });
      if (u.count === 1) {
        await tx.itemPresupuesto.deleteMany({ where: { presupuestoId: existente.id, organizationId: org } });
        await tx.itemPresupuesto.createMany({ data: items.map((i) => ({ ...i, presupuestoId: existente.id })) });
      }
      return u;
    });
    if (count !== 1) return { error: "Una cotización enviada no se edita: duplícala para crear una nueva versión." };
    await registrarEvento({ organizationId: org, pacienteId: existente.pacienteId, actorId: ctx.usuario.id, tipo: "presupuesto.editado", detalle: { presupuestoId: existente.id, total: t.total } });
    refrescar(existente.id);
    return { id: existente.id };
  }

  const creado = await conReintentoNumero(() =>
    prisma.$transaction(async (tx) => {
      const max = await tx.presupuesto.aggregate({ where: { organizationId: org }, _max: { numero: true } });
      return tx.presupuesto.create({
        data: {
          ...comunes, organizationId: org, numero: (max._max.numero ?? 0) + 1, pacienteId: origen.pacienteId, leadId: origen.leadId, valoracionId: origen.valoracionId,
          profesionalId: ctx.usuario.id, creadoPorId: ctx.usuario.id, items: { create: items },
        },
      });
    }),
  );
  await registrarEvento({ organizationId: org, pacienteId: creado.pacienteId, actorId: ctx.usuario.id, tipo: "presupuesto.creado", detalle: { presupuestoId: creado.id, numero: creado.numero, valoracionId: creado.valoracionId, leadId: creado.leadId, total: t.total } });
  refrescar();
  return { id: creado.id };
}

// --- Enviar / reenviar ---
/** BORRADOR → ENVIADO; en una enviada o vista y vigente, reenvía con enlace y código nuevos. Las credenciales se muestran una sola vez. */
export async function enviarPresupuesto(id: string): Promise<D<{ credenciales: CredencialesPres }>> {
  const ctx = await contextoPresupuestos();
  const p = await presupuestoVisible(ctx, id);
  if (!p) return { error: "Cotización no encontrada" };
  const org = ctx.organizationId, primera = p.estado === "BORRADOR";
  if (!primera && !puedeReenviar({ estado: p.estado as EstadoPres, validoHasta: p.validoHasta })) return { error: "Esta cotización ya no se puede enviar. Duplícala para crear una nueva versión." };
  if (!p.validoHasta || estaVencida(p.validoHasta)) return { error: "La vigencia ya venció: edita la fecha antes de enviarla." };
  const items = await prisma.itemPresupuesto.findMany({ where: { presupuestoId: p.id, organizationId: org }, select: { cantidad: true, valorUnitario: true, descuento: true } });
  if (!items.length || totalGuardado(items) <= 0) return { error: "La cotización necesita al menos un ítem con valor." };

  if (primera) {
    const { count } = await prisma.presupuesto.updateMany({ where: { id: p.id, organizationId: org, estado: "BORRADOR" }, data: { estado: "ENVIADO", enviadoEn: new Date() } });
    if (count !== 1) return { error: "Esta cotización ya fue enviada." };
  }
  const c = await regenerarCredenciales(p.id, org);
  const [centro, pac, lead] = await Promise.all([
    nombreCentro(org),
    prisma.pacienteTenant.findFirst({ where: { id: p.pacienteId, organizationId: org }, select: { celular: true } }),
    p.leadId ? prisma.lead.findFirst({ where: { id: p.leadId, organizationId: org }, select: { id: true, etapa: true, noContactar: true } }) : null,
  ]);
  const enlace = enlacePresupuesto(c.token);
  // Sin PHI: ni nombre ni valores en el mensaje. El paciente que pidió la cotización la recibe como mensaje transaccional; "no contactar" siempre se respeta.
  const correoEnviado = lead?.noContactar ? false : await enviarCredencialesPresupuesto({ id: p.id, organizationId: org, pacienteId: p.pacienteId, validoHasta: p.validoHasta }, c);
  await registrarEvento({ organizationId: org, pacienteId: p.pacienteId, actorId: ctx.usuario.id, tipo: primera ? "presupuesto.enviado" : "presupuesto.reenviado", detalle: { presupuestoId: p.id, numero: p.numero, correoEnviado } });
  if (lead) {
    await prisma.actividadLead.create({ data: { organizationId: org, leadId: lead.id, tipo: "NOTA", texto: `Cotización ${numeroPresupuesto(p.numero)} ${primera ? "enviada" : "reenviada"}`, autorId: ctx.usuario.id } });
    // Solo avanza (nunca retrocede) y no dispara correos: cambiarEtapaLead solo cancela secuencias que dejan de aplicar.
    if (ETAPAS_ANTERIORES.includes(lead.etapa)) await cambiarEtapaLead(prisma, { organizationId: org, leadId: lead.id, etapa: "PROPUESTA", autorId: ctx.usuario.id });
    revalidatePath(`/crm/leads/${lead.id}`);
  }
  refrescar(p.id);
  return {
    credenciales: {
      enlace, codigo: c.codigo, vence: fechaTexto(p.validoHasta), correoEnviado,
      whatsapp: enlaceWhatsapp(pac?.celular, `Hola, ${centro} te comparte tu cotización: ${enlace}`),
    },
  };
}

/** Anula (o descarta un borrador): el enlace deja de servir de inmediato. */
export async function anularPresupuesto(id: string, motivo: string): Promise<R> {
  const ctx = await contextoPresupuestos();
  const m = z.string().trim().min(5, "Escribe el motivo (mínimo 5 caracteres)").max(500).safeParse(motivo);
  if (!m.success) return { error: m.error.issues[0]!.message };
  const p = await presupuestoVisible(ctx, id);
  if (!p) return { error: "Cotización no encontrada" };
  if (!puedeAnular({ estado: p.estado as EstadoPres })) return { error: "Esta cotización ya no se puede anular." };
  const { count } = await prisma.presupuesto.updateMany({ where: { id: p.id, organizationId: ctx.organizationId, estado: { in: ["BORRADOR", "ENVIADO", "VISTO"] } }, data: { estado: "VENCIDO", tokenHash: null, codigoHash: null } });
  if (count !== 1) return { error: "Esta cotización cambió de estado: recarga la página." };
  await registrarEvento({ organizationId: ctx.organizationId, pacienteId: p.pacienteId, actorId: ctx.usuario.id, tipo: "presupuesto.anulado", detalle: { presupuestoId: p.id, numero: p.numero, motivo: m.data } });
  if (p.leadId) await prisma.actividadLead.create({ data: { organizationId: ctx.organizationId, leadId: p.leadId, tipo: "NOTA", texto: `Cotización ${numeroPresupuesto(p.numero)} anulada: ${m.data}`, autorId: ctx.usuario.id } });
  refrescar(p.id);
  return {};
}

/** Nueva versión: copia la cotización (con los valores guardados) como borrador. */
export async function duplicarPresupuesto(id: string): Promise<D<{ id: string }>> {
  const ctx = await contextoPresupuestos();
  const p = await presupuestoVisible(ctx, id);
  if (!p) return { error: "Cotización no encontrada" };
  const org = ctx.organizationId;
  const items = await prisma.itemPresupuesto.findMany({ where: { presupuestoId: p.id, organizationId: org }, orderBy: { posicion: "asc" } });
  const creado = await conReintentoNumero(() =>
    prisma.$transaction(async (tx) => {
      const max = await tx.presupuesto.aggregate({ where: { organizationId: org }, _max: { numero: true } });
      return tx.presupuesto.create({
        data: {
          organizationId: org, numero: (max._max.numero ?? 0) + 1, pacienteId: p.pacienteId, leadId: p.leadId, valoracionId: p.valoracionId, titulo: p.titulo, notas: p.notas, margen: p.margen,
          validoHasta: aFechaDb(fechaVigencia(DIAS_VIGENCIA)), profesionalId: ctx.usuario.id, creadoPorId: ctx.usuario.id,
          items: { create: items.map((i) => ({ organizationId: org, servicioId: i.servicioId, descripcion: i.descripcion, diente: i.diente, fase: i.fase, cantidad: i.cantidad, valorUnitario: i.valorUnitario, costoUnitario: i.costoUnitario, descuento: i.descuento, posicion: i.posicion })) },
        },
      });
    }),
  );
  await registrarEvento({ organizationId: org, pacienteId: p.pacienteId, actorId: ctx.usuario.id, tipo: "presupuesto.creado", detalle: { presupuestoId: creado.id, numero: creado.numero, duplicadoDe: p.id } });
  refrescar();
  return { id: creado.id };
}

// --- Conversión en orden ---
export type VistaConversion = {
  totalCotizado: number; totalOrden: number; difiere: boolean; hayCatalogo: boolean;
  lineas: { descripcion: string; cantidad: number; cotizado: number; actual: number }[];
  libres: { descripcion: string; cantidad: number; valor: number }[];
};

async function calcularConversion(ctx: ContextoPres, p: { id: string }, convenioId: string | null): Promise<D<VistaConversion & { servicios: { servicioId: string }[] }>> {
  const org = ctx.organizationId;
  const items = await prisma.itemPresupuesto.findMany({ where: { presupuestoId: p.id, organizationId: org }, orderBy: { posicion: "asc" } });
  const { catalogo, libres } = partirParaOrden(items);
  const servicios = await prisma.servicio.findMany({ where: { id: { in: catalogo.map((i) => i.servicioId!) }, organizationId: org, activo: true } });
  if (servicios.length !== new Set(catalogo.map((i) => i.servicioId)).size) return { error: "Algún servicio de la cotización ya no está disponible en el catálogo." };
  const porId = new Map(servicios.map((s) => [s.id, s]));
  const fecha = hoyBogota();
  const convenio = convenioId ? ((await cargarConvenios(org, convenioId))[0] ?? null) : null;
  if (convenioId && (!convenio || !convenioVigente(convenio, fecha))) return { error: "Convenio no válido o fuera de vigencia" };
  const lineas = catalogo.map((i) => {
    const s = porId.get(i.servicioId!)!;
    const unit = resolverPrecio({ servicio: s, entrega: "DIGITAL", convenio: convenio && { ...convenio, tarifa: convenio.tarifas[s.id] }, fecha }).precio ?? 0;
    return { descripcion: i.descripcion, cantidad: i.cantidad, cotizado: lineaNeta(i), actual: unit * i.cantidad };
  });
  const totalCotizado = totalGuardado(items), totalOrden = lineas.reduce((t, l) => t + l.actual, 0);
  const difiere = lineas.some((l) => l.cotizado !== l.actual) || libres.length > 0;
  return {
    totalCotizado, totalOrden, difiere, hayCatalogo: catalogo.length > 0, lineas,
    libres: libres.map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, valor: lineaNeta(l) })),
    servicios: serviciosParaOrden(catalogo),
  };
}

async function aceptadaConvertible(ctx: ContextoPres, id: string) {
  const p = await presupuestoVisible(ctx, id);
  if (!p) return { error: "Cotización no encontrada" } as const;
  if (p.estado !== "ACEPTADO" || p.ordenId) return { error: "Solo se convierte una cotización aceptada que aún no tiene orden." } as const;
  if (await prisma.planTratamiento.findFirst({ where: { organizationId: ctx.organizationId, presupuestoId: p.id }, select: { id: true } })) return { error: "Esta cotización ya tiene un plan de tratamiento: crea las órdenes desde el plan." } as const;
  return { p } as const;
}

/** Cuánto cambió el precio frente a la cotización si se creara la orden hoy (con el convenio elegido). */
export async function previsualizarConversion(id: string, convenioId: string | null): Promise<D<VistaConversion>> {
  const ctx = await contextoPresupuestos();
  const a = await aceptadaConvertible(ctx, id);
  if (a.error) return { error: a.error };
  const c = await calcularConversion(ctx, a.p, convenioId || null);
  if ("error" in c) return c;
  const { totalCotizado, totalOrden, difiere, hayCatalogo, lineas, libres } = c;
  return { totalCotizado, totalOrden, difiere, hayCatalogo, lineas, libres };
}

/** Crea la orden con los ítems del catálogo (precios recalculados). Si difieren de lo cotizado exige `confirmo`. */
export async function convertirEnOrden(id: string, opciones: { convenioId?: string | null; confirmo?: boolean }): Promise<D<{ ordenId: string }>> {
  const ctx = await contextoPresupuestos();
  await exigirModulo(ctx, "ordenes");
  const a = await aceptadaConvertible(ctx, id);
  if (a.error) return { error: a.error };
  const p = a.p, org = ctx.organizationId;
  const c = await calcularConversion(ctx, p, opciones.convenioId || null);
  if ("error" in c) return c;
  if (!c.hayCatalogo) return { error: "La cotización no tiene ítems del catálogo para crear la orden." };
  if (c.difiere && !opciones.confirmo) return { error: "Los valores de la orden no coinciden con lo cotizado: revisa la diferencia y confirma." };
  // Reclamo atómico: un doble clic nunca crea dos órdenes.
  const { count } = await prisma.presupuesto.updateMany({ where: { id: p.id, organizationId: org, estado: "ACEPTADO", ordenId: null }, data: { estado: "CONVERTIDO" } });
  if (count !== 1) return { error: "Esta cotización ya se convirtió en orden." };
  const nota = notaLibres(c.libres.map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad })), p.numero);
  const res = await crearOrdenEnCentro({
    organizationId: org, actorId: ctx.usuario.id, esDoctor: false,
    datos: { pacienteId: p.pacienteId, convenioId: opciones.convenioId || null, entrega: "DIGITAL", embarazo: false, observaciones: `Desde la cotización ${numeroPresupuesto(p.numero)}.${nota ? ` ${nota}` : ""}`.slice(0, 2000), items: c.servicios.map((s) => ({ servicioId: s.servicioId })) },
    detalleEvento: { presupuestoId: p.id },
  }).catch((e) => { console.error("No se pudo crear la orden de la cotización", e); return { error: "No se pudo crear la orden." }; });
  if ("error" in res) {
    await prisma.presupuesto.updateMany({ where: { id: p.id, organizationId: org, estado: "CONVERTIDO", ordenId: null }, data: { estado: "ACEPTADO" } });
    return res;
  }
  await prisma.presupuesto.update({ where: { id: p.id }, data: { ordenId: res.id } });
  await registrarEvento({ organizationId: org, pacienteId: p.pacienteId, actorId: ctx.usuario.id, tipo: "presupuesto.convertido", detalle: { presupuestoId: p.id, numero: p.numero, ordenId: res.id, ordenNumero: res.numero, diferencia: c.totalOrden - c.totalCotizado } });
  revalidatePath("/ordenes");
  refrescar(p.id);
  return { ordenId: res.id };
}
