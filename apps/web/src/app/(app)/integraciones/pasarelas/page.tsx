import { prisma } from "@dent-view/db";
import { BotonConciliar, TarjetaPasarela } from "@/components/integraciones/pasarelas/tarjeta-pasarela";
import { cop } from "@/lib/precios";
import { descifrar, secretoCifrado } from "@/lib/cifrado";
import { ultimos4 } from "@/lib/pagos/proveedor";
import { ADAPTADORES, slugProveedor } from "@/lib/pagos/registro";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Pasarelas() {
  const ctx = await exigirContexto(ADMIN);
  const pasarelas = await prisma.pasarelaPago.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, proveedor: true, modo: true, activa: true, llavesCifradas: true, _count: { select: { links: true } } },
  });
  const sinResolver = await prisma.linkPago.aggregate({ where: { organizationId: ctx.organizationId, estado: { in: ["CREADO", "PENDIENTE"] } }, _count: true, _sum: { monto: true } });
  const base = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
        Conecta TU cuenta de pasarela: el dinero va directo a tu cuenta y dent-view no retiene fondos ni toca datos de tarjeta (el pago ocurre en la página de la pasarela). Las llaves se guardan cifradas y solo se muestran sus últimos 4 caracteres.
      </p>
      {process.env.PAGOS_SIMULADO === "1" && (
        <p role="status" className="max-w-2xl rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-pretty">Modo simulado activo (solo desarrollo): en SANDBOX no se llama a las pasarelas; los links y la prueba de conexión son locales.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <BotonConciliar />
        <span className="text-xs text-muted-foreground">{sinResolver._count} links sin resolver{sinResolver._sum.monto ? ` por ${cop(sinResolver._sum.monto)}` : ""}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.values(ADAPTADORES).map((a) => {
          const p = pasarelas.find((x) => x.proveedor === a.clave);
          let ultimos: Record<string, string> = {};
          try {
            const llaves: Record<string, string> = p && secretoCifrado() ? JSON.parse(descifrar(p.llavesCifradas, secretoCifrado()!)) : {};
            ultimos = Object.fromEntries(a.campos.map((c) => [c.clave, ultimos4(llaves[c.clave])]));
          } catch {
            ultimos = {};
          }
          return (
            <TarjetaPasarela
              key={a.clave}
              adaptador={{ clave: a.clave, nombre: a.nombre, descripcion: a.descripcion, noProbado: a.bloqueadoProduccion, advertencia: a.advertencia ?? null, campos: a.campos }}
              pasarela={p ? { id: p.id, modo: p.modo, activa: p.activa, links: p._count.links, ultimos, urlWebhook: `${base}/api/pagos/${slugProveedor(a.clave)}/${p.id}` } : null}
            />
          );
        })}
      </div>
    </div>
  );
}
