// Sincronización periódica de las integraciones con sistemas de gestión de pacientes (ver apps/web/src/lib/integraciones).
// Comparte código con la app: el Dockerfile del worker debe copiar apps/web/src/lib/integraciones, cifrado.ts y pacientes-centro.ts.
import { sincronizarActivas } from '../../web/src/lib/integraciones/sincronizar.ts';

const INTERVALO_MS = Number(process.env.SYNC_INTEGRACIONES_MS ?? 15 * 60_000);

/** Arranca el ciclo (una corrida a la vez). Lo conecta el orquestador desde index.ts. */
export function iniciarSyncIntegraciones(intervaloMs = INTERVALO_MS) {
  let corriendo = false;
  const ciclo = async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      await sincronizarActivas();
    } catch (e) {
      console.error('[sync-integraciones]', e instanceof Error ? e.message : 'error');
    } finally {
      corriendo = false;
    }
  };
  void ciclo();
  return setInterval(ciclo, intervaloMs);
}
