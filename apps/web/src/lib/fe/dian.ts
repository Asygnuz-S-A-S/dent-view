// Catálogos y cálculos DIAN (puros). Los códigos deben validarse contra el anexo técnico vigente (Res. 165/2023).
import type { TipoDocumentoDian } from "./proveedor";

export const TIPO_DOCUMENTO_DIAN: Record<string, TipoDocumentoDian> = { CC: "13", TI: "12", CE: "22", PA: "41", RC: "11", NIT: "31" };
export const tipoDocumentoDian = (t: string): TipoDocumentoDian | null => TIPO_DOCUMENTO_DIAN[t.trim().toUpperCase()] ?? null;

/** Medios de pago DIAN (tabla del anexo técnico). TODO: validar con el contador; ANTICIPO/OTRO usan 1 "instrumento no definido". */
export const MEDIO_PAGO_DIAN: Record<string, string> = { EFECTIVO: "10", TRANSFERENCIA: "31", TARJETA: "48", PASARELA: "48", ANTICIPO: "1", OTRO: "1" };

const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
/** Dígito de verificación del NIT (módulo 11 con los pesos de la DIAN). null si no son solo dígitos (1 a 15). */
export function digitoVerificacionNit(nit: string): string | null {
  const s = nit.replace(/[.\s-]/g, "");
  if (!/^\d{1,15}$/.test(s)) return null;
  let suma = 0;
  for (let i = 0; i < s.length; i++) suma += Number(s[s.length - 1 - i]) * PESOS[i]!;
  const r = suma % 11;
  return String(r > 1 ? 11 - r : r);
}
export const nitValido = (nit: string, dv: string) => digitoVerificacionNit(nit) === dv;
