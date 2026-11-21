// Seed idempotente de la marca demo (white-label): Radex en verde azulado y Radex 2 en vino, cada uno con un logo simple.
// Uso: DATABASE_URL=… npx tsx scripts/seed-marca.ts
import { crc32, deflateSync } from "node:zlib";
import { prisma } from "@dent-view/db";

/** Logo demo: PNG 64×64 con un cuadrado redondeado del color y un anillo blanco. */
function logoPng(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const n = 64;
  const filas: number[] = [];
  for (let y = 0; y < n; y++) {
    filas.push(0); // filtro "None" por fila
    for (let x = 0; x < n; x++) {
      const [dx, dy] = [Math.max(Math.abs(x - 31.5) - 20, 0), Math.max(Math.abs(y - 31.5) - 20, 0)];
      const dentro = Math.hypot(dx, dy) <= 12; // esquinas con radio 12
      const radio = Math.hypot(x - 31.5, y - 31.5);
      const anillo = radio >= 11 && radio <= 17;
      filas.push(...(!dentro ? [0, 0, 0, 0] : anillo ? [255, 255, 255, 255] : [r!, g!, b!, 255]));
    }
  }
  const bloque = (tipo: string, datos: Buffer) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(cuerpo));
    return Buffer.concat([largo, cuerpo, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloque("IHDR", ihdr),
    bloque("IDAT", deflateSync(Buffer.from(filas))),
    bloque("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

const MARCAS = [
  { slug: "radex-demo", nombre: "Radex Imágenes Diagnósticas", color: "#0f766e" },
  { slug: "radex-2-demo", nombre: "Radex 2", color: "#9f1239" },
];

for (const m of MARCAS) {
  const org = await prisma.organization.findUnique({ where: { slug: m.slug } });
  if (!org) {
    console.warn(`Falta la organización ${m.slug} (corre npm run seed -w @dent-view/web).`);
    continue;
  }
  const marca = { colorPrimario: m.color, logo: logoPng(m.color) };
  // El nombre solo se fija al crear: puede venir del membrete de informes.
  await prisma.configCentro.upsert({ where: { organizationId: org.id }, create: { organizationId: org.id, nombre: m.nombre, ...marca }, update: marca });
  console.log(`Marca de ${m.slug}: ${m.color}`);
}
