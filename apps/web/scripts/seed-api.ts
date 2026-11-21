// Token demo de solo lectura para radex-demo. Idempotente: si ya existe NO lo reimprime (el valor no se guarda, solo su hash).
// Uso: DATABASE_URL=… npx tsx scripts/seed-api.ts [slug-del-centro]
import { prisma } from "@dent-view/db";
import { generarTokenApi, SOLO_LECTURA } from "../src/lib/api-token";

const slug = process.argv[2] ?? "radex-demo";
const nombre = "Token demo (solo lectura)";
const org = await prisma.organization.findUnique({ where: { slug } });
if (!org) throw new Error(`No existe el centro ${slug}; corre primero npm run seed`);

const existente = await prisma.tokenApi.findFirst({ where: { organizationId: org.id, nombre, revocadoEn: null } });
if (existente) {
  console.log(`Ya existe el token demo de ${slug} (${existente.prefijo}…); no se vuelve a mostrar. Revócalo en /integraciones/api para generar otro.`);
} else {
  const { token, prefijo, tokenHash } = generarTokenApi();
  await prisma.tokenApi.create({ data: { organizationId: org.id, nombre, prefijo, tokenHash, permisos: SOLO_LECTURA } });
  console.log(`Token demo de ${slug} (solo lectura). Es la única vez que se muestra:\n${token}`);
}
await prisma.$disconnect();
