// Implementación independiente (sala limpia) a partir de docs/sala-limpia/02-consentimientos-y-proteccion-de-datos.md
// Bitácora de accesos: las lecturas de ficha, estudios e informes se guardan como Evento "acceso.*" (solo inserción).
import { registrarEvento } from "./eventos";

export const PREFIJO_ACCESO = "acceso.";

export function registrarAcceso(ctx: { organizationId: string; usuario: { id: string } }, pacienteId: string | null, recurso: "ficha" | "estudio" | "informe", detalle?: object) {
  return registrarEvento({ organizationId: ctx.organizationId, pacienteId, actorId: ctx.usuario.id, tipo: `${PREFIJO_ACCESO}${recurso}`, detalle });
}
