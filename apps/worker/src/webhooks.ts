// Entrega de webhooks: reclama las entregas PENDIENTE vencidas, las envía firmadas y aplica reintentos con espera exponencial.
import { prisma } from '@dent-view/db';
import { descifrar, secretoCifrado } from '../../web/src/lib/cifrado.ts';
import { cabecerasEntrega, CONCURRENCIA, conConcurrencia, debeDesactivar, decidirTrasIntento, enviarWebhook, FALLOS_PARA_DESACTIVAR, repartirJusto, resumirError } from '../../web/src/lib/webhooks.ts';

type Cliente = typeof prisma;
const ARRENDAMIENTO_MS = 5 * 60_000; // mientras se envía, nadie más puede reclamarla; si el proceso muere, se reintenta pasado este plazo

/** Tras 20 entregas FALLIDAS seguidas el webhook se desactiva solo y queda constancia en auditoría. */
async function desactivarSiCorresponde(db: Cliente, webhookId: string, organizationId: string) {
  // Solo cuentan las entregas posteriores a la última reactivación manual (si no, un webhook reactivado se apagaría al primer fallo).
  const reactivado = await db.evento.findFirst({ where: { organizationId, tipo: 'integracion.webhook_activado', detalle: { path: ['webhookId'], equals: webhookId } }, orderBy: { creadoEn: 'desc' }, select: { creadoEn: true } });
  const ultimos = await db.webhookEntrega.findMany({ where: { webhookId, estado: { in: ['ENTREGADO', 'FALLIDO'] }, ...(reactivado && { creadoEn: { gt: reactivado.creadoEn } }) }, orderBy: { creadoEn: 'desc' }, take: FALLOS_PARA_DESACTIVAR, select: { estado: true } });
  if (!debeDesactivar(ultimos.map((u) => u.estado))) return;
  const { count } = await db.webhook.updateMany({ where: { id: webhookId, organizationId, activo: true }, data: { activo: false } });
  if (count === 1) await db.evento.create({ data: { organizationId, tipo: 'integracion.webhook_desactivado_auto', detalle: { webhookId, motivo: `${FALLOS_PARA_DESACTIVAR} entregas fallidas consecutivas` } } });
}

/** Procesa un lote; devuelve cuántas entregas intentó. Dos procesos nunca toman la misma (reclamo atómico con updateMany). */
export async function procesarEntregas(db: Cliente, opts: { secreto: string; ahora?: () => Date; enviar?: typeof enviarWebhook; lote?: number }) {
  const ahora = opts.ahora ?? (() => new Date());
  const enviar = opts.enviar ?? enviarWebhook;
  const vencidas = await db.webhookEntrega.findMany({
    where: { estado: 'PENDIENTE', proximoIntento: { lte: ahora() } },
    orderBy: { proximoIntento: 'asc' },
    take: 200, // ventana amplia: los webhooks lentos no deben copar el lote y dejar fuera a los demás
    select: { id: true, webhookId: true, organizationId: true },
  });
  const candidatas = repartirJusto(vencidas, { lote: opts.lote ?? 20 });
  let hechas = 0;
  await conConcurrencia(candidatas, CONCURRENCIA, async ({ id }) => {
    const t0 = ahora();
    const { count } = await db.webhookEntrega.updateMany({
      where: { id, estado: 'PENDIENTE', proximoIntento: { lte: t0 } },
      data: { proximoIntento: new Date(t0.getTime() + ARRENDAMIENTO_MS) },
    });
    if (count !== 1) return;
    hechas++;
    const e = await db.webhookEntrega.findUniqueOrThrow({ where: { id }, include: { webhook: true } });
    let codigo: number | null = null;
    let error: string | null = null;
    if (!e.webhook.activo || e.webhook.organizationId !== e.organizationId) {
      // Desactivado (o inconsistente): no se envía; se cierra la entrega.
      await db.webhookEntrega.updateMany({ where: { id, estado: 'PENDIENTE' }, data: { estado: 'FALLIDO', error: 'Webhook desactivado: no se envió' } });
      return;
    }
    try {
      const cuerpo = JSON.stringify(e.payload);
      const r = await enviar({
        url: e.webhook.url,
        cuerpo,
        cabeceras: cabecerasEntrega({ evento: e.evento, entregaId: e.id, secreto: descifrar(e.webhook.secretoCifrado, opts.secreto), cuerpo, ahoraSeg: Math.floor(ahora().getTime() / 1000) }),
      });
      codigo = r.codigo;
      if (r.codigo < 200 || r.codigo >= 300) error = `Respuesta HTTP ${r.codigo}`;
    } catch (err) {
      error = resumirError(err);
    }
    const intentos = e.intentos + 1;
    const d = decidirTrasIntento({ intentos, codigo, ahora: ahora() });
    await db.webhookEntrega.updateMany({
      where: { id, estado: 'PENDIENTE' },
      data: {
        intentos, codigoRespuesta: codigo, error: d.estado === 'ENTREGADO' ? null : error, estado: d.estado,
        ...(d.estado === 'PENDIENTE' && { proximoIntento: d.proximoIntento }),
        ...(d.estado === 'ENTREGADO' && { entregadoEn: ahora() }),
      },
    });
    if (d.estado === 'FALLIDO') await desactivarSiCorresponde(db, e.webhookId, e.organizationId);
  });
  return hechas;
}

/** Bucle de entrega cada ~5 s. Sin BETTER_AUTH_SECRET no puede descifrar los secretos: no arranca. */
export function iniciarEntregaWebhooks() {
  const secreto = secretoCifrado();
  if (!secreto) return console.error('Webhooks: falta CIFRADO_SECRETO o BETTER_AUTH_SECRET, la entrega de webhooks queda desactivada');
  void (async () => {
    for (;;) {
      try { await procesarEntregas(prisma, { secreto }); } catch (e) { console.error('Webhooks', e); }
      await new Promise((r) => setTimeout(r, 5000));
    }
  })();
}
