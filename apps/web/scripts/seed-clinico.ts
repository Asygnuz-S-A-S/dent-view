// Seed idempotente de plan de tratamiento, notas clínicas y laboratorio (ficticios). Requiere seed.ts y seed-pacientes.ts.
// Uso: DATABASE_URL=… npx tsx scripts/seed-clinico.ts
import { prisma } from "@dent-view/db";

const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "radex-demo" } });
const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@radex.demo" } });
const paciente = await prisma.pacienteTenant.findFirstOrThrow({
  where: { organizationId: org.id, persona: { numeroDocumento: "1053800101" } },
});
const otro = await prisma.pacienteTenant.findFirstOrThrow({
  where: { organizationId: org.id, persona: { numeroDocumento: "1053800102" } },
});

const dias = (n: number) => new Date(Date.now() + n * 86_400_000);

// Idempotencia: cada bloque se siembra solo si el paciente/centro aún no tiene datos de ese tipo.
if ((await prisma.planTratamientoItem.count({ where: { pacienteId: paciente.id } })) === 0) {
  await prisma.planTratamientoItem.createMany({
    data: [
      { pacienteId: paciente.id, diente: 16, superficie: "O", descripcion: "Resina compuesta", valor: 180000, estado: "ACEPTADO", posicion: 0 },
      { pacienteId: paciente.id, diente: 26, descripcion: "Endodoncia", valor: 650000, estado: "PLANEADO", posicion: 1, notas: "Confirmar con tomografía" },
      { pacienteId: paciente.id, descripcion: "Profilaxis y detartraje", valor: 120000, estado: "REALIZADO", posicion: 2 },
    ],
  });
}
if ((await prisma.notaClinica.count({ where: { pacienteId: paciente.id } })) === 0) {
  await prisma.notaClinica.createMany({
    data: [
      { pacienteId: paciente.id, autorId: admin.id, fecha: dias(-14), texto: "Primera valoración. Caries oclusal en 16, sensibilidad en 26." },
      { pacienteId: paciente.id, autorId: admin.id, texto: "Se realiza profilaxis. Paciente tolera bien el procedimiento." },
    ],
  });
}
if ((await prisma.casoLaboratorio.count({ where: { organizationId: org.id } })) === 0) {
  await prisma.casoLaboratorio.createMany({
    data: [
      { organizationId: org.id, pacienteId: paciente.id, laboratorio: "Lab Dental Eje Cafetero", tipo: "Modelo en resina 3D", dientes: "16, 26", valor: 90000, estado: "ENVIADO", enviado: dias(-10), entregaEsperada: dias(-3) },
      { organizationId: org.id, pacienteId: otro.id, laboratorio: "Lab Dental Eje Cafetero", tipo: "Guía quirúrgica", dientes: "36", valor: 250000, estado: "PENDIENTE", entregaEsperada: dias(7) },
    ],
  });
}

console.log("Seed clínico listo: plan, notas y casos de laboratorio de radex-demo.");
await prisma.$disconnect();
