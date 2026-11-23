import { Badge } from "@/components/ui/badge";
import { ETIQUETA_ESTADO, type EstadoVal } from "@/lib/valoraciones";

type Variante = React.ComponentProps<typeof Badge>["variant"];
export const VARIANTE_VALORACION: Record<EstadoVal, Variante> = {
  BORRADOR: "secondary", PENDIENTE_PACIENTE: "warning", RECIBIDA: "info", EN_REVISION: "violet",
  REQUIERE_MAS_INFO: "warning", COMPLETADA: "success", CANCELADA: "secondary", EXPIRADA: "danger",
};
export const BadgeValoracion = ({ estado }: { estado: EstadoVal }) => <Badge variant={VARIANTE_VALORACION[estado]}>{ETIQUETA_ESTADO[estado]}</Badge>;
