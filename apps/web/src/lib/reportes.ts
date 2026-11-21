// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
// Consultas agregadas de reportes; todas filtradas por centro y por rango [ini, fin).
import { prisma } from "@dent-view/db";
import { saldo } from "./facturacion";
import { diaBogota } from "./inicio";
import { diasDelRango } from "./reportes-rango";

type Rango = { ini: Date; fin: Date };

export async function datosReporte(organizationId: string, r: Rango) {
  const org = organizationId;
  const creadoEn = { gte: r.ini, lt: r.fin };
  const ordenVigente = { organizationId: org, estado: { not: "CANCELADA" as const }, creadoEn };

  const [produccion, pagos, abiertas, porEstado, porModalidad, ordenesDoctor, porEstadoCita] = await Promise.all([
    prisma.ordenItem.aggregate({ _sum: { precio: true }, where: { orden: ordenVigente } }),
    prisma.pago.findMany({ where: { factura: { organizationId: org }, fecha: creadoEn }, select: { fecha: true, valor: true } }),
    prisma.factura.findMany({ where: { organizationId: org, estado: "ABIERTA" }, select: { total: true, pagos: { select: { valor: true } } } }),
    prisma.orden.groupBy({ by: ["estado"], where: { organizationId: org, creadoEn }, _count: { _all: true } }),
    prisma.estudio.groupBy({ by: ["modalidad"], where: { organizationId: org, creadoEn }, _count: { _all: true } }),
    prisma.orden.findMany({
      where: { ...ordenVigente, doctorRemitenteId: { not: null } },
      select: { doctorRemitente: { select: { name: true } }, items: { select: { precio: true } } },
    }),
    prisma.cita.groupBy({ by: ["estado"], where: { organizationId: org, inicio: { gte: r.ini, lt: r.fin } }, _count: { _all: true } }),
  ]);

  const porDia = new Map<string, number>();
  for (const p of pagos) porDia.set(diaBogota(p.fecha), (porDia.get(diaBogota(p.fecha)) ?? 0) + p.valor);
  const valorDoctor = new Map<string, number>();
  for (const o of ordenesDoctor) {
    const n = o.doctorRemitente?.name ?? "—";
    valorDoctor.set(n, (valorDoctor.get(n) ?? 0) + o.items.reduce((t, i) => t + i.precio, 0));
  }

  return {
    produccion: produccion._sum.precio ?? 0,
    cobros: pagos.reduce((t, p) => t + p.valor, 0),
    cartera: abiertas.reduce((t, f) => t + saldo(f.total, f.pagos), 0),
    ingresosPorDia: diasDelRango(r).map((dia) => ({ dia: dia.slice(5), valor: porDia.get(dia) ?? 0 })),
    ordenesPorEstado: porEstado.map((e) => ({ nombre: e.estado, total: e._count._all })),
    estudiosPorModalidad: porModalidad.map((m) => ({ nombre: m.modalidad ?? "Sin modalidad", total: m._count._all })),
    topDoctores: [...valorDoctor].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor).slice(0, 10),
    citasPorEstado: porEstadoCita.map((e) => ({ nombre: e.estado, total: e._count._all })),
  };
}
