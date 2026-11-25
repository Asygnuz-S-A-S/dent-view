// Extracción en streaming de un ZIP de DICOM con topes anti zip-bomb (solo servidor; sin Orthanc: recibe un callback para subir).
import { Unzip, UnzipInflate } from "fflate";

export class ZipInvalido extends Error {}
export const LIMITES_ZIP = { entradas: 5000, entrada: 256 * 1024 ** 2, total: 3 * 1024 ** 3 };

const esDicom = (b: Uint8Array) => b.length >= 132 && String.fromCharCode(...b.subarray(128, 132)) === "DICM";

/**
 * Lee el ZIP por trozos y llama `subir` por cada .dcm. Rechaza (ZipInvalido) rutas absolutas o con "..", archivos que no son DICOM,
 * demasiadas entradas y exceso de bytes descomprimidos (se cuentan los bytes reales, no los declarados en la cabecera).
 * shortcut: cada entrada se acumula entera en memoria (tope `entrada`); una instancia mayor se rechaza. Subir ese tope si aparecen CBCT multiframe más grandes.
 */
export async function extraerDicomDeZip(flujo: ReadableStream<Uint8Array>, subir: (nombre: string, datos: Uint8Array) => Promise<void>, lim = LIMITES_ZIP): Promise<number> {
  const est = { error: null as Error | null, cola: Promise.resolve(), vistas: 0, dicom: 0, total: 0, subidas: 0 };
  const falla = (m: string) => { est.error ??= new ZipInvalido(m); };
  const un = new Unzip();
  un.register(UnzipInflate);
  un.onfile = (f) => {
    if (est.error) return;
    const nombre = f.name, seg = nombre.split("/");
    if (++est.vistas > lim.entradas * 2) return falla("El ZIP tiene demasiadas entradas");
    if (nombre.startsWith("/") || nombre.includes("\\") || /^[A-Za-z]:/.test(nombre) || seg.includes("..")) return falla("El ZIP contiene rutas no permitidas");
    const base = seg[seg.length - 1];
    if (nombre.endsWith("/") || seg[0] === "__MACOSX" || base === "DICOMDIR" || base === ".DS_Store") return;
    if (++est.dicom > lim.entradas) return falla(`El ZIP tiene más de ${lim.entradas} archivos`);
    const partes: Uint8Array[] = [];
    let n = 0;
    f.ondata = (err, chunk, final) => {
      if (est.error) return;
      if (err) return falla("El ZIP está dañado");
      n += chunk.length;
      est.total += chunk.length;
      if (n > lim.entrada) { f.terminate(); return falla("Un archivo del ZIP es demasiado grande"); }
      if (est.total > lim.total) { f.terminate(); return falla("El contenido descomprimido del ZIP es demasiado grande"); }
      partes.push(chunk);
      if (!final) return;
      const datos = new Uint8Array(n);
      partes.reduce((o, p) => (datos.set(p, o), o + p.length), 0);
      if (!esDicom(datos)) return falla("El ZIP contiene archivos que no son DICOM");
      est.cola = est.cola.then(() => (est.error ? undefined : subir(nombre, datos))).then(() => void est.subidas++, (e) => void (est.error ??= e));
    };
    f.start();
  };
  const lector = flujo.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    try { un.push(value ?? new Uint8Array(0), done); } catch { falla("El ZIP está dañado"); }
    await est.cola;
    if (est.error) { await lector.cancel().catch(() => {}); throw est.error; }
    if (done) break;
  }
  if (est.subidas === 0) throw new ZipInvalido("El ZIP no contiene archivos DICOM");
  return est.subidas;
}
