// Búsqueda de pacientes por nombre sin importar tildes ni mayúsculas ("gomez" encuentra "Gómez", "nino" a "Niño").
// Postgres de este stack no tiene la extensión unaccent: se traduce en SQL con translate(), sin tocar el esquema.
import { prisma } from "@dent-view/db";

const CON_TILDE = "áéíóúüñÁÉÍÓÚÜÑ";
const SIN_TILDE = "aeiouunAEIOUUN";

/** Patrón LIKE contenedor: sin tildes y con %, _ y \ escapados (el usuario escribe texto, no comodines). */
export function patronNombre(texto: string): string {
  const base = [...texto.trim()].map((c) => { const i = CON_TILDE.indexOf(c); return i < 0 ? c : SIN_TILDE[i]!; }).join("");
  return `%${base.replace(/[\\%_]/g, "\\$&")}%`;
}

/** Ids de pacientes del centro cuyo nombre contiene el texto (máx. 1000: es un prefiltro de listas, no un export). */
export async function idsPacientesPorNombre(organizationId: string, texto: string): Promise<string[]> {
  if (!texto.trim()) return [];
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "PacienteTenant"
    WHERE "organizationId" = ${organizationId}
      AND translate(nombre, ${CON_TILDE}, ${SIN_TILDE}) ILIKE ${patronNombre(texto)} ESCAPE '\\'
    LIMIT 1000`;
  return filas.map((f) => f.id);
}
