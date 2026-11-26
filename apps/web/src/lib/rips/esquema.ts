// Datos RIPS editables en la orden y reparto de permisos: lo clínico (diagnóstico, finalidad) solo lo guardan los roles médicos.
import { z } from "zod";
import { MEDICOS } from "../roles";
import { RE_CIE10 } from "./generar";

const codigo = z.string().trim().toUpperCase().regex(/^[0-9A-Z]{1,3}$/, "Código de tabla inválido").or(z.literal("")).transform((v) => v || null);
const cie10 = z.string().trim().toUpperCase().regex(RE_CIE10, "Diagnóstico CIE-10 inválido (4 caracteres, p. ej. K021)");

export const esquemaRips = z.object({
  tipoUsuario: codigo.optional(),
  numAutorizacion: z.string().trim().max(30, "La autorización admite hasta 30 caracteres").transform((v) => v || null).optional(),
  viaIngreso: codigo.optional(),
  causaMotivoAtencion: codigo.optional(),
  profesionalAtiendeId: z.string().trim().transform((v) => v || null).optional(),
  items: z.array(z.object({
    id: z.string().min(1),
    codigoCups: z.string().trim().regex(/^\d{6}$/, "El CUPS debe tener 6 dígitos").or(z.literal("")).transform((v) => v || null),
    tipoRips: z.enum(["CONSULTA", "PROCEDIMIENTO", "OTRO_SERVICIO"]),
  })).max(100).optional(),
  // Clínicos
  finalidad: codigo.optional(),
  tipoDiagnostico: codigo.optional(),
  diagnosticoPrincipal: cie10.or(z.literal("")).transform((v) => v || null).optional(),
  diagnosticosRelacionados: z.array(cie10).max(10).optional(),
});
export type DatosRips = z.output<typeof esquemaRips>;

export const CAMPOS_CLINICOS = ["finalidad", "tipoDiagnostico", "diagnosticoPrincipal", "diagnosticosRelacionados"] as const;

/** Quita los campos clínicos si el rol no es médico (recepción no puede tocarlos, aunque los envíe a mano). */
export function permitidosParaRol(rol: string, d: DatosRips): DatosRips {
  if ((MEDICOS as readonly string[]).includes(rol)) return d;
  const copia = { ...d };
  for (const c of CAMPOS_CLINICOS) delete copia[c];
  return copia;
}

/** Mensaje de error de dominio de los diagnósticos (sin repetidos). */
export function errorDiagnosticos(principal: string | null | undefined, relacionados: string[] | undefined): string | null {
  const r = relacionados ?? [];
  if (new Set(r).size !== r.length) return "Hay diagnósticos relacionados repetidos";
  if (principal && r.includes(principal)) return "Un diagnóstico relacionado repite el principal";
  return null;
}
