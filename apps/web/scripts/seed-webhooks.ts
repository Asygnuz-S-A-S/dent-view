// Webhook demo para un centro (apunta a un receptor local). Idempotente: si ya existe por nombre no lo toca.
// Uso: DATABASE_URL=… BETTER_AUTH_SECRET=… WEBHOOKS_PERMITIR_LOCAL=1 npx tsx scripts/seed-webhooks.ts [slug-del-centro]
import { prisma } from "@dent-view/db";
import { cifrar } from "../src/lib/cifrado";
import { generarSecreto, validarUrlWebhook } from "../src/lib/webhooks";

const slug = process.argv[2] ?? "radex-demo";
const nombre = "Receptor local (demo)";
const url = "http://localhost:9999/hook";
const secretoServidor = process.env.BETTER_AUTH_SECRET;
if (!secretoServidor) throw new Error("Falta BETTER_AUTH_SECRET (debe ser el mismo con el que corre la app y el worker)");
const v = validarUrlWebhook(url);
if (!v.ok) throw new Error(`${v.error}. Corre con WEBHOOKS_PERMITIR_LOCAL=1 para usar el receptor local`);
const org = await prisma.organization.findUnique({ where: { slug } });
if (!org) throw new Error(`No existe el centro ${slug}; corre primero npm run seed`);

if (await prisma.webhook.findFirst({ where: { organizationId: org.id, nombre } })) console.log(`Ya existe "${nombre}" en ${slug}`);
else {
  const secreto = generarSecreto();
  await prisma.webhook.create({ data: { organizationId: org.id, nombre, url, eventos: ["*"], secretoCifrado: cifrar(secreto, secretoServidor) } });
  console.log(`Webhook "${nombre}" creado en ${slug}. Secreto (solo se muestra ahora): ${secreto}`);
}
await prisma.$disconnect();
