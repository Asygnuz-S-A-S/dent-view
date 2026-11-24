import { Badge } from "@/components/ui/badge";
import { ETIQUETA_ESTADO_CITA, type EstadoCita } from "@/lib/agenda";
import { saldo } from "@/lib/facturacion";
import { ETIQUETA_ESTADO_ORDEN, type EstadoOrden } from "@/lib/ordenes";

type Variante = React.ComponentProps<typeof Badge>["variant"];

/** Color semántico por estado: el mismo en badges, filtros y gráficas (var CSS del tema). */
export const VARIANTE_ORDEN: Record<EstadoOrden, Variante> = {
  SOLICITADA: "warning", AGENDADA: "info", TOMADA: "violet", INFORMADA: "soft", ENTREGADA: "success", CANCELADA: "danger",
};
export const VARIANTE_CITA: Record<EstadoCita, Variante> = {
  PROGRAMADA: "secondary", CONFIRMADA: "info", LLEGO: "warning", EN_ATENCION: "violet", ATENDIDA: "success", NO_ASISTIO: "danger", CANCELADA: "secondary",
};
/** Color sólido (para gráficas) equivalente a cada variante. */
export const COLOR_VARIANTE: Record<string, string> = {
  default: "var(--chart-1)", soft: "var(--chart-1)", info: "var(--info)", warning: "var(--warning)", violet: "var(--violet)",
  success: "var(--success)", danger: "var(--danger)", secondary: "var(--muted-foreground)",
};

export const BadgeOrden = ({ estado }: { estado: EstadoOrden }) => <Badge variant={VARIANTE_ORDEN[estado]}>{ETIQUETA_ESTADO_ORDEN[estado]}</Badge>;
export const BadgeCita = ({ estado }: { estado: string }) => (
  <Badge variant={VARIANTE_CITA[estado as EstadoCita] ?? "secondary"}>{ETIQUETA_ESTADO_CITA[estado as EstadoCita] ?? estado}</Badge>
);

export type EstadoCuenta = "PAGADA" | "ANULADA" | "VENCIDA" | "PARCIAL" | "ABIERTA";
export const CUENTA: Record<EstadoCuenta, { texto: string; variante: Variante }> = {
  PAGADA: { texto: "Pagada", variante: "success" },
  ANULADA: { texto: "Anulada", variante: "secondary" },
  VENCIDA: { texto: "Vencida", variante: "danger" },
  PARCIAL: { texto: "Parcial", variante: "warning" },
  ABIERTA: { texto: "Abierta", variante: "info" },
};
type FacturaEstado = { estado: string; total: number; vence: Date | null; pagos: { valor: number; anuladoEn?: Date | null }[] };
/** Estado efectivo de una cuenta de cobro: la abierta se afina en vencida / parcial según vencimiento y abonos. */
export function estadoCuenta(f: FacturaEstado, ahora = new Date()): EstadoCuenta {
  if (f.estado === "PAGADA" || f.estado === "ANULADA") return f.estado;
  if (f.vence && f.vence < ahora && saldo(f.total, f.pagos) > 0) return "VENCIDA";
  return f.pagos.some((p) => !p.anuladoEn) ? "PARCIAL" : "ABIERTA";
}
export const BadgeCuenta = ({ estado }: { estado: EstadoCuenta }) => <Badge variant={CUENTA[estado].variante}>{CUENTA[estado].texto}</Badge>;
