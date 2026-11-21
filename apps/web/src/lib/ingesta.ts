// Lógica pura de la ingesta desde las estaciones (agente del PC del centro). Sin I/O para poder probarla.

export const PREFIJO_ETIQUETA = "tenant-";
/** Orthanc solo acepta etiquetas con letras, dígitos, "_" y "-". */
const ETIQUETA_VALIDA = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_BYTES_DEFECTO = 2 * 1024 ** 3;
export const MINUTOS_EN_LINEA = 15;

export type TipoArchivo = "dicom" | "zip";
export const CONTENT_TYPE: Record<TipoArchivo, string> = { dicom: "application/dicom", zip: "application/zip" };

/** DICOM Part 10: "DICM" en el byte 128; ZIP: firma de cabecera local "PK\x03\x04". */
export function detectarTipo(cabeza: Uint8Array): TipoArchivo | null {
  const ascii = (desde: number, n: number) => String.fromCharCode(...cabeza.subarray(desde, desde + n));
  if (cabeza.length >= 132 && ascii(128, 4) === "DICM") return "dicom";
  if (cabeza.length >= 4 && cabeza[0] === 0x50 && cabeza[1] === 0x4b && cabeza[2] === 0x03 && cabeza[3] === 0x04) return "zip";
  return null;
}

/** Tipo declarado por el cliente (ignora parámetros como "; charset"). */
export function tipoDeclarado(contentType: string | null): TipoArchivo | null {
  const base = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  return base === "application/dicom" ? "dicom" : base === "application/zip" ? "zip" : null;
}

/** Token de "Authorization: Bearer <token>" (formato de generarToken: base64url de 43 caracteres). */
export function tokenDeCabecera(authorization: string | null): string | null {
  return /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? "")?.[1] ?? null;
}

export function etiquetaCentro(organizationId: string): string {
  const e = PREFIJO_ETIQUETA + organizationId;
  if (!ETIQUETA_VALIDA.test(e)) throw new Error(`Etiqueta de Orthanc inválida: ${e}`);
  return e;
}

/** Centro dueño según las etiquetas del estudio en Orthanc; "varios" si hay más de uno (no se debe asignar). */
export function centroDeEtiquetas(etiquetas: string[] | undefined): string | null | "varios" {
  const centros = [...new Set((etiquetas ?? []).filter((e) => e.startsWith(PREFIJO_ETIQUETA)).map((e) => e.slice(PREFIJO_ETIQUETA.length)))];
  return centros.length > 1 ? "varios" : (centros[0] ?? null);
}

/**
 * Qué hacer con un estudio que recibió instancias de una estación: si ya pertenece a otro centro (por etiqueta o
 * porque ya está registrado en la BD) es un choque de StudyInstanceUID y no se etiqueta.
 */
export function decidirEstudio(p: { etiquetas: string[] | undefined; organizationIdBd: string | null; organizationId: string }) {
  const porEtiqueta = centroDeEtiquetas(p.etiquetas);
  const dueno = porEtiqueta ?? p.organizationIdBd;
  return dueno && dueno !== p.organizationId ? "conflicto" : "etiquetar";
}

export function estadoEstacion(e: { activa: boolean; ultimoContacto: Date | null }, ahora = new Date()) {
  if (!e.activa) return "INACTIVA" as const;
  if (e.ultimoContacto && ahora.getTime() - e.ultimoContacto.getTime() < MINUTOS_EN_LINEA * 60_000) return "EN_LINEA" as const;
  return "SIN_CONTACTO" as const;
}

export class CuerpoDemasiadoGrande extends Error {}

/**
 * Lee del flujo solo lo necesario para reconocer el tipo y devuelve un flujo equivalente (cabeza + resto) que falla con
 * CuerpoDemasiadoGrande al pasar de `max` bytes. Así el archivo se reenvía sin cargarlo entero en memoria.
 */
export async function inspeccionarCuerpo(cuerpo: ReadableStream<Uint8Array>, max: number) {
  const lector = cuerpo.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (total < 132) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(value);
    total += value.length;
  }
  const cabeza = new Uint8Array(total);
  partes.reduce((o, p) => (cabeza.set(p, o), o + p.length), 0);
  const flujo = new ReadableStream<Uint8Array>({
    start(c) {
      if (total > max) c.error(new CuerpoDemasiadoGrande());
      else if (cabeza.length) c.enqueue(cabeza);
    },
    async pull(c) {
      const { done, value } = await lector.read();
      if (done) return c.close();
      total += value.length;
      if (total > max) {
        c.error(new CuerpoDemasiadoGrande());
        await lector.cancel();
        return;
      }
      c.enqueue(value);
    },
    cancel: (r) => lector.cancel(r),
  });
  return { tipo: detectarTipo(cabeza), flujo };
}
