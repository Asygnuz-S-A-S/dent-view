// Lógica pura de autorización multitenant (sin I/O) para poder probarla.

export const ROLES_TENANT_COMPLETO = ["admin_tenant", "recepcion", "especialista"] as const;

export type EstudioAcceso = { organizationId: string; doctorRemitenteId: string | null };

const UID = /^[0-9]+(\.[0-9]+)*$/;
const RUTA_ESTUDIO = /^\/dicom-web\/studies\/([^/]+)(?:\/|$)/;
// Lista blanca de parámetros QIDO: cualquier otro filtro (p. ej. el alias 0020000D) podría ampliar la búsqueda a otros estudios.
const PARAMETROS_PERMITIDOS = new Set(["StudyInstanceUID", "SeriesInstanceUID", "includefield", "limit", "offset", "fuzzymatching"]);

/** UID del estudio desde el path `/dicom-web/studies/{uid}/…` o la query `StudyInstanceUID=`. */
export function extraerEstudioUid(uri: string | null | undefined): string | null {
  // Rechaza separadores codificados y segmentos . / .. para que nadie autorice un UID y lea otro.
  if (!uri || /%(2f|5c|2e)/i.test(uri) || /\/\.{1,2}(\/|\?|$)/.test(uri)) return null;
  let url: URL;
  try {
    url = new URL(uri, "http://x");
  } catch {
    return null;
  }
  for (const clave of url.searchParams.keys()) if (!PARAMETROS_PERMITIDOS.has(clave)) return null;
  const delPath = RUTA_ESTUDIO.exec(url.pathname)?.[1] ?? null;
  const delQuery = url.searchParams.getAll("StudyInstanceUID");
  if (delQuery.length > 1) return null;
  if (delPath && delQuery.length === 1 && delQuery[0] !== delPath) return null;
  const uid = delPath ?? delQuery[0] ?? null;
  return uid && uid.length <= 64 && UID.test(uid) ? uid : null;
}

/** `rol` es el rol del usuario en la organización dueña del estudio (null si no es miembro). */
export function puedeVerEstudio(
  usuarioId: string,
  rol: string | null,
  estudio: EstudioAcceso | null,
): boolean {
  if (!estudio || !rol) return false;
  if ((ROLES_TENANT_COMPLETO as readonly string[]).includes(rol)) return true;
  return rol === "doctor_remitente" && estudio.doctorRemitenteId === usuarioId;
}

/** Filtro Prisma de estudios visibles para un rol dentro de la organización activa. */
export function filtroEstudios(organizationId: string, usuarioId: string, rol: string) {
  return rol === "doctor_remitente"
    ? { organizationId, doctorRemitenteId: usuarioId }
    : { organizationId };
}

export type EntradaVisor = {
  usuarioId: string | null;
  metodo: string | null;
  uid: string | null;
  estudio: EstudioAcceso | null;
  rol: string | null;
  /** Enlace de resultados de la cookie (solo cuenta sin sesión): UIDs que incluye y si sigue activo (no vencido ni revocado). */
  enlace?: { estudioUids: string[]; activo: boolean } | null;
};

export function decidirAccesoVisor(e: EntradaVisor): 200 | 401 | 403 {
  if (!e.usuarioId) {
    if (!e.enlace?.activo) return 401;
    if (e.metodo !== "GET" && e.metodo !== "HEAD") return 403;
    return e.uid && e.enlace.estudioUids.includes(e.uid) ? 200 : 403;
  }
  if (e.metodo !== "GET" && e.metodo !== "HEAD") return 403;
  if (!e.uid) return 403;
  return puedeVerEstudio(e.usuarioId, e.rol, e.estudio) ? 200 : 403;
}
