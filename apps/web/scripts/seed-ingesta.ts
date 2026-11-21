// Estación de ingesta demo para un centro. Idempotente: reutiliza la estación por nombre y le asigna un token nuevo,
// que imprime (es la única vez que se ve). Uso: DATABASE_URL=… npx tsx scripts/seed-ingesta.ts [slug-del-centro]
import { prisma } from "@dent-view/db";
import { generarToken, hashToken } from "../src/lib/entrega";

const slug = process.argv[2] ?? "radex-2-demo";
const nombre = "PC demo (agente de ingesta)";
const org = await prisma.organization.findUnique({ where: { slug } });
if (!org) throw new Error(`No existe el centro ${slug}; corre primero npm run seed`);

const token = generarToken();
const existente = await prisma.estacionIngesta.findFirst({ where: { organizationId: org.id, nombre } });
if (existente) await prisma.estacionIngesta.update({ where: { id: existente.id }, data: { tokenHash: hashToken(token), activa: true } });
else await prisma.estacionIngesta.create({ data: { organizationId: org.id, nombre, tokenHash: hashToken(token) } });

console.log(`Estación "${nombre}" de ${slug}. Token: ${token}`);
await prisma.$disconnect();
