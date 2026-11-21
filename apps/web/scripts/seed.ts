// Seed idempotente de orgs y usuarios demo. Uso: DATABASE_URL=… BETTER_AUTH_SECRET=… npm run seed -w @dent-view/web
import { randomUUID } from "node:crypto";
import { prisma } from "@dent-view/db";
import { auth } from "../src/lib/auth";

const password = process.env.SEED_PASSWORD ?? "dentview-demo-2026";

const orgs = [
  { slug: "radex-demo", name: "Radex (demo)" },
  { slug: "radex-2-demo", name: "Radex 2 (demo)" },
];

const usuarios = [
  { email: "admin@radex.demo", name: "Admin Radex", membresias: [["radex-demo", "admin_tenant"]] },
  { email: "admin@radex2.demo", name: "Admin Radex 2", membresias: [["radex-2-demo", "admin_tenant"]] },
  {
    email: "doctor@pepito.demo",
    name: "Dr. Pepito",
    membresias: [["radex-demo", "doctor_remitente"], ["radex-2-demo", "doctor_remitente"]],
  },
];

const ctx = await auth.$context;

const orgIds = new Map<string, string>();
for (const o of orgs) {
  const org = await prisma.organization.upsert({
    where: { slug: o.slug },
    update: { name: o.name },
    create: { id: randomUUID(), ...o },
  });
  orgIds.set(o.slug, org.id);
}

for (const u of usuarios) {
  const existente = await prisma.user.findUnique({ where: { email: u.email } });
  const id = randomUUID();
  const user =
    existente ??
    (await prisma.user.create({
      data: {
        id,
        email: u.email,
        name: u.name,
        emailVerified: true,
        // Cuenta con contraseña hasheada por Better Auth (mismo formato que el login).
        accounts: {
          create: {
            id: randomUUID(),
            providerId: "credential",
            accountId: id, // Better Auth exige accountId = userId en cuentas "credential"
            password: await ctx.password.hash(password),
          },
        },
      },
    }));
  for (const [slug, role] of u.membresias) {
    const organizationId = orgIds.get(slug)!;
    await prisma.member.upsert({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      update: { role },
      create: { id: randomUUID(), organizationId, userId: user.id, role },
    });
  }
}

console.log(`Seed listo: ${orgs.length} organizaciones, ${usuarios.length} usuarios.`);
await prisma.$disconnect();
