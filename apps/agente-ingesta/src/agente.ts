// Agente de ingesta del PC del centro: vigila carpetas y sube a Radia los DICOM y ZIP exportados por el equipo.
// Uso: node src/agente.ts <config.json>   (empaquetado: agente-ingesta.exe [config.json]; ver README.md)
import { createReadStream, existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, readdirSync, renameSync, statSync, watch, copyFileSync, unlinkSync, appendFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import {
  cargarEstado, clasificar, CONTENT_TYPE, detectarTipo, esIgnorado, espera, guardarEstado, revisarEstabilidad, sha256, validarConfig,
  type Tipo, type Visto,
} from './lib.ts';

const rutaConfig = resolve(process.argv[2] ?? join(dirname(process.execPath), 'agente-ingesta.json'));
const cfg = validarConfig(JSON.parse(readFileSync(rutaConfig, 'utf8')));
const base = dirname(rutaConfig);
const carpetas = cfg.carpetas.map((c) => resolve(base, c));
const enviados = resolve(base, cfg.enviados);
const errores = resolve(base, cfg.errores);
const rutaEstado = resolve(base, cfg.estado ?? 'agente-ingesta-estado.json');
const estableMs = (cfg.estableSegundos ?? 10) * 1000;
const barridoMs = (cfg.barridoSegundos ?? 60) * 1000;
const servidor = cfg.servidor.replace(/\/$/, '');
const MAX_INTENTOS = 6;

function log(nivel: 'INFO' | 'AVISO' | 'ERROR', msg: string) {
  const linea = `${new Date().toISOString()} ${nivel} ${msg}`;
  (nivel === 'INFO' ? console.log : console.error)(linea);
  if (cfg.log) try { appendFileSync(resolve(base, cfg.log), linea + '\n'); } catch { /* el log no debe tumbar el agente */ }
}

const dentro = (ruta: string, dir: string) => ruta === dir || ruta.startsWith(dir + sep);
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function leerCabeza(ruta: string) {
  const fd = openSync(ruta, 'r');
  try {
    const b = Buffer.alloc(132);
    return b.subarray(0, readSync(fd, b, 0, 132, 0));
  } finally {
    closeSync(fd);
  }
}

/** Mueve el archivo conservando la ruta relativa a la carpeta vigilada; no pisa archivos existentes. */
function mover(ruta: string, carpeta: string, destino: string) {
  let final = join(destino, relative(carpeta, ruta));
  if (existsSync(final)) final += `.${Date.now()}`;
  mkdirSync(dirname(final), { recursive: true });
  try {
    renameSync(ruta, final);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    copyFileSync(ruta, final);
    unlinkSync(ruta);
  }
}

class TokenInvalido extends Error {}

const auth = { Authorization: `Bearer ${cfg.token}` };

async function subir(ruta: string, tipo: Tipo): Promise<{ status: number; texto: string }> {
  const r = await fetch(`${servidor}/api/ingesta`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': CONTENT_TYPE[tipo] },
    body: Readable.toWeb(createReadStream(ruta)) as ReadableStream,
    duplex: 'half',
  } as RequestInit);
  return { status: r.status, texto: await r.text() };
}

const estado = cargarEstado(rutaEstado);

async function procesar(ruta: string, carpeta: string, tipo: Tipo) {
  const hash = await sha256(ruta);
  if (estado[hash]) {
    log('INFO', `${ruta}: ya enviado el ${estado[hash]}, se mueve a enviados`);
    return mover(ruta, carpeta, enviados);
  }
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    let r: { status: number; texto: string };
    try {
      r = await subir(ruta, tipo);
    } catch (e) {
      r = { status: 0, texto: (e as Error).message };
    }
    const accion = r.status === 0 ? 'reintentar' : clasificar(r.status);
    if (accion === 'ok') {
      estado[hash] = new Date().toISOString();
      guardarEstado(rutaEstado, estado);
      mover(ruta, carpeta, enviados);
      return log('INFO', `${ruta}: enviado (${r.texto})`);
    }
    if (accion === 'token') throw new TokenInvalido(`${r.status} ${r.texto}`);
    if (accion === 'rechazado') {
      mover(ruta, carpeta, errores);
      return log('ERROR', `${ruta}: rechazado por el servidor (${r.status} ${r.texto}); movido a errores`);
    }
    const ms = espera(intento);
    log('AVISO', `${ruta}: fallo temporal (${r.status || 'red'} ${r.texto.slice(0, 200)}); reintento en ${ms / 1000} s`);
    await dormir(ms);
  }
  log('ERROR', `${ruta}: sin éxito tras ${MAX_INTENTOS} intentos; se reintentará en el próximo barrido`);
}

const vistos = new Map<string, Visto>();

/** Recorre las carpetas y procesa lo que ya está estable. Devuelve cuántos archivos siguen cambiando. */
async function barrer() {
  let pendientes = 0;
  const presentes = new Set<string>();
  for (const carpeta of carpetas) {
    if (!existsSync(carpeta)) { log('AVISO', `No existe la carpeta vigilada ${carpeta}`); continue; }
    for (const d of readdirSync(carpeta, { recursive: true, withFileTypes: true })) {
      const ruta = join(d.parentPath, d.name);
      if (!d.isFile() || esIgnorado(ruta) || dentro(ruta, enviados) || dentro(ruta, errores)) continue;
      presentes.add(ruta);
      try {
        if (!revisarEstabilidad(vistos, ruta, statSync(ruta), Date.now(), estableMs)) { pendientes++; continue; }
        const tipo = detectarTipo(leerCabeza(ruta));
        if (!tipo) continue; // visor, PDF, imágenes sueltas: no se suben
        await procesar(ruta, carpeta, tipo);
        vistos.delete(ruta);
      } catch (e) {
        if (e instanceof TokenInvalido) throw e;
        log('ERROR', `${ruta}: ${(e as Error).message}`);
      }
    }
  }
  for (const r of vistos.keys()) if (!presentes.has(r)) vistos.delete(r);
  return pendientes;
}

let ultimoLatido = 0;
async function latido() {
  if (Date.now() - ultimoLatido < 5 * 60_000) return;
  ultimoLatido = Date.now();
  try {
    const r = await fetch(`${servidor}/api/ingesta/ping`, { headers: auth });
    if (r.ok) log('INFO', `Conectado a ${servidor} como ${(await r.json() as { estacion: string }).estacion}`);
    else log('ERROR', `El servidor rechazó el token (${r.status}). Revisa la estación en Radia.`);
  } catch (e) {
    log('AVISO', `Sin conexión con ${servidor}: ${(e as Error).message}`);
  }
}

let despertar = () => {};
for (const c of carpetas) {
  try {
    watch(c, { recursive: true }, () => despertar());
  } catch (e) {
    log('AVISO', `No se puede vigilar ${c} en vivo (${(e as Error).message}); solo barrido periódico`);
  }
}
log('INFO', `Agente iniciado. Carpetas: ${carpetas.join(', ')}. Estado: ${rutaEstado}`);

// Sin await de nivel superior: el bundle CommonJS del ejecutable (SEA) no lo admite.
async function principal() {
  for (;;) {
    await latido();
    let pendientes = 0;
    try {
      pendientes = await barrer();
    } catch (e) {
      log('ERROR', `Token inválido o estación desactivada (${(e as Error).message}). Se reintenta en el próximo barrido.`);
      ultimoLatido = 0;
    }
    await new Promise<void>((r) => { despertar = r; setTimeout(r, pendientes ? estableMs : barridoMs); });
    await dormir(1000); // agrupa las ráfagas de eventos de fs.watch
  }
}
void principal();
