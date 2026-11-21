// Seed idempotente de convenios y tarifas especiales en radex-demo. Uso: DATABASE_URL=… npx tsx scripts/seed-convenios.ts
import { prisma } from "@dent-view/db";

const org = await prisma.organization.findUnique({ where: { slug: "radex-demo" } });
if (!org) throw new Error("Falta la organización radex-demo (corre npm run seed -w @dent-view/web).");

const servicio = (nombre: string) => prisma.servicio.findFirst({ where: { organizationId: org.id, nombre } });

async function convenio(nombre: string, data: { nit: string; contacto: string; descuentoGeneral: number | null }) {
  const existente = await prisma.convenio.findFirst({ where: { organizationId: org!.id, nombre } });
  return existente
    ? prisma.convenio.update({ where: { id: existente.id }, data })
    : prisma.convenio.create({ data: { organizationId: org!.id, nombre, ...data } });
}

async function tarifa(servicioNombre: string, destino: { convenioId: string } | { doctorId: string }, precioImpreso: number, precioDigital: number) {
  const s = await servicio(servicioNombre);
  if (!s) return console.warn(`Servicio no encontrado: ${servicioNombre} (corre seed-catalogo.ts)`);
  const donde = { servicioId: s.id, ...destino };
  const data = { precioImpreso, precioDigital };
  const { count } = await prisma.tarifaEspecial.updateMany({ where: { organizationId: org!.id, ...donde }, data });
  if (!count) await prisma.tarifaEspecial.create({ data: { organizationId: org!.id, ...donde, ...data } });
}

await convenio("Clínica Sonrisa Andina", { nit: "900.123.456-7", contacto: "Convenios · 606 555 0101", descuentoGeneral: 10 });
const puntual = await convenio("Ortodoncia Integral Manizales", { nit: "901.234.567-8", contacto: "Dra. Marcela Ríos · 300 555 0102", descuentoGeneral: null });
await tarifa("Panorámica", { convenioId: puntual.id }, 45000, 38000);
await tarifa("Tomografía 1 zona", { convenioId: puntual.id }, 150000, 150000);
await tarifa("PAQ 1", { convenioId: puntual.id }, 120000, 110000);

const doctor = await prisma.user.findUnique({ where: { email: "doctor@pepito.demo" } });
const miembro = doctor && (await prisma.member.findUnique({ where: { organizationId_userId: { organizationId: org.id, userId: doctor.id } } }));
if (!doctor || miembro?.role !== "doctor_remitente") {
  console.warn("doctor@pepito.demo no es doctor remitente de radex-demo: se omiten sus tarifas.");
} else {
  await tarifa("Panorámica", { doctorId: doctor.id }, 40000, 35000);
  await tarifa("Perfil", { doctorId: doctor.id }, 40000, 35000);
  await tarifa("Tomografía 1 zona", { doctorId: doctor.id }, 140000, 140000);
}
console.log("Convenios listos: 2 convenios y tarifas especiales para doctor@pepito.demo.");
await prisma.$disconnect();
