import { Badge } from "@/components/ui/badge";
import { ETIQUETA_ESTADO_DOC, type EstadoDoc } from "@/lib/fe/estados";

const VARIANTE: Record<EstadoDoc, "default" | "secondary" | "outline" | "destructive" | "success" | "warning" | "info"> = {
  BORRADOR: "outline", ENVIANDO: "info", ACEPTADA: "success", RECHAZADA: "destructive", ERROR: "warning", ANULADA: "secondary",
};
export const InsigniaFev = ({ estado }: { estado: EstadoDoc }) => <Badge variant={VARIANTE[estado]}>{ETIQUETA_ESTADO_DOC[estado]}</Badge>;
