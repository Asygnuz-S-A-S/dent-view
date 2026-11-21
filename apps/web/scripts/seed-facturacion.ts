// Seed idempotente de órdenes y cuentas de cobro demo en radex-demo. Uso: DATABASE_URL=… npx tsx scripts/seed-facturacion.ts
import { prisma } from "@dent-view/db";
import { totalItems } from "../src/lib/facturacion";
import { precioFinal } from "../src/lib/precios";

const org = await prisma.organization.findUnique({ where: { slug: "radex-demo" } });
if (!org) throw new Error("Falta el centro radex-demo (corre npm run seed -w @dent-view/web)");
const doctor = await prisma.user.findUnique({ where: { email: "doctor@pepito.demo" } });
if (!doctor) throw new Error("Falta doctor@pepito.demo");

const servicios = await prisma.servicio.findMany({ where: { organizationId: org.id, activo: true }, orderBy: { nombre: "asc" }, take: 6 });
if (servicios.length === 0) throw new Error("Falta el catálogo (npx tsx scripts/seed-catalogo.ts)");

// 3 pacientes demo (Persona por documento, idempotente).
const demo = [
  ["900001", "Laura Gómez"],
  ["900002", "Carlos Ramírez"],
  ["900003", "Ana Torres"],
] as const;
const pacientes = [];
for (const [numeroDocumento, nombre] of demo) {
  const persona = await prisma.persona.upsert({
    where: { tipoDocumento_numeroDocumento: { tipoDocumento: "CC", numeroDocumento } },
    update: {},
    create: { tipoDocumento: "CC", numeroDocumento },
  });
  pacientes.push(
    (await prisma.pacienteTenant.findUnique({ where: { organizationId_personaId: { organizationId: org.id, personaId: persona.id } } })) ??
      (await prisma.pacienteTenant.create({ data: { organizationId: org.id, personaId: persona.id, nombre } })),
  );
}

// Órdenes: solo si el centro no tiene ninguna.
if ((await prisma.orden.count({ where: { organizationId: org.id } })) === 0) {
  for (const [i, p] of pacientes.entries()) {
    const s = servicios.slice(i, i + 2);
    await prisma.orden.create({
      data: {
        organizationId: org.id,
        numero: i + 1,
        pacienteId: p.id,
        doctorRemitenteId: i === 2 ? doctor.id : null,
        entrega: "DIGITAL",
        items: { create: s.map((x) => ({ servicioId: x.id, nombre: x.nombre, precio: precioFinal(x, "DIGITAL") ?? 0 })) },
      },
    });
  }
}

// Cuentas de cobro: solo si no hay ninguna.
if ((await prisma.factura.count({ where: { organizationId: org.id } })) === 0) {
  const ordenes = await prisma.orden.findMany({ where: { organizationId: org.id }, include: { items: true }, orderBy: { numero: "asc" }, take: 3 });
  const dias = (n: number) => new Date(Date.now() - n * 86_400_000);
  const plan = [
    { responsable: "PACIENTE" as const, antig: 10, vence: null, abono: "total" as const },
    { responsable: "PACIENTE" as const, antig: 45, vence: dias(45), abono: "parcial" as const },
    { responsable: "DOCTOR" as const, antig: 5, vence: null, abono: null },
  ];
  for (const [i, o] of ordenes.entries()) {
    const cfg = plan[i];
    const items = o.items.map((x) => ({ descripcion: x.nombre, cantidad: 1, valorUnitario: x.precio }));
    const total = totalItems(items);
    await prisma.factura.create({
      data: {
        organizationId: org.id,
        numero: i + 1,
        pacienteId: o.pacienteId,
        ordenId: o.id,
        responsable: cfg.responsable,
        responsableId: cfg.responsable === "DOCTOR" ? doctor.id : null,
        total,
        fecha: dias(cfg.antig),
        vence: cfg.vence,
        estado: cfg.abono === "total" ? "PAGADA" : "ABIERTA",
        items: { create: items },
        pagos: cfg.abono ? { create: { valor: cfg.abono === "total" ? total : Math.floor(total / 3), medio: "TRANSFERENCIA", fecha: dias(cfg.antig - 1) } } : undefined,
      },
    });
  }
}
console.log("Seed de facturación listo");
await prisma.$disconnect();
