// Creación de órdenes compartida por la app (server action) y la API pública. Los precios SIEMPRE se recalculan aquí.
import { prisma } from "@dent-view/db";
import { z } from "zod";
import { registrarEvento } from "./eventos";
import { conReintentoNumero } from "./ordenes";
import { convenioVigente, hoyBogota, resolverPrecio } from "./precios";
import { cargarConvenios, cargarTarifasDoctor } from "./precios-datos";

const esquemaItemsOrden = z.array(z.object({ servicioId: z.string(), opciones: z.string().trim().max(500).optional() }));
const baseOrden = z.object({
  pacienteId: z.string().min(1, "Selecciona un paciente"),
  doctorId: z.string().nullish(),
  convenioId: z.string().nullish(),
  entrega: z.enum(["IMPRESA", "DIGITAL"]),
  embarazo: z.boolean(),
  observaciones: z.string().trim().max(2000).optional(),
});
export const esquemaOrden = baseOrden.extend({ items: esquemaItemsOrden.min(1, "Agrega al menos un servicio") });
/** Orden con ítems de un plan de tratamiento: los servicios sueltos pueden ir vacíos (el servidor exige al menos uno entre ambos). */
export const esquemaOrdenConPlan = baseOrden.extend({ items: esquemaItemsOrden });
export type EntradaOrden = z.output<typeof esquemaOrden>;
export type ReclamoPlan = { planId: string; itemIds: string[] };
class ItemsPlanNoDisponibles extends Error {}

/**
 * `esDoctor`: quien crea es un doctor remitente (`doctorId` ya es él mismo y no puede elegir convenio).
 * Para los demás, `doctorId` se valida como miembro doctor_remitente del centro.
 */
export async function crearOrdenEnCentro(a: {
  organizationId: string;
  actorId: string | null;
  esDoctor: boolean;
  datos: EntradaOrden;
  detalleEvento?: object;
  /** Ítems PENDIENTES de un plan de tratamiento: entran a la orden a su precio congelado (sin recalcular). */
  plan?: ReclamoPlan;
}): Promise<{ error: string } | { id: string; numero: number }> {
  const { organizationId: org, datos: d } = a;
  const paciente = await prisma.pacienteTenant.findFirst({ where: { id: d.pacienteId, organizationId: org } });
  if (!paciente) return { error: "Paciente no encontrado" };

  const doctorId = d.doctorId ?? null;
  if (doctorId && !a.esDoctor) {
    const m = await prisma.member.findUnique({ where: { organizationId_userId: { organizationId: org, userId: doctorId } } });
    if (m?.role !== "doctor_remitente") return { error: "Doctor remitente no válido" };
  }

  const ids = [...new Set(d.items.map((i) => i.servicioId))];
  const servicios = await prisma.servicio.findMany({ where: { id: { in: ids }, organizationId: org, activo: true } });
  if (servicios.length !== ids.length) return { error: "Algún servicio ya no está disponible" };
  const porId = new Map(servicios.map((s) => [s.id, s]));

  // Convenio solo lo elige el personal del centro; el precio se recalcula aquí, nunca se confía en el cliente.
  const fecha = hoyBogota();
  const convenio = !a.esDoctor && d.convenioId ? ((await cargarConvenios(org, d.convenioId))[0] ?? null) : null;
  if (d.convenioId && !a.esDoctor && (!convenio || !convenioVigente(convenio, fecha))) return { error: "Convenio no válido o fuera de vigencia" };
  const tarifasDoctor = doctorId ? ((await cargarTarifasDoctor(org, [doctorId]))[doctorId] ?? {}) : {};

  const idsPlan = a.plan ? [...new Set(a.plan.itemIds)] : [];
  const serviciosPlan = idsPlan.length ? await prisma.servicio.findMany({ where: { organizationId: org, itemsPlan: { some: { id: { in: idsPlan }, organizationId: org } } } }) : [];

  const orden = await conReintentoNumero(() =>
    prisma.$transaction(async (tx) => {
      // Reclamo atómico: un ítem solo está en una orden. Si otro se adelantó (o el plan ya no está activo) count no coincide y todo se revierte.
      let itemsPlan: { id: string; servicioId: string | null; descripcion: string; precio: number }[] = [];
      if (a.plan) {
        const { count } = await tx.planItem.updateMany({
          where: { id: { in: idsPlan }, planId: a.plan.planId, organizationId: org, estado: "PENDIENTE", plan: { estado: "ACTIVO", pacienteId: paciente.id, organizationId: org } },
          data: { estado: "EN_ORDEN" },
        });
        if (count !== idsPlan.length) throw new ItemsPlanNoDisponibles();
        itemsPlan = await tx.planItem.findMany({ where: { id: { in: idsPlan }, organizationId: org }, orderBy: [{ fase: "asc" }, { posicion: "asc" }] });
      }
      const porIdPlan = new Map(serviciosPlan.map((s) => [s.id, s]));
      const max = await tx.orden.aggregate({ where: { organizationId: org }, _max: { numero: true } });
      const creada = await tx.orden.create({
        data: {
          organizationId: org,
          numero: (max._max.numero ?? 0) + 1,
          pacienteId: paciente.id,
          doctorRemitenteId: doctorId,
          convenioId: convenio?.id ?? null,
          entrega: d.entrega,
          embarazo: d.embarazo,
          observaciones: d.observaciones || null,
          creadoPorId: a.actorId,
          items: {
            create: [...itemsPlan.map((p) => {
              const s = p.servicioId ? porIdPlan.get(p.servicioId) : undefined;
              return { servicioId: p.servicioId, nombre: p.descripcion, codigoCups: s?.codigoCups ?? null, tipoRips: s?.tipoRips ?? "PROCEDIMIENTO", precio: p.precio, planItemId: p.id };
            }), ...d.items.map((i) => {
              const s = porId.get(i.servicioId)!;
              // Precio congelado: nombre y precio final al momento de la orden.
              return { servicioId: s.id, nombre: s.nombre, codigoCups: s.codigoCups, tipoRips: s.tipoRips, opciones: i.opciones || null, precio: resolverPrecio({ servicio: s, entrega: d.entrega, tarifaDoctor: tarifasDoctor[s.id], convenio: convenio && { ...convenio, tarifa: convenio.tarifas[s.id] }, fecha }).precio ?? 0 };
            })],
          },
        },
      });
      await registrarEvento(
        { organizationId: org, pacienteId: paciente.id, actorId: a.actorId, tipo: "orden.creada", detalle: { ordenId: creada.id, numero: creada.numero, ...(a.plan ? { planId: a.plan.planId, itemsPlan: idsPlan.length } : {}), ...a.detalleEvento } },
        tx,
      );
      return creada;
    }),
  ).catch((e) => {
    if (e instanceof ItemsPlanNoDisponibles) return null;
    throw e;
  });
  if (!orden) return { error: "Algún ítem del plan ya no está disponible (otra orden lo tomó o el plan cambió)" };
  return { id: orden.id, numero: orden.numero };
}
