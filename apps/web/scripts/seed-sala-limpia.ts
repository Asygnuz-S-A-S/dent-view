// Implementación independiente (sala limpia) a partir de docs/sala-limpia/*.md
// Seed idempotente de historia clínica, consentimientos, solicitudes, seguimiento e informe borrador (ficticios).
// Requiere seed.ts y seed-pacientes.ts. Uso: DATABASE_URL=… npx tsx scripts/seed-sala-limpia.ts
import { prisma } from "@dent-view/db";

const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "radex-demo" } });
const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@radex.demo" } });
const paciente = (doc: string) => prisma.pacienteTenant.findFirstOrThrow({ where: { organizationId: org.id, persona: { numeroDocumento: doc } } });
const [ana, beto] = await Promise.all([paciente("1053800101"), paciente("1053800102")]);
const fila = (p: { id: string }) => ({ organizationId: org.id, pacienteId: p.id });

await prisma.configCentro.upsert({
  where: { organizationId: org.id },
  create: { organizationId: org.id, direccion: "Cra 23 # 62-10, Manizales", telefono: "606 880 0000", correo: "contacto@radex.demo", registro: "NIT 900.000.000-0" },
  update: {},
});

if (!(await prisma.contextoMedico.findUnique({ where: { pacienteId: ana.id } }))) {
  await prisma.contextoMedico.create({ data: { pacienteId: ana.id, organizationId: org.id, anticoagulantes: true, anticoagulanteNombre: "Warfarina", inr: 2.5, implantesMetalicos: true, actualizadoPorId: admin.id } });
  await prisma.alergiaPaciente.createMany({ data: [{ ...fila(ana), nombre: "Penicilina", gravedad: "ALTA", reaccion: "Urticaria" }, { ...fila(ana), nombre: "Polen", gravedad: "MEDIA" }] });
  await prisma.medicacionPaciente.create({ data: { ...fila(ana), nombre: "Warfarina 5 mg" } });
  await prisma.contactoEmergencia.create({ data: { ...fila(ana), pacienteId: ana.id, nombre: "Carlos Gómez", parentesco: "Esposo", telefono: "3105550101" } });
}
if (!(await prisma.contextoMedico.findUnique({ where: { pacienteId: beto.id } }))) {
  await prisma.contextoMedico.create({ data: { pacienteId: beto.id, organizationId: org.id, embarazo: true, semanasEmbarazo: 20, actualizadoPorId: admin.id } });
}

if ((await prisma.autorizacion.count({ where: { organizationId: org.id } })) === 0) {
  await prisma.autorizacion.create({
    data: { ...fila(ana), finalidad: "tratamiento de datos de salud", otorgada: true, version: "v1", otorgadaEn: new Date(), registradoPorId: admin.id, textoMostrado: "Autorizo al centro a tratar mis datos de salud para la realización e interpretación de mis estudios, conforme a la política de tratamiento de datos." },
  });
}
if ((await prisma.solicitudTitular.count({ where: { organizationId: org.id } })) === 0) {
  await prisma.solicitudTitular.create({ data: { ...fila(ana), organizationId: org.id, solicitanteNombre: "Ana Gómez", solicitanteCorreo: "ana@example.com", tipo: "CONSULTA", venceEn: new Date(Date.now() + 10 * 86_400_000), registradoPorId: admin.id } });
}
if ((await prisma.seguimiento.count({ where: { organizationId: org.id } })) === 0) {
  const hoy = new Date();
  await prisma.seguimiento.create({ data: { ...fila(ana), motivo: "CONTROL", prioridad: "ALTA", mesObjetivo: new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1)), nota: "Control postimplante", creadoPorId: admin.id } });
}
if ((await prisma.informe.count({ where: { organizationId: org.id } })) === 0) {
  const orden = await prisma.orden.findFirst({ where: { organizationId: org.id, pacienteId: ana.id }, orderBy: { numero: "asc" } });
  if (orden) {
    await prisma.informe.create({
      data: { ...fila(ana), grupoId: crypto.randomUUID(), ordenId: orden.id, motivo: "Control", tecnica: "Panorámica", hallazgos: "Sin hallazgos patológicos evidentes.", impresion: "Estudio dentro de límites normales.", creadoPorId: admin.id },
    });
  }
}

console.log("Seed sala limpia listo: historia clínica, consentimiento, solicitud, seguimiento e informe borrador en radex-demo.");
await prisma.$disconnect();
