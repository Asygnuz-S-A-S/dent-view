// Remisión entre centros: lógica pura (estados, transiciones, copia mínima del paciente y proyección hacia el destino).
// Ver docs/producto/remisiones-entre-centros.md. Sin I/O: lo prueba remisiones.test.ts.
import type { Prisma } from "@dent-view/db";

export const ESTADOS = ["ENVIADA", "RECIBIDA", "EN_PROCESO", "DEVUELTA", "RECHAZADA", "CANCELADA"] as const;
export type EstadoRemision = (typeof ESTADOS)[number];
export const ETIQUETA_ESTADO: Record<EstadoRemision, string> = {
  ENVIADA: "Enviada", RECIBIDA: "Recibida", EN_PROCESO: "En proceso", DEVUELTA: "Devuelta", RECHAZADA: "Rechazada", CANCELADA: "Cancelada",
};

export const ALCANCES = ["IDENTIFICACION", "CONTACTO", "FECHA_NACIMIENTO", "EMBARAZO"] as const;
export type Alcance = (typeof ALCANCES)[number];
export const ETIQUETA_ALCANCE: Record<Alcance, string> = {
  IDENTIFICACION: "Nombre y documento de identidad", CONTACTO: "Celular de contacto", FECHA_NACIMIENTO: "Fecha de nacimiento", EMBARAZO: "Si hay embarazo",
};

export const CONSENTIMIENTO_REMISION_V = "2026-11";
export const TEXTO_CONSENTIMIENTO_REMISION =
  "El paciente autoriza de forma expresa, previa e informada (Ley 1581 de 2012) que este centro comparta con el centro destino de la remisión " +
  "únicamente los datos marcados, para que el centro destino realice el estudio solicitado y devuelva el estudio y su informe. " +
  "No se comparte la ficha, el historial ni las notas clínicas del paciente. El paciente puede revocar esta autorización escribiendo al centro que remite.";

type Lado = "origen" | "destino";
const TRANSICIONES: readonly (readonly [EstadoRemision, EstadoRemision, Lado])[] = [
  ["ENVIADA", "RECIBIDA", "destino"],
  ["ENVIADA", "RECHAZADA", "destino"],
  ["RECIBIDA", "RECHAZADA", "destino"],
  ["ENVIADA", "CANCELADA", "origen"],
  ["RECIBIDA", "CANCELADA", "origen"],
  ["RECIBIDA", "EN_PROCESO", "destino"],
  ["EN_PROCESO", "DEVUELTA", "destino"],
  ["DEVUELTA", "DEVUELTA", "destino"], // re-devolver (p. ej. versión nueva del informe)
];

/** Valida una transición: quién puede hacerla (`lado`) y que el rechazo lleve motivo. */
export function transicionRemision(de: EstadoRemision, a: EstadoRemision, lado: Lado, motivo?: string | null): { ok: true } | { ok: false; error: string } {
  if (!TRANSICIONES.some(([d, h, l]) => d === de && h === a && l === lado)) return { ok: false, error: `No se puede pasar de ${de} a ${a}` };
  if (a === "RECHAZADA" && !motivo?.trim()) return { ok: false, error: "Indica el motivo del rechazo" };
  return { ok: true };
}

export type PacienteOrigen = {
  nombre: string;
  fechaNacimiento?: Date | null;
  celular?: string | null;
  persona: { tipoDocumento: string; numeroDocumento: string };
};

/**
 * Copia mínima que viaja al destino. Solo se copian los campos autorizados en `alcance`: nombre y documento siempre;
 * fecha de nacimiento, celular y embarazo solo si están marcados. Nunca correo, dirección, alertas, notas, foto ni RIPS.
 */
export function copiaMinima(paciente: PacienteOrigen, alcance: readonly string[], embarazo?: boolean | null) {
  if (!alcance.includes("IDENTIFICACION")) throw new Error("El alcance debe incluir la identificación del paciente");
  return {
    tipoDocumento: paciente.persona.tipoDocumento,
    numeroDocumento: paciente.persona.numeroDocumento,
    nombre: paciente.nombre,
    fechaNacimiento: alcance.includes("FECHA_NACIMIENTO") ? (paciente.fechaNacimiento ?? null) : null,
    celular: alcance.includes("CONTACTO") ? (paciente.celular ?? null) : null,
    embarazo: alcance.includes("EMBARAZO") ? (embarazo ?? null) : null,
  };
}

/** Proyección Prisma para el centro destino: sin ids ni autoría del lado origen (paciente, autorización, usuarios). */
export const SELECT_DESTINO = {
  id: true, estado: true, origenId: true, destinoId: true,
  origen: { select: { name: true } },
  tipoDocumento: true, numeroDocumento: true, nombre: true, fechaNacimiento: true, celular: true, embarazo: true,
  motivo: true, estudiosSolicitados: true, remitenteNombre: true,
  alcance: true, consentimientoTexto: true, consentimientoVersion: true, consentimientoEn: true,
  pacienteDestinoId: true, ordenDestinoId: true, motivoRechazo: true, informeId: true, estudioUids: true, devueltaEn: true,
  creadoEn: true, actualizadoEn: true,
} satisfies Prisma.RemisionSelect;

/** Proyección para el centro origen: sin ids del lado destino (paciente y orden del destino). */
export const SELECT_ORIGEN = {
  id: true, estado: true, origenId: true, destinoId: true,
  destino: { select: { name: true } },
  pacienteOrigenId: true, creadoPorId: true,
  tipoDocumento: true, numeroDocumento: true, nombre: true, fechaNacimiento: true, celular: true, embarazo: true,
  motivo: true, estudiosSolicitados: true, remitenteNombre: true,
  alcance: true, consentimientoTexto: true, consentimientoVersion: true, consentimientoEn: true,
  motivoRechazo: true, informeId: true, estudioUids: true, devueltaEn: true,
  creadoEn: true, actualizadoEn: true,
} satisfies Prisma.RemisionSelect;
