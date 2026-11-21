// Implementación independiente (sala limpia) a partir de docs/sala-limpia/05-historia-clinica.md
// Lógica pura de historia clínica: vocabularios, validación y alertas calculadas (no se guardan).
import { z } from "zod";

export const GRAVEDADES = ["BAJA", "MEDIA", "ALTA", "CRITICA"] as const;
export type Gravedad = (typeof GRAVEDADES)[number];
export const ETIQUETA_GRAVEDAD: Record<Gravedad, string> = { BAJA: "Baja", MEDIA: "Media", ALTA: "Alta", CRITICA: "Crítica" };

export type Alerta = { gravedad: Gravedad; texto: string };

export type ContextoAlertas = {
  embarazo: boolean; semanasEmbarazo: number | null; lactancia: boolean;
  anticoagulantes: boolean; anticoagulanteNombre: string | null; inr: number | null;
  reaccionAnestesia: boolean; detalleAnestesia: string | null;
  implantesMetalicos: boolean; marcapasos: boolean;
};

const PESO: Record<Gravedad, number> = { CRITICA: 3, ALTA: 2, MEDIA: 1, BAJA: 0 };

/** Alertas por gravedad (críticas primero). Alergias baja/media no alertan; sin contexto solo se evalúan alergias. */
export function calcularAlertas(
  contexto: ContextoAlertas | null,
  alergias: { nombre: string; gravedad: string; reaccion?: string | null }[],
  enfermedades: { nombre: string; critica: boolean; notas?: string | null }[] = [],
): Alerta[] {
  const r: Alerta[] = [];
  for (const a of alergias) {
    if (a.gravedad === "ALTA" || a.gravedad === "CRITICA") {
      r.push({ gravedad: a.gravedad, texto: `Alergia a ${a.nombre}${a.reaccion ? ` (${a.reaccion})` : ""}` });
    }
  }
  if (contexto) {
    if (contexto.embarazo) r.push({ gravedad: "ALTA", texto: `Embarazo${contexto.semanasEmbarazo ? ` de ${contexto.semanasEmbarazo} semanas` : ""}` });
    if (contexto.lactancia) r.push({ gravedad: "MEDIA", texto: "Lactancia" });
    if (contexto.anticoagulantes) {
      const det = [contexto.anticoagulanteNombre, contexto.inr != null ? `INR ${contexto.inr}` : null].filter(Boolean).join(", ");
      r.push({ gravedad: "CRITICA", texto: `Anticoagulantes${det ? `: ${det}` : ""}` });
    }
    if (contexto.reaccionAnestesia) r.push({ gravedad: "CRITICA", texto: `Reacción adversa previa a anestesia${contexto.detalleAnestesia ? `: ${contexto.detalleAnestesia}` : ""}` });
    if (contexto.implantesMetalicos) r.push({ gravedad: "MEDIA", texto: "Implantes o dispositivos metálicos" });
    if (contexto.marcapasos) r.push({ gravedad: "ALTA", texto: "Marcapasos" });
  }
  for (const e of enfermedades) if (e.critica) r.push({ gravedad: "ALTA", texto: `${e.nombre}${e.notas ? ` — ${e.notas}` : ""}` });
  return r.sort((a, b) => PESO[b.gravedad] - PESO[a.gravedad]);
}

/** Menor de edad si no cumple 18 años (fecha de nacimiento guardada a medianoche UTC). */
export function esMenor(nacimiento: Date | null, hoy = new Date()) {
  if (!nacimiento) return false;
  const cumple18 = Date.UTC(nacimiento.getUTCFullYear() + 18, nacimiento.getUTCMonth(), nacimiento.getUTCDate());
  return hoy.getTime() < cumple18;
}

// Un campo opcional vaciado llega como "" y significa "sin valor".
const vacio = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === "" || v == null ? undefined : v), t.optional());
const texto = (max: number) => vacio(z.string().trim().max(max));

export const esquemaContexto = z.object({
  embarazo: z.boolean(),
  semanasEmbarazo: vacio(z.coerce.number().int().min(1, "Semanas entre 1 y 42").max(42, "Semanas entre 1 y 42")),
  lactancia: z.boolean(),
  anticoagulantes: z.boolean(),
  anticoagulanteNombre: texto(100),
  inr: vacio(z.coerce.number().min(0, "INR entre 0 y 20").max(20, "INR entre 0 y 20")),
  inrFecha: vacio(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")),
  reaccionAnestesia: z.boolean(),
  detalleAnestesia: texto(500),
  implantesMetalicos: z.boolean(),
  marcapasos: z.boolean(),
  claustrofobia: z.boolean(),
  estudiosRecientes: texto(500),
});

export const esquemaAntecedentes = z.object({
  contexto: esquemaContexto,
  alergias: z.array(z.object({
    nombre: z.string().trim().min(1, "Falta el nombre de la alergia").max(100),
    gravedad: z.enum(GRAVEDADES, "Gravedad inválida (baja, media, alta o crítica)"),
    reaccion: texto(200), notas: texto(500),
  })).max(50),
  medicaciones: z.array(z.object({ nombre: z.string().trim().min(1, "Falta el nombre del medicamento").max(100), notas: texto(500) })).max(50),
  enfermedades: z.array(z.object({ nombre: z.string().trim().min(1, "Falta el nombre de la enfermedad").max(100), critica: z.boolean(), notas: texto(500) })).max(50),
});
export type Antecedentes = z.input<typeof esquemaAntecedentes>;

export const esquemaContacto = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(100),
  parentesco: texto(50),
  telefono: z.string().trim().min(1, "Falta el teléfono").max(20),
  correo: vacio(z.string().trim().email("Correo inválido")),
});
export const esquemaRepresentante = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(100),
  parentesco: z.string().trim().min(1, "Falta el parentesco").max(50),
  tipoDocumento: z.string().trim().min(1).max(5).default("CC"),
  numeroDocumento: texto(30),
  telefono: z.string().trim().min(1, "Falta el teléfono").max(20),
  correo: vacio(z.string().trim().email("Correo inválido")),
  direccion: texto(200), notas: texto(500),
});
