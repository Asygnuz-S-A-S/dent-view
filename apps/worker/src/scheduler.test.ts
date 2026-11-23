import assert from 'node:assert/strict';
import { test } from 'node:test';
import { esLunes7Bogota, iniciarPlanificador, llamar } from './scheduler.ts';

test('lunes 7:00 de Bogotá es lunes 12:00Z', () => {
  assert.equal(esLunes7Bogota(new Date('2026-11-23T12:00:00Z')), true);
  assert.equal(esLunes7Bogota(new Date('2026-11-23T11:59:00Z')), false);
  assert.equal(esLunes7Bogota(new Date('2026-11-24T12:00:00Z')), false);
});

test('llama con el secreto y reintenta ante errores del servidor', async () => {
  const vistas: { url: string; auth: string | null }[] = [];
  let n = 0;
  const f = (async (url: string, init: RequestInit) => {
    vistas.push({ url, auth: new Headers(init.headers).get('authorization') });
    return new Response(null, { status: ++n < 3 ? 500 : 200 });
  }) as unknown as typeof fetch;
  assert.equal(await llamar('http://web:3000', '/api/cron/crm', 's3', f, 1), true);
  assert.equal(vistas.length, 3);
  assert.deepEqual(vistas[0], { url: 'http://web:3000/api/cron/crm', auth: 'Bearer s3' });
});

test('un 401 no se reintenta', async () => {
  let n = 0;
  const f = (async () => { n++; return new Response(null, { status: 401 }); }) as unknown as typeof fetch;
  assert.equal(await llamar('http://x', '/r', 'mal', f, 1), false);
  assert.equal(n, 1);
});

test('sin CRON_SECRET no arranca nada', () => {
  const avisos: unknown[] = [];
  const w = console.warn; console.warn = (...a) => { avisos.push(a); };
  try { iniciarPlanificador({}); } finally { console.warn = w; }
  assert.equal(avisos.length, 1);
});
