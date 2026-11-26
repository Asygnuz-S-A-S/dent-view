import { Badge } from "@/components/ui/badge";
import { ETIQUETA_ITEM_PLAN, ETIQUETA_PLAN, type EstadoItemPlan, type EstadoPlan } from "@/lib/planes";

type Variante = React.ComponentProps<typeof Badge>["variant"];
const PLAN: Record<EstadoPlan, Variante> = { ACTIVO: "info", COMPLETADO: "success", CANCELADO: "secondary" };
const ITEM: Record<EstadoItemPlan, Variante> = { PENDIENTE: "secondary", EN_ORDEN: "warning", REALIZADO: "success" };
export const BadgePlan = ({ estado }: { estado: EstadoPlan }) => <Badge variant={PLAN[estado]}>{ETIQUETA_PLAN[estado]}</Badge>;
export const BadgeItemPlan = ({ estado }: { estado: EstadoItemPlan }) => <Badge variant={ITEM[estado]}>{ETIQUETA_ITEM_PLAN[estado]}</Badge>;
