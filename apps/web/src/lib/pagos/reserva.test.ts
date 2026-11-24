import { prisma } from "@dent-view/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reservarLinkPago } from "./reserva";

// Requiere la BD de desarrollo: se omite si no hay DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)("reservarLinkPago (carrera de dos clics)", () => {
  const s = `${Date.now()}`;
  const org = `rsv-${s}`;
  let pasarelaId = "", facturaId = "";

  beforeAll(async () => {
    await prisma.organization.create({ data: { id: org, name: org, slug: org } });
    pasarelaId = (await prisma.pasarelaPago.create({ data: { organizationId: org, proveedor: "WOMPI", llavesCifradas: "x" } })).id;
    facturaId = (await prisma.factura.create({ data: { organizationId: org, numero: 1, total: 100_000 } })).id;
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: org } });
    await prisma.$disconnect();
  });

  const reservar = (i: number) => reservarLinkPago(prisma, { organizationId: org, facturaId, pasarelaId, referencia: `dv-${s}-${i}`, expiraEn: new Date(Date.now() + 86_400_000), creadoPorId: "u" });

  it("dos clics simultáneos por el saldo completo: solo uno se crea", async () => {
    const r = await Promise.all(Array.from({ length: 8 }, (_, i) => reservar(i)));
    expect(r.filter((x) => "id" in x)).toHaveLength(1);
    expect(r.filter((x) => "error" in x)).toHaveLength(7);
    const links = await prisma.linkPago.findMany({ where: { facturaId } });
    expect(links.reduce((t, l) => t + l.monto, 0)).toBeLessThanOrEqual(100_000);
  });

  it("espera el bloqueo de la Factura (FOR UPDATE): no calcula lo comprometido sobre datos viejos", async () => {
    const f2 = (await prisma.factura.create({ data: { organizationId: org, numero: 2, total: 50_000 } })).id;
    let liberar!: () => void;
    const bloqueo = new Promise<void>((r) => { liberar = r; });
    let tomado!: () => void;
    const listo = new Promise<void>((r) => { tomado = r; });
    const reteniendo = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Factura" WHERE id = ${f2} FOR UPDATE`;
      tomado();
      await bloqueo;
    });
    await listo;
    let terminado = false;
    const r = reservarLinkPago(prisma, { organizationId: org, facturaId: f2, pasarelaId, referencia: `dv-${s}-lock`, expiraEn: new Date(Date.now() + 86_400_000), creadoPorId: "u" }).then((x) => { terminado = true; return x; });
    await new Promise((res) => setTimeout(res, 400));
    expect(terminado).toBe(false);
    liberar();
    await reteniendo;
    expect(await r).toMatchObject({ monto: 50_000 });
  });
});
