// Privacidad del servidor MCP (Ley 1581): lo que sale hacia un agente de IA se minimiza y se enmascara.
// Lógica pura, sin I/O.

/** "Laura Valentina Gómez Ríos" → "L. V. G. R." (una inicial por palabra). */
export function iniciales(nombre: string) {
  return nombre.trim().split(/\s+/).filter(Boolean).map((p) => `${[...p][0]!.toUpperCase()}.`).join(" ");
}

/** "1053800101" → "****0101". Documentos de 4 o menos caracteres se ocultan por completo. */
export const enmascararDocumento = (doc: string) => (doc.length > 4 ? `****${doc.slice(-4)}` : "****");

/** Texto que viene de la base: sin caracteres de control, espacios colapsados y acotado. Sigue siendo un dato, nunca una instrucción. */
export const limpiarTexto = (s: string | null | undefined, max = 80) =>
  (s ?? "").replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export type FilaPaciente = { id: string; nombre: string; persona: { tipoDocumento: string; numeroDocumento: string } };

/** Identificación de un paciente según el permiso `pii`. Nunca incluye contacto ni datos clínicos. */
export function pacienteVisible(p: FilaPaciente, pii: boolean) {
  return {
    id: p.id,
    nombre: pii ? limpiarTexto(p.nombre, 120) : iniciales(limpiarTexto(p.nombre, 120)),
    documento: { tipo: limpiarTexto(p.persona.tipoDocumento, 4), numero: pii ? limpiarTexto(p.persona.numeroDocumento, 20) : enmascararDocumento(p.persona.numeroDocumento) },
  };
}

/** Nombre de una persona (doctor) con la misma regla que los pacientes. */
export const nombreVisible = (nombre: string, pii: boolean) => (pii ? limpiarTexto(nombre, 120) : iniciales(limpiarTexto(nombre, 120)));

/** Descarta elementos del final hasta que el JSON quepa en `maxCaracteres`. */
export function acotar<T>(items: T[], maxCaracteres = 40_000) {
  let lista = items;
  while (lista.length > 0 && JSON.stringify(lista).length > maxCaracteres) lista = lista.slice(0, Math.ceil(lista.length / 2));
  return { items: lista, truncado: lista.length < items.length };
}
