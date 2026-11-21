// Lógica del agente sin efectos de red (detección de tipo, estabilidad, estado, reintentos). Solo usa la biblioteca de Node.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

export type Tipo = 'dicom' | 'zip';
export const CONTENT_TYPE: Record<Tipo, string> = { dicom: 'application/dicom', zip: 'application/zip' };

/** DICOM Part 10: "DICM" en el byte 128 (con o sin extensión .dcm); ZIP: "PK\x03\x04". */
export function detectarTipo(cabeza: Uint8Array): Tipo | null {
  if (cabeza.length >= 132 && Buffer.from(cabeza.subarray(128, 132)).toString('latin1') === 'DICM') return 'dicom';
  if (cabeza.length >= 4 && cabeza[0] === 0x50 && cabeza[1] === 0x4b && cabeza[2] === 0x03 && cabeza[3] === 0x04) return 'zip';
  return null;
}

// CDs "con visor": se ignoran el índice DICOMDIR (también empieza con DICM) y los programas; los DICOM que referencia
// están en la misma carpeta y se suben uno por uno.
const EXT_IGNORADAS = new Set(['.exe', '.dll', '.msi', '.bat', '.cmd', '.com', '.scr', '.sys', '.ini', '.inf', '.lnk']);
export function esIgnorado(ruta: string): boolean {
  const n = basename(ruta);
  return n.toUpperCase() === 'DICOMDIR' || n.startsWith('.') || n.startsWith('~') || EXT_IGNORADAS.has(extname(n).toLowerCase());
}

export type Visto = { tam: number; mtime: number; desde: number };
/**
 * El software del equipo escribe por partes: un archivo está listo cuando tamaño y fecha no cambian durante `ms`.
 * Actualiza `vistos` y devuelve si ya está estable.
 */
export function revisarEstabilidad(vistos: Map<string, Visto>, ruta: string, st: { size: number; mtimeMs: number }, ahora: number, ms: number) {
  const prev = vistos.get(ruta);
  if (!prev || prev.tam !== st.size || prev.mtime !== st.mtimeMs) {
    vistos.set(ruta, { tam: st.size, mtime: st.mtimeMs, desde: ahora });
    return false;
  }
  return st.size > 0 && ahora - prev.desde >= ms;
}

/** Espera exponencial entre reintentos: 2 s, 4 s, 8 s… hasta 5 min. */
export const espera = (intento: number, base = 2000, max = 300_000) => Math.min(max, base * 2 ** intento);

/** Qué hacer según la respuesta del servidor. */
export function clasificar(status: number): 'ok' | 'token' | 'reintentar' | 'rechazado' {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401 || status === 403) return 'token';
  if (status === 408 || status === 429 || status >= 500) return 'reintentar';
  return 'rechazado';
}

/** Estado persistido: SHA-256 del archivo → fecha de envío. Permite reanudar tras una caída sin repetir subidas. */
export type Estado = Record<string, string>;
export function cargarEstado(ruta: string): Estado {
  return existsSync(ruta) ? (JSON.parse(readFileSync(ruta, 'utf8')) as Estado) : {};
}
/** Escritura atómica (temporal + rename) para no dejar el JSON a medias si se corta la luz. */
export function guardarEstado(ruta: string, estado: Estado) {
  writeFileSync(`${ruta}.tmp`, JSON.stringify(estado));
  renameSync(`${ruta}.tmp`, ruta);
}

export function sha256(ruta: string): Promise<string> {
  return new Promise((ok, falla) => {
    const h = createHash('sha256');
    createReadStream(ruta).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', falla);
  });
}

export type Config = {
  servidor: string;
  token: string;
  carpetas: string[];
  enviados: string;
  errores: string;
  estado?: string;
  log?: string;
  estableSegundos?: number;
  barridoSegundos?: number;
};
export function validarConfig(c: Partial<Config>): Config {
  const faltan = (['servidor', 'token', 'enviados', 'errores'] as const).filter((k) => typeof c[k] !== 'string' || !c[k]);
  if (faltan.length) throw new Error(`Falta en la configuración: ${faltan.join(', ')}`);
  if (!Array.isArray(c.carpetas) || !c.carpetas.length) throw new Error('Falta en la configuración: carpetas (lista)');
  // El token viaja en cada petición: solo HTTPS, salvo pruebas en el mismo equipo.
  if (!/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$))/.test(c.servidor!)) throw new Error('servidor debe empezar por https://');
  return c as Config;
}
