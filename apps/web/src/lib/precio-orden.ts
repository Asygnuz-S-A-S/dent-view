// Desglose de precios de una orden (la "ventanita"): puro y sin I/O. Los precios cobrados son los congelados al crear la orden.
import { precioFinal, resolverPrecio, totalOrden, type Entrega, type OrigenPrecio } from "./precios";
import type { ConvenioOpcion, TarifasDoctor } from "./precios-datos";

export const ORIGEN: Record<OrigenPrecio, string> = {
  DOCTOR: "Tarifa del doctor", CONVENIO_TARIFA: "Tarifa del convenio", CONVENIO_DESCUENTO: "Descuento del convenio", CATALOGO: "Catálogo",
};
export const ORIGEN_CONGELADO = "Congelado al crear la orden";

type Servicio = { id: string; precioImpreso: number | null; precioDigital: number | null; descuento: number };
type Item = { id: string; servicioId: string | null; nombre: string; opciones: string | null; precio: number };

export function desglosarPrecios(a: { items: Item[]; servicios: Servicio[]; entrega: Entrega; convenio: ConvenioOpcion | null; tarifasDoctor: TarifasDoctor; doctorId: string | null; fecha: string }) {
  const porId = new Map(a.servicios.map((s) => [s.id, s]));
  const filas = a.items.map((i) => {
    const s = i.servicioId ? porId.get(i.servicioId) : undefined;
    const catalogo = s ? precioFinal(s, a.entrega) : null;
    const hoy = s
      ? resolverPrecio({ servicio: s, entrega: a.entrega, tarifaDoctor: a.doctorId ? a.tarifasDoctor[a.doctorId]?.[s.id] : null, convenio: a.convenio && { ...a.convenio, tarifa: a.convenio.tarifas[s.id] }, fecha: a.fecha })
      : null;
    // Si la tarifa vigente hoy ya no coincide con lo cobrado, se dice: el precio de la orden está congelado.
    const origen = hoy && hoy.precio === i.precio ? ORIGEN[hoy.origen] : ORIGEN_CONGELADO;
    return { ...i, catalogo, origen, descuento: catalogo !== null ? Math.max(0, catalogo - i.precio) : 0 };
  });
  return { filas, total: totalOrden(a.items), descuentoTotal: filas.reduce((t, f) => t + f.descuento, 0) };
}
