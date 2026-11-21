// Crea (o reemplaza) un token de lectura "MCP demo" para el centro demo y lo imprime UNA vez. Requiere seed.ts.
// Uso: DATABASE_URL=… npx tsx scripts/seed-mcp.ts [pii]   (con "pii" el token ve nombres y documentos completos)
import { prisma } from "@dent-view/db";
import { generarTokenApi, SOLO_LECTURA } from "../src/lib/api-token";

const conPii = process.argv.includes("pii");
const nombre = conPii ? "MCP demo (pii)" : "MCP demo";
const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "radex-demo" } });
await prisma.tokenApi.deleteMany({ where: { organizationId: org.id, nombre } });
const { token, prefijo, tokenHash } = generarTokenApi();
await prisma.tokenApi.create({ data: { organizationId: org.id, nombre, prefijo, tokenHash, permisos: conPii ? [...SOLO_LECTURA, "mcp", "pii"] : [...SOLO_LECTURA, "mcp"] } });
console.log(`Token ${nombre} (solo se muestra ahora):\n${token}`);
await prisma.$disconnect();
