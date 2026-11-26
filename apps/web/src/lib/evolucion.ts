// Evolución clínica: lógica pura (JSON canónico, hash, plantillas, validación y permisos). Sin base de datos.
// Marco: Res. 1995/1999 (inmodificabilidad, folios, fecha/hora/nombre/firma), Res. 839/2017 (conservación 15 años).
// TODO legal (abogado): valor probatorio de la firma electrónica por reautenticación (Ley 527/1999, Decreto 2364/2012): no verificado.
import { z } from "zod";
import { MEDICOS } from "./roles";

// ---------- Permisos ----------

/** Leer evoluciones: roles MEDICOS (admin y especialista). Recepción y doctor remitente no tienen acceso. */
export const puedeLeerEvolucion = (rol: string) => (MEDICOS as readonly string[]).includes(rol);

/** Firmar: especialista, o admin_tenant que atiende como odontólogo (Member.esOdontologo). */
export const puedeFirmar = (rol: string, esOdontologo: boolean) => rol === "especialista" || (rol === "admin_tenant" && esOdontologo);

// ---------- Plantillas ----------

export const DESTINOS = ["motivoConsulta", "hallazgos", "procedimiento", "plan", "indicaciones"] as const;
export type Destino = (typeof DESTINOS)[number];
export const ETIQUETA_DESTINO: Record<Destino, string> = {
  motivoConsulta: "Motivo de consulta", hallazgos: "Hallazgos", procedimiento: "Procedimiento", plan: "Plan", indicaciones: "Indicaciones",
};

export const esquemaCamposPlantilla = z.object({
  campos: z.array(z.object({
    clave: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/, "Clave inválida"),
    etiqueta: z.string().trim().min(1, "Falta la etiqueta").max(80),
    destino: z.enum(DESTINOS),
    ayuda: z.string().trim().max(200).optional(),
  })).min(1, "La plantilla necesita al menos un campo").max(20),
});
export type CamposPlantilla = z.infer<typeof esquemaCamposPlantilla>;
export type CampoPlantilla = CamposPlantilla["campos"][number];

/** Sin plantilla: los cinco campos estándar. */
export const CAMPOS_ESTANDAR: CampoPlantilla[] = DESTINOS.map((d) => ({ clave: d, etiqueta: ETIQUETA_DESTINO[d], destino: d }));

const c = (clave: string, etiqueta: string, destino: Destino, ayuda?: string): CampoPlantilla => ({ clave, etiqueta, destino, ...(ayuda ? { ayuda } : {}) });

export const PLANTILLAS_BASE: { nombre: string; campos: CampoPlantilla[] }[] = [
  { nombre: "Odontología general", campos: [
    c("motivo", "Motivo de consulta", "motivoConsulta"), c("examen", "Examen clínico", "hallazgos", "Tejidos blandos, duros, oclusión"),
    c("diagnostico_clinico", "Impresión clínica", "hallazgos"), c("procedimiento", "Procedimiento realizado", "procedimiento"),
    c("plan", "Plan de tratamiento", "plan"), c("indicaciones", "Indicaciones al paciente", "indicaciones"),
  ] },
  { nombre: "Ortodoncia", campos: [
    c("motivo", "Motivo de consulta", "motivoConsulta"), c("analisis", "Análisis facial y oclusal", "hallazgos", "Clase molar y canina, overjet, overbite, líneas medias"),
    c("aparatologia", "Aparatología y arcos", "procedimiento"), c("activacion", "Activación o ajuste de la sesión", "procedimiento"),
    c("plan", "Plan y objetivos del tratamiento", "plan"), c("indicaciones", "Indicaciones (higiene, elásticos)", "indicaciones"),
  ] },
  { nombre: "Endodoncia", campos: [
    c("motivo", "Motivo de consulta", "motivoConsulta"), c("pulpar", "Diagnóstico pulpar y periapical", "hallazgos"),
    c("pruebas", "Pruebas (frío, percusión, palpación)", "hallazgos"), c("conductometria", "Conductometría y técnica de instrumentación", "procedimiento"),
    c("obturacion", "Irrigación y obturación", "procedimiento"), c("plan", "Plan (restauración definitiva, control)", "plan"),
    c("indicaciones", "Indicaciones y medicación", "indicaciones"),
  ] },
  { nombre: "Periodoncia", campos: [
    c("motivo", "Motivo de consulta", "motivoConsulta"), c("sondaje", "Sondaje, sangrado y movilidad", "hallazgos"),
    c("diagnostico_periodontal", "Diagnóstico periodontal", "hallazgos"), c("procedimiento", "Procedimiento (profilaxis, raspado y alisado)", "procedimiento"),
    c("plan", "Plan y mantenimiento", "plan"), c("indicaciones", "Indicaciones de higiene", "indicaciones"),
  ] },
  { nombre: "Cirugía oral", campos: [
    c("motivo", "Motivo de consulta e indicación", "motivoConsulta"), c("preoperatorio", "Valoración preoperatoria", "hallazgos"),
    c("anestesia", "Anestesia y técnica", "procedimiento"), c("cirugia", "Descripción quirúrgica", "procedimiento"),
    c("complicaciones", "Complicaciones", "hallazgos"), c("plan", "Control y seguimiento", "plan"), c("indicaciones", "Indicaciones posoperatorias y medicación", "indicaciones"),
  ] },
  { nombre: "Implantología", campos: [
    c("motivo", "Motivo de consulta", "motivoConsulta"), c("evaluacion", "Evaluación del reborde y estudio imagenológico", "hallazgos"),
    c("fase", "Fase (colocación, segunda fase, rehabilitación)", "procedimiento"), c("implante", "Implante (sistema, diámetro, longitud, sitio, torque)", "procedimiento"),
    c("plan", "Plan y tiempos de cicatrización", "plan"), c("indicaciones", "Indicaciones y medicación", "indicaciones"),
  ] },
  { nombre: "Radiología e imágenes", campos: [
    c("motivo", "Indicación del estudio", "motivoConsulta"), c("estudio", "Estudio realizado (técnica, proyecciones)", "procedimiento"),
    c("hallazgos", "Hallazgos imagenológicos", "hallazgos"), c("plan", "Conducta sugerida", "plan"), c("indicaciones", "Indicaciones", "indicaciones"),
  ] },
];

export type Valores = Record<string, string>;
export type Compuesto = Record<Destino, string | null>;

/** Une los campos guiados en las cinco columnas de la evolución. Con un solo campo por destino va tal cual; con varios, "Etiqueta: valor". */
export function componerContenido(campos: CampoPlantilla[], valores: Valores): Compuesto {
  const salida = Object.fromEntries(DESTINOS.map((d) => [d, [] as string[]])) as Record<Destino, string[]>;
  for (const d of DESTINOS) {
    const delDestino = campos.filter((x) => x.destino === d);
    for (const campo of delDestino) {
      const v = (valores[campo.clave] ?? "").trim();
      if (v) salida[d].push(delDestino.length > 1 ? `${campo.etiqueta}: ${v}` : v);
    }
  }
  return Object.fromEntries(DESTINOS.map((d) => [d, salida[d].join("\n") || null])) as Compuesto;
}

// ---------- Diagnósticos CIE-10 ----------

// Código de 3 o 4 caracteres sin punto (como Orden.diagnosticoPrincipal): letra (sin U), dos dígitos y un carácter opcional.
export const CIE10 = /^[A-TV-Z]\d{2}[0-9A-Z]?$/;
export const normalizarCie10 = (s: string) => s.trim().toUpperCase().replace(".", "");

export const esquemaDiagnostico = z.object({
  codigo: z.string().transform(normalizarCie10).pipe(z.string().regex(CIE10, "Código CIE-10 inválido (ej. K02 o K021)")),
  descripcion: z.string().trim().max(200).default(""),
});
export type Diagnostico = z.infer<typeof esquemaDiagnostico>;

// ---------- Borrador y firma ----------

export const MAX_TEXTO = 5000;
const texto = z.string().max(MAX_TEXTO, `Máximo ${MAX_TEXTO} caracteres por campo`);

export const esquemaBorrador = z.object({
  valores: z.record(z.string().max(60), texto).refine((r) => Object.keys(r).length <= 30, "Demasiados campos"),
  diagnosticos: z.array(esquemaDiagnostico).max(10, "Máximo 10 diagnósticos"),
  proximaCita: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").or(z.literal("")),
  adjuntoIds: z.array(z.string().max(40)).max(20, "Máximo 20 adjuntos"),
});
export type ContenidoBorrador = z.infer<typeof esquemaBorrador>;
export const BORRADOR_VACIO: ContenidoBorrador = { valores: {}, diagnosticos: [], proximaCita: "", adjuntoIds: [] };

/** Una evolución sin nada clínico escrito no se firma. */
export const tieneContenido = (c: Compuesto, diagnosticos: unknown[]) => DESTINOS.some((d) => !!c[d]) || diagnosticos.length > 0;

export const MOTIVO_ADENDA_MIN = 5;
export const esquemaAdenda = z.object({
  motivo: z.string().trim().min(MOTIVO_ADENDA_MIN, `El motivo necesita al menos ${MOTIVO_ADENDA_MIN} caracteres`).max(300),
  texto: z.string().trim().min(1, "Escribe la aclaración o corrección").max(MAX_TEXTO),
});
/** Texto guardado de la adenda: el motivo va como primera línea. */
export const textoAdenda = (motivo: string, cuerpo: string) => `Motivo: ${motivo.trim()}\n${cuerpo.trim()}`;

export const esquemaToma = z.object({
  ordenId: z.string().min(1), salaId: z.string().max(40).optional().or(z.literal("")), equipo: z.string().trim().max(200).optional(),
  repeticiones: z.coerce.number().int().min(0, "Repeticiones entre 0 y 20").max(20, "Repeticiones entre 0 y 20"),
  motivoRepeticion: z.string().trim().max(300).optional(), incidencias: z.string().trim().max(1000).optional(),
}).refine((x) => x.repeticiones === 0 || !!x.motivoRepeticion?.trim(), { message: "Indica el motivo de la repetición", path: ["motivoRepeticion"] });

// ---------- Límite de intentos de firma ----------

export const MAX_FIRMAS_POR_MIN = 10;
