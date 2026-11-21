// Seed idempotente de pacientes y perfil de doctor demo (ficticios). Requiere haber corrido seed.ts.
// Uso: DATABASE_URL=… npx tsx scripts/seed-pacientes.ts
import { prisma } from "@dent-view/db";

const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "radex-demo" } });

const pacientes = [
  { doc: "1053800101", nombre: "Laura Valentina Gómez Ríos", nac: "1992-03-14", cel: "3105550101", alertas: "Alergia a la penicilina. Embarazo de 20 semanas." },
  { doc: "1053800102", nombre: "Juan David Ospina Marín", nac: "1985-11-02", cel: "3115550102" },
  { doc: "1053800103", nombre: "María Camila Restrepo Salazar", nac: "2001-07-21", cel: "3125550103" },
  { doc: "10240510", nombre: "Carlos Andrés Henao Duque", nac: "1978-01-30", cel: "3135550104" },
  { doc: "1053800105", nombre: "Sofía Alejandra Torres Cardona", nac: "2014-09-09", cel: "3145550105", tipo: "TI" },
  { doc: "24310620", nombre: "Gloria Esperanza Giraldo Botero", nac: "1960-05-27", cel: "3155550106" },
];

for (const p of pacientes) {
  const clave = { tipoDocumento: p.tipo ?? "CC", numeroDocumento: p.doc };
  const persona = await prisma.persona.upsert({
    where: { tipoDocumento_numeroDocumento: clave },
    update: {},
    create: clave,
  });
  await prisma.pacienteTenant.upsert({
    where: { organizationId_personaId: { organizationId: org.id, personaId: persona.id } },
    update: {},
    create: { organizationId: org.id, personaId: persona.id, alertas: p.alertas, nombre: p.nombre, fechaNacimiento: new Date(`${p.nac}T00:00:00Z`), celular: p.cel, direccion: "Manizales, Caldas" },
  });
}

const doctor = await prisma.user.findUniqueOrThrow({ where: { email: "doctor@pepito.demo" } });
await prisma.perfilDoctor.upsert({
  where: { userId: doctor.id },
  update: {},
  create: { userId: doctor.id, tarjetaProfesional: "TP-12345", especialidad: "Ortodoncia", telefono: "3205550199", consultorio: "Consultorio 302, Manizales" },
});

console.log(`Seed pacientes listo: ${pacientes.length} pacientes y perfil de ${doctor.email}.`);
await prisma.$disconnect();
