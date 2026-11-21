// Catálogo de eventos públicos de webhooks y su payload mínimo y versionado.
// Compartido con el worker (sin dependencias de Next): solo imports relativos con extensión.
// Regla de datos: ids, estados y, solo para casar registros, tipo y número de documento del paciente.
// NUNCA contenido clínico, notas, hallazgos ni enlaces de resultados.

export const EVENTOS_PUBLICOS = [
  "paciente.creado", "orden.creada", "orden.estado_cambiado", "estudio.recibido", "estudio.asignado", "estudio.publicado",
  "informe.emitido", "resultados.entregados", "cita.creada", "cita.estado_cambiado", "factura.pago_registrado", "webhook.prueba",
] as const;
export type EventoPublico = (typeof EVENTOS_PUBLICOS)[number];

/** Agrupación para la UI. */
export const GRUPOS_EVENTOS: { grupo: string; eventos: EventoPublico[] }[] = [
  { grupo: "Pacientes", eventos: ["paciente.creado"] },
  { grupo: "Órdenes", eventos: ["orden.creada", "orden.estado_cambiado"] },
  { grupo: "Estudios", eventos: ["estudio.recibido", "estudio.asignado", "estudio.publicado"] },
  { grupo: "Informes y resultados", eventos: ["informe.emitido", "resultados.entregados"] },
  { grupo: "Agenda", eventos: ["cita.creada", "cita.estado_cambiado"] },
  { grupo: "Facturación", eventos: ["factura.pago_registrado"] },
];

export const esEventoPublico = (e: string): e is EventoPublico => (EVENTOS_PUBLICOS as readonly string[]).includes(e);

type D = Record<string, unknown>;
const pick = (d: D, ...claves: string[]) => Object.fromEntries(claves.map((k) => [k, d[k] ?? null]));

// Evento.tipo interno -> nombre público + extractor de datos (lista blanca de campos del detalle).
const MAPA: Record<string, { evento: EventoPublico; datos: (d: D) => D }> = {
  "paciente.creado": { evento: "paciente.creado", datos: () => ({}) },
  "orden.creada": { evento: "orden.creada", datos: (d) => pick(d, "ordenId", "numero") },
  "orden.estado": { evento: "orden.estado_cambiado", datos: (d) => ({ ordenId: d.ordenId ?? null, estadoAnterior: d.de ?? null, estado: d.a ?? null }) },
  "estudio.asignado": { evento: "estudio.asignado", datos: (d) => pick(d, "estudioId", "doctorId", "ordenId") },
  "estudio.publicado": { evento: "estudio.publicado", datos: (d) => pick(d, "estudioId") },
  "informe.emitido": { evento: "informe.emitido", datos: (d) => pick(d, "informeId", "version") },
  "resultados.entregados": { evento: "resultados.entregados", datos: (d) => pick(d, "informeId", "estudios") },
  "cita.creada": { evento: "cita.creada", datos: (d) => pick(d, "citaId", "inicio") },
  "cita.estado": { evento: "cita.estado_cambiado", datos: (d) => ({ citaId: d.citaId ?? null, estadoAnterior: d.de ?? null, estado: d.a ?? null }) },
  "factura.pago": { evento: "factura.pago_registrado", datos: (d) => pick(d, "facturaId", "valor", "medio", "estado") },
};

/** Traduce un Evento.tipo interno; null si no es público. */
export function aEventoPublico(tipo: string, detalle?: object | null): { evento: EventoPublico; datos: D } | null {
  const m = Object.hasOwn(MAPA, tipo) ? MAPA[tipo] : undefined;
  return m ? { evento: m.evento, datos: m.datos((detalle ?? {}) as D) } : null;
}

export type PayloadWebhook = {
  id: string; evento: EventoPublico; version: 1; creadoEn: string;
  centro: { id: string; slug: string };
  datos: D;
};

export function armarPayload(p: {
  id: string; evento: EventoPublico; creadoEn: Date; centro: { id: string; slug: string };
  datos: D; paciente?: { id: string; tipoDocumento: string; numeroDocumento: string } | null;
}): PayloadWebhook {
  const datos = p.paciente
    ? { ...p.datos, pacienteId: p.paciente.id, paciente: { tipoDocumento: p.paciente.tipoDocumento, numeroDocumento: p.paciente.numeroDocumento } }
    : p.datos;
  return { id: p.id, evento: p.evento, version: 1, creadoEn: p.creadoEn.toISOString(), centro: p.centro, datos };
}
