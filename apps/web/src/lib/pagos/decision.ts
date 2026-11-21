// Decisión pura sobre un evento de pasarela ya autenticado: ¿se aplica un pago, se cambia el estado o se ignora?
import type { EstadoPago } from "./proveedor";

export type EstadoLink = "CREADO" | "PENDIENTE" | "APROBADO" | "RECHAZADO" | "EXPIRADO" | "ANULADO";
export type Decision = { accion: "APLICAR" } | { accion: "ESTADO"; estado: EstadoLink } | { accion: "IGNORAR"; motivo: string };

/**
 * Un pago aprobado solo se aplica si monto y moneda coinciden EXACTAMENTE con el link (nunca se confía en el payload para el valor).
 * Un link anulado o vencido localmente igual recibe un APROBADO: el dinero ya llegó a la cuenta del centro.
 */
export function decidirEvento(link: { monto: number; moneda: string; estado: string }, ev: { estado: EstadoPago; monto: number | null; moneda: string | null }): Decision {
  if (link.estado === "APROBADO") return { accion: "IGNORAR", motivo: "link_ya_aprobado" };
  if (ev.estado === "APROBADO") {
    if (ev.monto !== link.monto) return { accion: "IGNORAR", motivo: "monto_no_coincide" };
    if ((ev.moneda ?? "").toUpperCase() !== link.moneda.toUpperCase()) return { accion: "IGNORAR", motivo: "moneda_no_coincide" };
    return { accion: "APLICAR" };
  }
  if (link.estado === "ANULADO" || link.estado === "EXPIRADO") return { accion: "IGNORAR", motivo: "link_cerrado" };
  if (ev.estado === "PENDIENTE" && link.estado !== "CREADO") return { accion: "IGNORAR", motivo: "sin_cambio" };
  return { accion: "ESTADO", estado: ev.estado };
}

/** Estado que ve el usuario: un link sin pagar pasado su vencimiento se muestra como EXPIRADO. */
export const estadoEfectivoLink = (l: { estado: string; expiraEn: Date | null }, ahora = new Date()): EstadoLink =>
  (l.estado === "CREADO" || l.estado === "PENDIENTE") && l.expiraEn && l.expiraEn < ahora ? "EXPIRADO" : (l.estado as EstadoLink);

export const linkActivo = (l: { estado: string; expiraEn: Date | null }, ahora = new Date()) => {
  const e = estadoEfectivoLink(l, ahora);
  return e === "CREADO" || e === "PENDIENTE";
};
