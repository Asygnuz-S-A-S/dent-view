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
export const ETIQUETA_MEDIO: Record<MedioPago, string> = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", TARJETA: "Tarjeta", OTRO: "Otro" };

export const numeroFactura = (n: number) => `FC-${String(n).padStart(4, "0")}`;

export const totalItems = (items: { cantidad: number; valorUnitario: number }[]) =>
  items.reduce((t, i) => t + i.cantidad * i.valorUnitario, 0);

export const totalPagado = (pagos: { valor: number }[]) => pagos.reduce((t, p) => t + p.valor, 0);

export const saldo = (total: number, pagos: { valor: number }[]) => total - totalPagado(pagos);

/** Estado de una cuenta abierta tras sus pagos: con saldo 0 pasa a PAGADA. */
export const estadoTrasPago = (total: number, pagos: { valor: number }[]): "ABIERTA" | "PAGADA" =>
  saldo(total, pagos) <= 0 ? "PAGADA" : "ABIERTA";

/** Mensaje de error si el abono no es válido (entero > 0 y ≤ saldo); null si es válido. */
export function validarAbono(valor: number, saldoActual: number): string | null {
  if (!Number.isInteger(valor) || valor <= 0) return "El abono debe ser un valor entero mayor a 0";
  if (valor > saldoActual) return "El abono no puede superar el saldo";
  return null;
}
