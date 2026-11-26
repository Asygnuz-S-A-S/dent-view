import { Badge } from "@/components/ui/badge";
import { ETIQUETA_ESTADO, type EstadoRemision } from "@/lib/remisiones";

type Variante = React.ComponentProps<typeof Badge>["variant"];
export const VARIANTE_REMISION: Record<EstadoRemision, Variante> = {
  ENVIADA: "warning", RECIBIDA: "info", EN_PROCESO: "violet", DEVUELTA: "success", RECHAZADA: "danger", CANCELADA: "secondary",
};
export const BadgeRemision = ({ estado }: { estado: EstadoRemision }) => <Badge variant={VARIANTE_REMISION[estado]}>{ETIQUETA_ESTADO[estado]}</Badge>;
