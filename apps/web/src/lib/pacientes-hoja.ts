// Hoja de vida del paciente: tipos y utilidades puras de la línea de tiempo unificada.
export const TIPOS_HOJA = ["orden", "cita", "estudio", "informe", "entrega", "pago", "consentimiento", "seguimiento", "paciente"] as const;
export type TipoHoja = (typeof TIPOS_HOJA)[number];
export const ETIQUETA_TIPO_HOJA: Record<TipoHoja, string> = {
  orden: "Órdenes", cita: "Citas", estudio: "Estudios", informe: "Informes", entrega: "Entregas",
  pago: "Pagos", consentimiento: "Consentimientos", seguimiento: "Seguimiento", paciente: "Datos del paciente",
};

export type EntradaHoja = { id: string; tipo: TipoHoja; fecha: Date; titulo: string; detalle?: string; href?: string };

/** Más reciente primero; a igual fecha, orden estable por id. */
export const ordenarHoja = (xs: EntradaHoja[]) =>
  [...xs].sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || a.id.localeCompare(b.id));

/** Tipos válidos de `?tipos=orden,pago`; vacío = todos. */
export const leerTiposHoja = (s: string | undefined): TipoHoja[] =>
  (s ?? "").split(",").filter((t): t is TipoHoja => (TIPOS_HOJA as readonly string[]).includes(t));

export const filtrarHoja = (xs: EntradaHoja[], tipos: TipoHoja[]) => (tipos.length ? xs.filter((x) => tipos.includes(x.tipo)) : xs);
