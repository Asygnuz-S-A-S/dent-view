import { prisma } from '@dent-view/db';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { cifrar } from '../../web/src/lib/cifrado.ts';
import { procesarEntregas } from './webhooks.ts';

// Requiere la BD de desarrollo: se omite sin DATABASE_URL.
describe('entrega de webhooks', { skip: !process.env.DATABASE_URL }, () => {
  const s = `${Date.now()}`;
  const org = `whw-${s}`;
  const secreto = 'secreto-de-prueba';
  let activo = '', inactivo = '';
  const nueva = (webhookId: string) => prisma.webhookEntrega.create({ data: { webhookId, organizationId: org, evento: 'webhook.prueba', payload: { id: 'x' } } });

  before(async () => {
    await prisma.organization.create({ data: { id: org, name: org, slug: org } });
    const mk = (activo: boolean) => prisma.webhook.create({ data: { organizationId: org, nombre: 't', url: 'https://x.example.com/h', secretoCifrado: cifrar('whsec_t', secreto), eventos: ['*'], activo } });
    activo = (await mk(true)).id;
    inactivo = (await mk(false)).id;
  });
  after(async () => { await prisma.organization.deleteMany({ where: { id: org } }); await prisma.$disconnect(); });

  it('dos procesos simultáneos no envían la misma entrega y 2xx la marca ENTREGADO firmada', async () => {
    const e = await nueva(activo);
    let envios = 0;
    let cabeceras: Record<string, string> = {};
    const enviar = async (p: { cabeceras: Record<string, string> }) => { envios++; cabeceras = p.cabeceras; await new Promise((r) => setTimeout(r, 50)); return { codigo: 200, respuesta: '' }; };
    await Promise.all([procesarEntregas(prisma, { secreto, enviar: enviar as never }), procesarEntregas(prisma, { secreto, enviar: enviar as never })]);
    assert.equal(envios, 1);
    const r = await prisma.webhookEntrega.findUniqueOrThrow({ where: { id: e.id } });
    assert.equal(r.estado, 'ENTREGADO'); assert.equal(r.intentos, 1); assert.ok(r.entregadoEn);
    assert.equal(cabeceras['X-DentView-Delivery'], e.id);
    assert.match(cabeceras['X-DentView-Signature']!, /^t=\d+,v1=[0-9a-f]{64}$/);
  });

  it('un 500 reprograma con espera exponencial y al octavo intento queda FALLIDO', async () => {
    const e = await nueva(activo);
    let t = new Date();
    const enviar = async () => ({ codigo: 500, respuesta: '' });
    const esperas: number[] = [];
    for (let i = 1; i <= 8; i++) {
      await procesarEntregas(prisma, { secreto, enviar: enviar as never, ahora: () => t });
      const r = await prisma.webhookEntrega.findUniqueOrThrow({ where: { id: e.id } });
      assert.equal(r.intentos, i); assert.equal(r.codigoRespuesta, 500);
      if (i < 8) { esperas.push((r.proximoIntento.getTime() - t.getTime()) / 60_000); t = r.proximoIntento; } else assert.equal(r.estado, 'FALLIDO');
    }
    assert.deepEqual(esperas, [1, 2, 4, 8, 16, 32, 60]);
  });

  it('no envía si el webhook está desactivado', async () => {
    const e = await nueva(inactivo);
    let envios = 0;
    await procesarEntregas(prisma, { secreto, enviar: (async () => { envios++; return { codigo: 200, respuesta: '' }; }) as never });
    assert.equal(envios, 0);
    assert.equal((await prisma.webhookEntrega.findUniqueOrThrow({ where: { id: e.id } })).estado, 'FALLIDO');
  });

  it('un webhook reactivado no se desactiva por los fallos anteriores a la reactivación', async () => {
    const w = await prisma.webhook.create({ data: { organizationId: org, nombre: 'r', url: 'https://x.example.com/h', secretoCifrado: cifrar('whsec_t', secreto), eventos: ['*'], activo: true } });
    const antes = new Date(Date.now() - 3600_000);
    await prisma.webhookEntrega.createMany({ data: Array.from({ length: 20 }, () => ({ webhookId: w.id, organizationId: org, evento: 'webhook.prueba', payload: { id: 'x' }, estado: 'FALLIDO' as const, creadoEn: antes })) });
    await prisma.evento.create({ data: { organizationId: org, tipo: 'integracion.webhook_activado', detalle: { webhookId: w.id } } });
    const e = await prisma.webhookEntrega.create({ data: { webhookId: w.id, organizationId: org, evento: 'webhook.prueba', payload: { id: 'x' }, intentos: 7 } });
    await procesarEntregas(prisma, { secreto, enviar: (async () => ({ codigo: 500, respuesta: '' })) as never });
    assert.equal((await prisma.webhookEntrega.findUniqueOrThrow({ where: { id: e.id } })).estado, 'FALLIDO');
    assert.equal((await prisma.webhook.findUniqueOrThrow({ where: { id: w.id } })).activo, true);
  });
});
