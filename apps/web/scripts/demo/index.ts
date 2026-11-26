// Entorno de demostración comercial: borra (opcional) y crea cuatro centros ficticios con datos en todos los módulos.
//   npx tsx scripts/demo/index.ts --reset [--solo-datos]
//   npx tsx scripts/demo/index.ts --solo-datos        (no borra; idempotente por slug)
// Entorno: DATABASE_URL (dueño de la BD), ORTHANC_URL, S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET_ESTUDIOS, S3_BUCKET_ORTHANC,
// BETTER_AUTH_SECRET, CIFRADO_SECRETO, ADMIN_EMAIL, ADMIN_NOMBRE, ADMIN_HASH (hash scrypt de Better Auth), DEMO_CLAVE, FECHA_BASE (opcional, AAAA-MM-DD).
import { prisma } from "@dent-view/db";
import { LUMIA, RADIA, DEF } from "./centros";
import { asegurarBucket } from "./externos";
import { asegurarSuperadmin, hashDemo } from "./nucleo";
import { construirAlejandro } from "./odontologo";
import { construirOrion } from "./laboratorio";
import { construirRadiologico } from "./radiologico";
import { construirRemisiones } from "./remisiones";
import { generarYSubir } from "./estudios";
import { borrarTodo, imprimirResumen, usuariosReales } from "./reset";
import { crearRng, FECHA_BASE, generadorDocumentos, generadorNombres, leerEntorno, log } from "./util";

const args = new Set(process.argv.slice(2));
const reset = args.has("--reset");
const soloDatos = args.has("--solo-datos");
if (!reset && !soloDatos) {
  console.error("Uso: npx tsx scripts/demo/index.ts --reset [--solo-datos]\n  --reset        borra todo (menos el superadmin) y crea la demo\n  --solo-datos   no borra: crea o actualiza por slug");
  process.exit(2);
}

const t0 = Date.now();
const env = leerEntorno();
const destino = (() => { try { const u = new URL(process.env.DATABASE_URL!); return `${u.hostname}:${u.port || 5432}${u.pathname}`; } catch { return "(DATABASE_URL no es una URL)"; } })();
log(`Destino: BD ${destino} · Orthanc ${env.orthanc} · S3 ${process.env.S3_ENDPOINT} · FECHA_BASE ${FECHA_BASE}`);
if (reset && soloDatos) log("Se pasaron --reset y --solo-datos: gana --solo-datos (NO se borra nada).");

// El esquema debe estar migrado: sin eso no es el entorno esperado.
const [{ n: migraciones }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
if (Number(migraciones) === 0) throw new Error("La base no tiene migraciones aplicadas: no parece el entorno esperado");
const reales = await usuariosReales(env);
if (!reset && reales > 5) throw new Error(`Hay ${reales} usuarios que no son demo y falta --reset: no se corre contra una base con datos reales`);

await asegurarBucket(env.bucket);
if (reset && !soloDatos) {
  await imprimirResumen(env);
  log(`Usuarios no demo (se borrarán): ${reales}`);
  await borrarTodo(env);
}

const superId = await asegurarSuperadmin(env);
const hash = await hashDemo(env);
log("Superadmin y clave demo listos.");

const generador = { nombre: generadorNombres(crearRng("nombres")), documento: generadorDocumentos(crearRng("documentos")), superId };
const resumen: Record<string, unknown> = {};
const exentos: string[] = [];

type Resultado = { A: { volcar: () => Promise<Record<string, number>> }; org: { id: string }; planes: Parameters<typeof generarYSubir>[2]; resumen: unknown; despues?: () => Promise<void> } | null;
const centros: [string, () => Promise<Resultado>][] = [
  ["lumia", (async () => construirRadiologico(env, hash, LUMIA, generador, await yaPoblado("lumia"))) as () => Promise<Resultado>],
  ["radia", (async () => construirRadiologico(env, hash, RADIA, generador, await yaPoblado("radia"))) as () => Promise<Resultado>],
  ["alejandro-restrepo", (async () => construirAlejandro(env, hash, generador, await yaPoblado("alejandro-restrepo"))) as () => Promise<Resultado>],
  ["orion-laboratorio", (async () => construirOrion(env, hash, generador, await yaPoblado("orion-laboratorio"))) as () => Promise<Resultado>],
];
async function yaPoblado(slug: string) {
  return (await prisma.pacienteTenant.count({ where: { organization: { slug } } })) > 0;
}

for (const [slug, construir] of centros) {
  const t = Date.now();
  log(`Centro ${DEF[slug as keyof typeof DEF].nombre} (${slug})...`);
  const r = await construir();
  if (!r) { log("  ya tiene datos: se actualizaron centro, usuarios y miembros; usa --reset para regenerar."); continue; }
  const cuentas = await r.A.volcar();
  await generarYSubir(env, r.org.id, r.planes);
  await r.despues?.();
  resumen[slug] = { ...(r.resumen as object), filas: cuentas };
  log(`  listo en ${((Date.now() - t) / 1000).toFixed(1)} s`);
}

// Remisiones Lumia <-> Radia (necesitan a los dos centros ya poblados).
if ((await prisma.pacienteTenant.count({ where: { organization: { slug: { in: ["lumia", "radia"] } } } })) > 0) await construirRemisiones(env);

// Los administradores de centro exigen 2FA salvo que el correo esté en MFA_EXENTOS de la app (nunca aplica al superadmin).
for (const slug of Object.keys(DEF)) exentos.push(`admin@${slug}.ejemplo.invalid`);
console.log("\nResumen:", JSON.stringify(resumen, null, 1));
console.log(`\nMFA_EXENTOS recomendado para la app (para que la demo no pida activar 2FA a los admin demo):\n  MFA_EXENTOS=${exentos.join(",")}`);
log(`Terminado en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await prisma.$disconnect();
