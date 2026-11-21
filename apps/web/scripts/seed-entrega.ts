// Seed idempotente: un enlace de entrega demo (paciente Laura Gómez, estudio y/o informe emitido si existen).
// Uso: BETTER_AUTH_SECRET=<el mismo del servidor> DATABASE_URL=… npx tsx scripts/seed-entrega.ts
// Requiere seed.ts y seed-pacientes.ts. El token y el código se imprimen solo en consola y solo al crear el enlace.
import { prisma } from "@dent-view/db";
import { generarCodigoAcceso, generarToken, hashCodigo, hashToken } from "../src/lib/entrega";

const secreto = process.env.BETTER_AUTH_SECRET;
if (!secreto) throw new Error("Define BETTER_AUTH_SECRET (el mismo que usa el servidor, o el código no validará)");

const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "radex-demo" } });
const persona = await prisma.persona.findFirstOrThrow({ where: { numeroDocumento: "1053800101" } });
const pac = await prisma.pacienteTenant.findUniqueOrThrow({ where: { organizationId_personaId: { organizationId: org.id, personaId: persona.id } } });

const demo = await prisma.enlaceEntrega.findFirst({ where: { organizationId: org.id, pacienteId: pac.id, destinatarioNombre: "Enlace demo", revocadoEn: null, venceEn: { gt: new Date() } } });
if (demo) {
  console.log(`Ya existe un enlace demo vigente (${demo.id}); no se vuelve a crear (el token no se puede recuperar).`);
} else {
  let estudio = await prisma.estudio.findFirst({ where: { organizationId: org.id, pacienteId: pac.id }, orderBy: { creadoEn: "desc" } });
  const informe = await prisma.informe.findFirst({ where: { organizationId: org.id, pacienteId: pac.id, estado: "EMITIDO", vigente: true }, orderBy: { emitidoEn: "desc" } });
  if (informe?.estudioId) estudio = (await prisma.estudio.findUnique({ where: { id: informe.estudioId } })) ?? estudio;
  const token = generarToken(), codigo = generarCodigoAcceso(), tokenHash = hashToken(token);
  await prisma.enlaceEntrega.create({
    data: {
      organizationId: org.id, pacienteId: pac.id, informeId: informe?.id ?? null, estudioUids: estudio ? [estudio.studyInstanceUid] : [],
      destinatarioTipo: "PACIENTE", destinatarioNombre: "Enlace demo", destinatarioCorreo: pac.correo, tokenHash,
      codigoHash: hashCodigo(tokenHash, codigo, secreto), venceEn: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  console.log(`Enlace demo creado (informe: ${informe ? "sí" : "no"}, estudios: ${estudio ? 1 : 0}).`);
  console.log(`  URL:    ${process.env.APP_URL ?? "http://localhost:3000"}/resultados/${token}`);
  console.log(`  Código: ${codigo}`);
}
await prisma.$disconnect();
