// Lógica pura de precios del catálogo (COP).
export type Entrega = "IMPRESA" | "DIGITAL";
export type ServicioPrecio = { precioImpreso: number | null; precioDigital: number | null; descuento: number };

export const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

/** Precio final (precio − descuento) para la entrega; si no hay precio para esa entrega usa el otro; null si no hay ninguno. */
export function precioFinal(s: ServicioPrecio, entrega: Entrega): number | null {
  const base = entrega === "IMPRESA" ? (s.precioImpreso ?? s.precioDigital) : (s.precioDigital ?? s.precioImpreso);
  return base === null ? null : Math.max(0, base - s.descuento);
}

export type TarifaEspecial = { precioImpreso: number | null; precioDigital: number | null };
/** Fechas como "YYYY-MM-DD" (día calendario en Bogotá), inclusivas en ambos extremos. */
export type ConvenioPrecio = {
  activo: boolean;
  descuentoGeneral: number | null;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  /** Tarifa del convenio para el servicio que se está cotizando, si existe. */
  tarifa?: TarifaEspecial | null;
};
export type OrigenPrecio = "DOCTOR" | "CONVENIO_TARIFA" | "CONVENIO_DESCUENTO" | "CATALOGO";

export const hoyBogota = (d = new Date()) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);

export function convenioVigente(c: Pick<ConvenioPrecio, "activo" | "vigenteDesde" | "vigenteHasta">, fecha: string) {
  return c.activo && (!c.vigenteDesde || fecha >= c.vigenteDesde) && (!c.vigenteHasta || fecha <= c.vigenteHasta);
}

/** Precio de una tarifa para la entrega (si falta, usa el de la otra entrega); null si no define ninguno. */
export function precioTarifa(t: TarifaEspecial | null | undefined, entrega: Entrega): number | null {
  if (!t) return null;
  const p = entrega === "IMPRESA" ? (t.precioImpreso ?? t.precioDigital) : (t.precioDigital ?? t.precioImpreso);
  return p === null ? null : Math.max(0, p);
}

/**
 * Prioridad: tarifa del doctor remitente > tarifa del convenio > descuento general del convenio sobre el
 * precio final del catálogo > precio del catálogo. Un convenio inactivo o fuera de vigencia se ignora por completo.
 */
export function resolverPrecio(a: {
  servicio: ServicioPrecio;
  entrega: Entrega;
  tarifaDoctor?: TarifaEspecial | null;
  convenio?: ConvenioPrecio | null;
  fecha: string;
}): { precio: number | null; origen: OrigenPrecio } {
  const doctor = precioTarifa(a.tarifaDoctor, a.entrega);
  if (doctor !== null) return { precio: doctor, origen: "DOCTOR" };
  const conv = a.convenio && convenioVigente(a.convenio, a.fecha) ? a.convenio : null;
  const delConvenio = precioTarifa(conv?.tarifa, a.entrega);
  if (delConvenio !== null) return { precio: delConvenio, origen: "CONVENIO_TARIFA" };
  const base = precioFinal(a.servicio, a.entrega);
  const pct = Math.min(100, Math.max(0, conv?.descuentoGeneral ?? 0));
  if (base !== null && pct > 0) return { precio: Math.max(0, Math.round(base * (1 - pct / 100))), origen: "CONVENIO_DESCUENTO" };
  return { precio: base, origen: "CATALOGO" };
}

/** Total de una orden: suma de los precios congelados (ya con descuento). */
export const totalOrden = (items: { precio: number }[]) => items.reduce((t, i) => t + i.precio, 0);

export const CATEGORIAS = [
  { valor: "ESTUDIO_2D", etiqueta: "Estudios 2D" },
  { valor: "TOMOGRAFIA", etiqueta: "Tomografías" },
  { valor: "PAQUETE", etiqueta: "Paquetes" },
  { valor: "ESCANEO", etiqueta: "Escaneos" },
  { valor: "OTRO", etiqueta: "Otros" },
] as const;
