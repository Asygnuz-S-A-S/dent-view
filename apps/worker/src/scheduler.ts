// Planificador: llama por HTTP interno a las rutas /api/cron/* de la app, que nadie más dispara en producción.
// - notificaciones, crm y fe (reintentos de facturación electrónica): cada 5 minutos; seguimiento-doctores: lunes 7:00 (America/Bogota).
// Sin CRON_SECRET no corre. Cada tarea espera a que termine la anterior (sin solaparse) y reintenta con espera creciente.
const TIMEOUT_MS = 60_000;
const REINTENTOS = 3;
const CADA_5_MIN = 5 * 60_000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bogotá es UTC−5 fijo: lunes 7:00 locales = lunes 12:00Z. */
export const esLunes7Bogota = (d: Date) => { const l = new Date(d.getTime() - 5 * 3600_000); return l.getUTCDay() === 1 && l.getUTCHours() === 7; };

export async function llamar(base: string, ruta: string, secreto: string, fetcher: typeof fetch = fetch, esperaBaseMs = 2_000): Promise<boolean> {
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try {
      const r = await fetcher(`${base}${ruta}`, { method: 'POST', headers: { authorization: `Bearer ${secreto}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (r.ok) return true;
      console.error(`[scheduler] ${ruta} respondió ${r.status} (intento ${intento}/${REINTENTOS})`);
      if (r.status === 401) return false; // secreto distinto al de la app: reintentar no sirve
    } catch (e) {
      console.error(`[scheduler] ${ruta} falló (intento ${intento}/${REINTENTOS}): ${e instanceof Error ? e.message : e}`);
    }
    if (intento < REINTENTOS) await dormir(esperaBaseMs * 2 ** (intento - 1));
  }
  return false;
}

export function iniciarPlanificador(env: Record<string, string | undefined> = process.env) {
  const secreto = env.CRON_SECRET;
  if (!secreto) return console.warn('[scheduler] CRON_SECRET vacío: el planificador NO corre (las colas de correo, el CRM y el seguimiento de doctores no se dispararán solos)');
  const base = (env.WEB_INTERNAL_URL || 'http://web:3000').replace(/\/+$/, '');
  console.log(`[scheduler] activo: notificaciones, crm y fe cada 5 min, seguimiento-doctores los lunes 7:00 (Bogotá) -> ${base}`);

  const enCurso = new Set<string>();
  const correr = async (ruta: string) => {
    if (enCurso.has(ruta)) return; // la ejecución anterior sigue en marcha
    enCurso.add(ruta);
    try { await llamar(base, ruta, secreto); } finally { enCurso.delete(ruta); }
  };
  const cada5 = () => { void correr('/api/cron/notificaciones'); void correr('/api/cron/crm'); void correr('/api/cron/fe'); };
  setTimeout(cada5, 30_000); // deja que la app termine de arrancar
  setInterval(cada5, CADA_5_MIN);

  // Semanal: se revisa cada minuto y se dispara una sola vez en la hora del lunes (clave = fecha de Bogotá).
  let ultimaSemana = '';
  setInterval(() => {
    const ahora = new Date();
    if (!esLunes7Bogota(ahora)) return;
    const clave = new Date(ahora.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
    if (clave === ultimaSemana) return;
    ultimaSemana = clave;
    void correr('/api/cron/seguimiento-doctores');
  }, 60_000);
}
