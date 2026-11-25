// Borrado total previo: datos de negocio, centros, miembros, invitaciones, sesiones y usuarios salvo ADMIN_EMAIL.
import { prisma } from "@dent-view/db";
import { borrarEstudiosOrthanc, estudiosOrthanc, objetosS3 } from "./externos";
import { log, type Entorno } from "./util";

// Tablas que el reset NO vacía con TRUNCATE (se tratan aparte o no se tocan).
const CONSERVAR = new Set(["_prisma_migrations", "User", "Account", "Session", "TwoFactor", "PerfilDoctor", "Verification"]);

const tablas = async () =>
  (await prisma.$queryRaw<{ t: string }[]>`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`).map((r) => r.t);

export async function conteos() {
  const out: Record<string, number> = {};
  for (const t of await tablas()) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t}"`);
    out[t] = Number(n);
  }
  return out;
}

/** Usuarios que no son demo (@ejemplo.invalid) ni el superadmin: si hay muchos, el entorno no es una demo. */
export const usuariosReales = async (env: Entorno) =>
  prisma.user.count({ where: { NOT: [{ email: { endsWith: "ejemplo.invalid" } }, { email: env.adminEmail }] } });

export async function imprimirResumen(env: Entorno) {
  const c = await conteos();
  const filas = Object.entries(c).filter(([t, n]) => n > 0 && t !== "_prisma_migrations");
  log(`Resumen de lo que hay (se borrará todo salvo ${env.adminEmail} y _prisma_migrations):`);
  for (const [t, n] of filas) console.log(`   ${t.padEnd(26)} ${n}`);
  const orth = await estudiosOrthanc(env).then((x) => x.length, () => -1);
  const s3n = await objetosS3(env.bucket, "tenants/", false).catch(() => -1);
  console.log(`   Orthanc estudios           ${orth < 0 ? "(no se pudo consultar)" : orth}`);
  console.log(`   S3 tenants/ objetos        ${s3n < 0 ? "(no se pudo consultar)" : s3n}`);
}

export async function borrarTodo(env: Entorno) {
  const aVaciar = (await tablas()).filter((t) => !CONSERVAR.has(t));
  const lista = aVaciar.map((t) => `"${t}"`).join(", ");
  const previosMigraciones = Number((await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "_prisma_migrations"`)[0]!.n);
  await prisma.$transaction(async (tx) => {
    // Los datos de negocio y los centros (con miembros e invitaciones) se vacían de una vez; CASCADE cubre las llaves foráneas.
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
    await tx.$executeRawUnsafe(`DELETE FROM "Verification"`);
    // Usuarios (con sus cuentas, sesiones, 2FA y perfil por cascada) salvo el superadmin, que se conserva con su 2FA.
    await tx.$executeRaw`DELETE FROM "User" WHERE lower(email) <> ${env.adminEmail}`;
    await tx.$executeRaw`UPDATE "Session" SET "activeOrganizationId" = NULL, "impersonatedBy" = NULL`;
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Organization"`;
    if (Number(n) !== 0) throw new Error("El borrado no dejó la tabla Organization vacía");
  });
  const despues = Number((await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "_prisma_migrations"`)[0]!.n);
  if (despues !== previosMigraciones) throw new Error("_prisma_migrations cambió: abortando");
  log("Base de datos limpia.");
  const est = await borrarEstudiosOrthanc(env);
  log(`Orthanc: ${est} estudios borrados.`);
  const obj = await objetosS3(env.bucket, "tenants/", true);
  log(`S3: ${obj} objetos borrados bajo tenants/.`);
}
