// Seed idempotente del superadmin de la plataforma. Uso: DATABASE_URL=… BETTER_AUTH_SECRET=… npx tsx scripts/seed-plataforma.ts
import { randomUUID } from "node:crypto";
import { prisma } from "@dent-view/db";
import { auth } from "../src/lib/auth";

const email = "superadmin@dentview.demo";
const password = process.env.SEED_PASSWORD ?? "dentview-demo-2026";

const ctx = await auth.$context;
const id = randomUUID();
const existente = await prisma.user.findUnique({ where: { email } });
if (existente) {
  await prisma.user.update({ where: { id: existente.id }, data: { role: "admin" } });
} else {
  await prisma.user.create({
    data: {
      id,
      email,
      name: "Superadmin dent-view",
      role: "admin",
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          providerId: "credential",
          accountId: id, // Better Auth exige accountId = userId en cuentas "credential"
          password: await ctx.password.hash(password),
        },
      },
    },
  });
}

console.log(`Superadmin listo: ${email}`);
await prisma.$disconnect();
