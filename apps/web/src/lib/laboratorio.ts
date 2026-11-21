// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
// Lógica pura de casos de laboratorio.
export const ESTADOS_LAB = ["PENDIENTE", "ENVIADO", "RECIBIDO", "ENTREGADO", "CANCELADO"] as const;
export type EstadoLab = (typeof ESTADOS_LAB)[number];
export const ETIQUETA_LAB: Record<EstadoLab, string> = { PENDIENTE: "Pendiente", ENVIADO: "Enviado", RECIBIDO: "Recibido", ENTREGADO: "Entregado", CANCELADO: "Cancelado" };

/** Vencido: pasó la entrega esperada y el caso sigue sin recibirse (PENDIENTE o ENVIADO). */
export const estaVencido = (c: { estado: EstadoLab; entregaEsperada: Date | null }, ahora = new Date()) =>
  (c.estado === "PENDIENTE" || c.estado === "ENVIADO") && c.entregaEsperada !== null && c.entregaEsperada < ahora;
