// Seed idempotente del catálogo real de Radex (COP) y sus salas. Uso: DATABASE_URL=… npx tsx scripts/seed-catalogo.ts
import { prisma } from "@dent-view/db";

type S = [nombre: string, impreso: number | null, digital: number | null, descuento: number, descripcion?: string];

const estudios2D: S[] = [
  ["Panorámica", 60000, 50000, 10000],
  ["Perfil", 60000, 50000, 10000],
  ["Posteroanterior y anteroposterior", 60000, 50000, 10000],
  ["Carpograma", 60000, 50000, 10000],
  ["ATM", 65000, 55000, 10000],
  ["Waters", 65000, 55000, 10000],
  ["Senos paranasales", 65000, 55000, 10000],
  ["Periapical completo", 130000, 120000, 10000],
  ["Medio periapical", 80000, 70000, 10000],
  ["Parcial individual", 45000, 40000, 10000],
  ["Coronales", 90000, 80000, 10000],
  ["Fotos x5", 60000, 55000, 10000],
  ["Fotos x8", 65000, 60000, 10000],
  ["Fotos x3", 55000, 50000, 10000],
  ["Foto individual", 40000, 35000, 10000],
];
const tomo = (n: string, p: number): S => [n, p, p, 20000];
const tomografias: S[] = [
  tomo("Tomografía 1 zona", 170000),
  tomo("Maxilar superior e inferior", 210000),
  tomo("Bimaxilar", 340000),
  tomo("Facial", 340000),
  tomo("Senos paranasales", 340000),
  tomo("ATM unilateral", 210000),
  tomo("ATM bilateral", 340000),
  ["Tomografía de control", null, null, 0, "50 % del valor de la tomografía original"],
];
const paq = (n: string, i: number, d: number, desc?: string): S => [n, i, d, 10000, desc && `${desc} (verificar)`];
const paquetes: S[] = [
  paq("PAQ 1", 140000, 130000, "Panorámica, perfil, trazos cefalométricos, juego de fotografías, modelos impresos"),
  paq("PAQ 2", 120000, 110000, "Panorámica, perfil, trazos cefalométricos, juego de 8 fotografías"),
  paq("PAQ 3", 180000, 170000, "Periapical completo, juego de 8 fotografías, modelos impresos en resina 3D"),
  paq("PAQ 4", 150000, 140000, "Panorámica, perfil, trazos cefalométricos, 8 fotografías, periapicales anteriores, modelos 3D articulados"),
  paq("PAQ 5", 130000, 120000, "Panorámica, perfil, trazos cefalométricos, 8 fotografías, escaneo digital"),
  paq("PAQ 6", 100000, 90000, "Panorámica y juego de 8 fotografías"),
  paq("PAQ final", 115000, 105000),
];
const escaneos: S[] = [["Escaneo dental", null, 80000, 0]];

const grupos: [string, S[]][] = [
  ["ESTUDIO_2D", estudios2D],
  ["TOMOGRAFIA", tomografias],
  ["PAQUETE", paquetes],
  ["ESCANEO", escaneos],
];
const salas: [string, string][] = [
  ["CS 9600 · Tomografía", "teal"],
  ["Panorámico", "sky"],
  ["Intraoral", "violet"],
];

const org = await prisma.organization.findUnique({ where: { slug: "radex-demo" } });
if (!org) throw new Error("Falta la organización radex-demo (corre npm run seed -w @dent-view/web).");

for (const [categoria, lista] of grupos) {
  for (const [nombre, precioImpreso, precioDigital, descuento, descripcion] of lista) {
    const data = { precioImpreso, precioDigital, descuento, descripcion: descripcion ?? null };
    const existente = await prisma.servicio.findFirst({ where: { organizationId: org.id, categoria, nombre } });
    if (existente) await prisma.servicio.update({ where: { id: existente.id }, data });
    else await prisma.servicio.create({ data: { organizationId: org.id, categoria, nombre, ...data } });
  }
}
for (const [nombre, color] of salas) {
  if (!(await prisma.sala.findFirst({ where: { organizationId: org.id, nombre } }))) {
    await prisma.sala.create({ data: { organizationId: org.id, nombre, color } });
  }
}
console.log(`Catálogo listo: ${grupos.reduce((n, [, l]) => n + l.length, 0)} servicios y ${salas.length} salas.`);
await prisma.$disconnect();
