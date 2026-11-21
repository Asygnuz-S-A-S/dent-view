// Creación de órdenes compartida por la app (server action) y la API pública. Los precios SIEMPRE se recalculan aquí.
import { prisma } from "@dent-view/db";
import { z } from "zod";
import { registrarEvento } from "./eventos";
import { conReintentoNumero } from "./ordenes";
import { convenioVigente, hoyBogota, resolverPrecio } from "./precios";
import { cargarConvenios, cargarTarifasDoctor } from "./precios-datos";

export const esquemaOrden = z.object({
  pacienteId: z.string().min(1, "Selecciona un paciente"),
  doctorId: z.string().nullish(),
  convenioId: z.string().nullish(),
  entrega: z.enum(["IMPRESA", "DIGITAL"]),
  embarazo: z.boolean(),
  observaciones: z.string().trim().max(2000).optional(),
  items: z.array(z.object({ servicioId: z.string(), opciones: z.string().trim().max(500).optional() })).min(1, "Agrega al menos un servicio"),
});
export type EntradaOrden = z.output<typeof esquemaOrden>;

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

  const orden = await conReintentoNumero(() =>
    prisma.$transaction(async (tx) => {
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
            create: d.items.map((i) => {
              const s = porId.get(i.servicioId)!;
              // Precio congelado: nombre y precio final al momento de la orden.
              return { servicioId: s.id, nombre: s.nombre, opciones: i.opciones || null, precio: resolverPrecio({ servicio: s, entrega: d.entrega, tarifaDoctor: tarifasDoctor[s.id], convenio: convenio && { ...convenio, tarifa: convenio.tarifas[s.id] }, fecha }).precio ?? 0 };
            }),
          },
        },
      });
      await registrarEvento(
        { organizationId: org, pacienteId: paciente.id, actorId: a.actorId, tipo: "orden.creada", detalle: { ordenId: creada.id, numero: creada.numero, ...a.detalleEvento } },
        tx,
      );
      return creada;
    }),
  );
  return { id: orden.id, numero: orden.numero };
}
