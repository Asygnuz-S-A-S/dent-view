import { Badge } from "@/components/ui/badge";
import { ETIQUETA_ESTADO, type EstadoVisible } from "@/lib/presupuestos";

type Variante = React.ComponentProps<typeof Badge>["variant"];
export const VARIANTE_PRESUPUESTO: Record<EstadoVisible, Variante> = {
  BORRADOR: "secondary", ENVIADO: "info", VISTO: "violet", ACEPTADO: "success", RECHAZADO: "danger", VENCIDA: "warning", ANULADA: "secondary", CONVERTIDO: "success",
};
export const BadgePresupuesto = ({ estado }: { estado: EstadoVisible }) => <Badge variant={VARIANTE_PRESUPUESTO[estado]}>{ETIQUETA_ESTADO[estado]}</Badge>;
