// Plan de tratamiento con costo: lógica pura, sin I/O. Montos en pesos enteros (COP). Cada PlanItem es UNA unidad (la orden no maneja cantidad).
import { z } from "zod";
import { CLINICOS } from "./roles";
import type { EstadoOrden } from "./ordenes";

export const ROLES_PLANES = CLINICOS;
export const MAX_ITEMS_PLAN = 200;
export const METODOS_ANTICIPO = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"] as const;
export const MAX_ANTICIPO = 500_000_000;

export type EstadoItemPlan = "PENDIENTE" | "EN_ORDEN" | "REALIZADO";
export type EstadoPlan = "ACTIVO" | "COMPLETADO" | "CANCELADO";
export const ETIQUETA_ITEM_PLAN: Record<EstadoItemPlan, string> = { PENDIENTE: "Pendiente", EN_ORDEN: "En orden", REALIZADO: "Realizado" };
export const ETIQUETA_PLAN: Record<EstadoPlan, string> = { ACTIVO: "Activo", COMPLETADO: "Completado", CANCELADO: "Cancelado" };

/** Reparte `neto` entre `cantidad` unidades sin perder pesos: las primeras unidades llevan el resto. */
export function repartirNeto(neto: number, cantidad: number): number[] {
  const base = Math.floor(neto / cantidad), resto = neto - base * cantidad;
  return Array.from({ length: cantidad }, (_, i) => base + (i < resto ? 1 : 0));
}

type LineaPresupuesto = { servicioId: string | null; descripcion: string; diente: number | null; fase: number; posicion: number; cantidad: number; valorUnitario: number; descuento: number };
/** Ítems del plan a partir de una cotización: solo catálogo (la orden necesita servicio); lo libre se cuenta aparte y queda fuera del plan. */
export function itemsDeCotizacion(lineas: LineaPresupuesto[]) {
  const orden = [...lineas].sort((a, b) => a.fase - b.fase || a.posicion - b.posicion);
  const items = orden.filter((l) => l.servicioId).flatMap((l) => {
    const neto = Math.max(0, l.cantidad * l.valorUnitario - l.descuento);
    return repartirNeto(neto, l.cantidad).map((precio) => ({ servicioId: l.servicioId!, descripcion: l.descripcion, diente: l.diente, fase: l.fase, precio }));
  }).map((i, posicion) => ({ ...i, posicion }));
  return { items, libres: lineas.length - orden.filter((l) => l.servicioId).length };
}

type ItemCalc = { precio: number; estado: EstadoItemPlan };
type AnticipoCalc = { valor: number; valorAplicado: number };
export const totalItems = (items: { precio: number }[]) => items.reduce((t, i) => t + i.precio, 0);

/** Avance y saldos. `saldo` = lo que falta por ejecutar (total − realizado); el anticipo disponible lo cubre antes de cobrar. */
export function resumenPlan(items: ItemCalc[], anticipos: AnticipoCalc[] = []) {
  const suma = (e: EstadoItemPlan) => totalItems(items.filter((i) => i.estado === e));
  const total = totalItems(items), realizado = suma("REALIZADO"), enOrden = suma("EN_ORDEN"), pendiente = suma("PENDIENTE");
  const hechos = items.filter((i) => i.estado === "REALIZADO").length;
  const avancePct = total > 0 ? Math.round((realizado / total) * 100) : items.length ? Math.round((hechos / items.length) * 100) : 0;
  const anticipoTotal = anticipos.reduce((t, a) => t + a.valor, 0);
  const anticipoAplicado = anticipos.reduce((t, a) => t + a.valorAplicado, 0);
  const anticipoDisponible = anticipoTotal - anticipoAplicado;
  const saldo = total - realizado;
  return { total, realizado, enOrden, pendiente, saldo, avancePct, anticipoTotal, anticipoAplicado, anticipoDisponible, saldoPorPagar: Math.max(0, saldo - anticipoDisponible) };
}

/** Qué pasa con los ítems de una orden cuando ella cambia de estado: tomada en adelante → realizados; cancelada → vuelven a pendiente. */
export function estadoItemTrasOrden(orden: EstadoOrden): EstadoItemPlan | null {
  if (orden === "TOMADA" || orden === "INFORMADA" || orden === "ENTREGADA") return "REALIZADO";
  return orden === "CANCELADA" ? "PENDIENTE" : null;
}
/** Estados de ítem de los que se puede pasar al destino (el resto no se toca: p. ej. un ítem ya realizado no vuelve por una orden que no era suya). */
export const ORIGENES_ITEM: Record<"PENDIENTE" | "REALIZADO", readonly EstadoItemPlan[]> = { REALIZADO: ["EN_ORDEN"], PENDIENTE: ["EN_ORDEN", "REALIZADO"] };

/** Un plan activo se completa cuando todos sus ítems están realizados y se reabre si alguno vuelve atrás. El cancelado no cambia. */
export function estadoPlanTras(actual: EstadoPlan, items: { estado: EstadoItemPlan }[]): EstadoPlan {
  if (actual === "CANCELADO") return actual;
  return items.length > 0 && items.every((i) => i.estado === "REALIZADO") ? "COMPLETADO" : "ACTIVO";
}

export const puedeCancelarPlan = (estado: EstadoPlan, items: { estado: EstadoItemPlan }[]) => estado === "ACTIVO" && !items.some((i) => i.estado === "EN_ORDEN");

export const esquemaPlanManual = z.strictObject({
  pacienteId: z.string().min(1, "Selecciona un paciente").max(40),
  titulo: z.string().trim().max(120).optional(),
  items: z.array(z.strictObject({
    servicioId: z.string().min(1).max(40),
    cantidad: z.number().int().min(1).max(20),
    fase: z.number().int().min(1).max(12).default(1),
    diente: z.number().int().min(11).max(85).nullish(),
  })).min(1, "Agrega al menos un ítem").max(60),
});
export type EntradaPlanManual = z.input<typeof esquemaPlanManual>;

export const esquemaAnticipoPlan = z.strictObject({
  monto: z.number().int("El monto va en pesos enteros").min(1000, "El anticipo mínimo es $1.000").max(MAX_ANTICIPO),
  medio: z.enum(METODOS_ANTICIPO),
});
