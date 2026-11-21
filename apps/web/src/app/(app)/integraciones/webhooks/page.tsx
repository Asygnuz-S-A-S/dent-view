import { prisma } from "@dent-view/db";
import { EntregasWebhooks } from "@/components/integraciones/webhooks/entregas-webhooks";
import { GuiaVerificacion } from "@/components/integraciones/webhooks/guia-verificacion";
import { WebhooksAdmin } from "@/components/integraciones/webhooks/webhooks-admin";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { hace24Horas } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

export default async function Webhooks() {
  const ctx = await exigirContexto(ADMIN);
  const organizationId = ctx.organizationId;
  const desde = hace24Horas();
  const [webhooks, conteos, entregas] = await Promise.all([
    prisma.webhook.findMany({ where: { organizationId }, orderBy: { creadoEn: "desc" }, select: { id: true, nombre: true, url: true, eventos: true, activo: true } }),
    prisma.webhookEntrega.groupBy({ by: ["webhookId", "estado"], where: { organizationId, creadoEn: { gte: desde } }, _count: true }),
    prisma.webhookEntrega.findMany({
      where: { organizationId }, orderBy: { creadoEn: "desc" }, take: 50,
      select: { id: true, evento: true, estado: true, codigoRespuesta: true, intentos: true, error: true, creadoEn: true, proximoIntento: true, payload: true, webhook: { select: { nombre: true } } },
    }),
  ]);
  const cuenta = (id: string, estado: string) => conteos.find((c) => c.webhookId === id && c.estado === estado)?._count ?? 0;
  return (
    <div className="space-y-6">
      <WebhooksAdmin
        webhooks={webhooks.map((w) => {
          const ok = cuenta(w.id, "ENTREGADO");
          const cerradas = ok + cuenta(w.id, "FALLIDO");
          return { ...w, exito24h: cerradas ? Math.round((ok / cerradas) * 100) : null, entregas24h: cerradas };
        })}
      />
      <EntregasWebhooks entregas={entregas.map(({ webhook, ...e }) => ({ ...e, webhook: webhook.nombre }))} />
      <GuiaVerificacion />
    </div>
  );
}
