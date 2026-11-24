// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
// Lógica pura de cuentas de cobro internas (no son factura electrónica DIAN).
export const ESTADOS_FACTURA = ["ABIERTA", "PAGADA", "ANULADA"] as const;
export type EstadoFactura = (typeof ESTADOS_FACTURA)[number];
export const ETIQUETA_ESTADO_FACTURA: Record<EstadoFactura, string> = { ABIERTA: "Abierta", PAGADA: "Pagada", ANULADA: "Anulada" };
export const VARIANTE_ESTADO_FACTURA: Record<EstadoFactura, "default" | "secondary" | "outline" | "destructive"> = {
  ABIERTA: "outline",
  PAGADA: "default",
  ANULADA: "destructive",
};

export type Responsable = "PACIENTE" | "DOCTOR" | "CONVENIO";
export const ETIQUETA_RESPONSABLE: Record<Responsable, string> = { PACIENTE: "Paciente", DOCTOR: "Doctor", CONVENIO: "Convenio" };

export const MEDIOS_PAGO = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];
// PASARELA lo escribe solo el webhook de pago en línea y ANTICIPO la aplicación de un anticipo: no están en MEDIOS_PAGO (selector manual).
export const ETIQUETA_MEDIO: Record<MedioPago | "PASARELA" | "ANTICIPO", string> = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", TARJETA: "Tarjeta", OTRO: "Otro", PASARELA: "Pasarela de pago", ANTICIPO: "Anticipo" };

export const numeroFactura = (n: number) => `FC-${String(n).padStart(4, "0")}`;

export const totalItems = (items: { cantidad: number; valorUnitario: number }[]) =>
  items.reduce((t, i) => t + i.cantidad * i.valorUnitario, 0);

type PagoSuma = { valor: number; anuladoEn?: Date | null };
/** Los pagos anulados (anuladoEn != null) nunca suman: toda suma de pagos del sistema pasa por aquí o filtra `anuladoEn: null` en la consulta. */
export const totalPagado = (pagos: PagoSuma[]) => pagos.reduce((t, p) => (p.anuladoEn ? t : t + p.valor), 0);

/** Saldo = total (ya neto de notas crédito: la nota crédito reduce Factura.total) menos pagos vigentes. Negativo = saldo a favor del paciente. */
export const saldo = (total: number, pagos: PagoSuma[]) => total - totalPagado(pagos);

/** Estado de una cuenta abierta tras sus pagos: con saldo 0 pasa a PAGADA. */
export const estadoTrasPago = (total: number, pagos: PagoSuma[]): "ABIERTA" | "PAGADA" =>
  saldo(total, pagos) <= 0 ? "PAGADA" : "ABIERTA";

/** Cuánto de un anticipo se puede aplicar a una cuenta: lo que le queda al anticipo, sin pasar del saldo de la cuenta. */
export const montoAplicable = (anticipo: { valor: number; valorAplicado: number }, saldoCuenta: number) =>
  Math.max(0, Math.min(anticipo.valor - anticipo.valorAplicado, saldoCuenta));

export const MOTIVO_MIN = 5;
/** Motivo obligatorio de anulaciones y notas crédito (mín. 5 caracteres); devuelve el texto limpio o null. */
export const motivoValido = (m: unknown) => (typeof m === "string" && m.trim().length >= MOTIVO_MIN ? m.trim().slice(0, 500) : null);

/** Valida una nota crédito sobre una cuenta pagada: entero > 0 y no mayor a min(pagado, total vigente). `total` ya viene descontadas las notas anteriores: así varias notas no pueden dejar el total negativo. */
export function validarNotaCredito(valor: number, pagado: number, total: number): string | null {
  if (!Number.isInteger(valor) || valor <= 0) return "El valor debe ser un entero mayor a 0";
  if (valor > pagado) return "La nota crédito no puede superar lo pagado";
  if (valor > total) return "La nota crédito no puede superar el total vigente de la cuenta (ya hay notas crédito previas)";
  return null;
}

/** Mensaje de error si el abono no es válido (entero > 0 y ≤ saldo); null si es válido. */
export function validarAbono(valor: number, saldoActual: number): string | null {
  if (!Number.isInteger(valor) || valor <= 0) return "El abono debe ser un valor entero mayor a 0";
  if (valor > saldoActual) return "El abono no puede superar el saldo";
  return null;
}
