// Crea la conexión "Simulado (pruebas)" del centro demo y muestra el secreto del webhook de entrada UNA vez. Requiere seed.ts.
// Uso: DATABASE_URL=… BETTER_AUTH_SECRET=… npx tsx scripts/seed-conectores.ts
import { prisma } from "@dent-view/db";
import { cifrar } from "../src/lib/cifrado";
import { generarSecretoEntrada } from "../src/lib/integraciones/entrada";

const secreto = process.env.BETTER_AUTH_SECRET;
if (!secreto) throw new Error("Falta BETTER_AUTH_SECRET (el mismo de la app)");
const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "radex-demo" } });
await prisma.integracion.deleteMany({ where: { organizationId: org.id, proveedor: "simulado" } });
const s = generarSecretoEntrada();
const i = await prisma.integracion.create({
  data: { organizationId: org.id, proveedor: "simulado", nombre: "Simulado (pruebas)", credencialesCifradas: cifrar(JSON.stringify({ codigo: "demo" }), secreto), secretoEntrada: cifrar(s, secreto) },
});
console.log(`Integración simulada ${i.id}\nsecreto de entrada: ${s}`);
await prisma.$disconnect();
