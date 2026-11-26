// Cotización virtual (presupuestos): lógica pura, sin I/O, para poder probarla. Montos en pesos enteros (COP).
import { z } from "zod";
import { hoyBogota } from "./precios";

export const DIAS_VIGENCIA = 15;
export const MAX_DIAS_VIGENCIA = 90;
export const MAX_ITEMS = 60;
export const MAX_CANTIDAD = 99;
export const MAX_VALOR = 500_000_000; // por unidad
export const MAX_TOTAL = 2_000_000_000; // cabe holgado en un INT de Postgres
export const MAX_INTENTOS_CODIGO = 5;
export const COOKIE_PRESUPUESTO = "dv_presupuesto";
export const SESION_PRESUPUESTO_MS = 3 * 60 * 60 * 1000;
export const DIAS_GRACIA_ENLACE = 30; // tras vencer la cotización el enlace aún abre (solo para mostrar el aviso), nunca para aceptar
export const ROLES_PRESUPUESTOS = ["admin_tenant", "recepcion", "especialista"] as const;

// --- Estados ---
export type EstadoPres = "BORRADOR" | "ENVIADO" | "VISTO" | "ACEPTADO" | "RECHAZADO" | "VENCIDO" | "CONVERTIDO";
/** Lo que ve la gente: VENCIDA se deriva de la fecha; ANULADA es el VENCIDO que el centro dejó guardado a propósito. */
export type EstadoVisible = "BORRADOR" | "ENVIADO" | "VISTO" | "ACEPTADO" | "RECHAZADO" | "VENCIDA" | "ANULADA" | "CONVERTIDO";
export const ESTADOS_VISIBLES: readonly EstadoVisible[] = ["BORRADOR", "ENVIADO", "VISTO", "ACEPTADO", "RECHAZADO", "VENCIDA", "ANULADA", "CONVERTIDO"];
export const ETIQUETA_ESTADO: Record<EstadoVisible, string> = {
  BORRADOR: "Borrador", ENVIADO: "Enviada", VISTO: "Vista", ACEPTADO: "Aceptada", RECHAZADO: "Rechazada", VENCIDA: "Vencida", ANULADA: "Anulada", CONVERTIDO: "Convertida en orden",
};

const TRANSICIONES: Record<EstadoPres, readonly EstadoPres[]> = {
  BORRADOR: ["ENVIADO", "VENCIDO"],
  ENVIADO: ["VISTO", "ACEPTADO", "RECHAZADO", "VENCIDO"],
  VISTO: ["ACEPTADO", "RECHAZADO", "VENCIDO"],
  ACEPTADO: ["CONVERTIDO"],
  RECHAZADO: [], VENCIDO: [], CONVERTIDO: [],
};
export const transicionValida = (de: EstadoPres, a: EstadoPres) => TRANSICIONES[de].includes(a);

/** `validoHasta` es un día calendario de Bogotá, inclusivo: vence cuando `hoy` es posterior. */
export const diaIso = (d: Date) => d.toISOString().slice(0, 10);
export const estaVencida = (validoHasta: Date | null, ahora = new Date()) => !!validoHasta && hoyBogota(ahora) > diaIso(validoHasta);

export function estadoVisible(p: { estado: EstadoPres; validoHasta: Date | null }, ahora = new Date()): EstadoVisible {
  if (p.estado === "VENCIDO") return "ANULADA";
  if ((p.estado === "ENVIADO" || p.estado === "VISTO") && estaVencida(p.validoHasta, ahora)) return "VENCIDA";
  return p.estado;
}
export const esEditable = (p: { estado: EstadoPres }) => p.estado === "BORRADOR";
/** El paciente solo puede responder mientras la cotización está enviada/vista y vigente. */
export const admiteRespuesta = (p: { estado: EstadoPres; validoHasta: Date | null }, ahora = new Date()) =>
  (p.estado === "ENVIADO" || p.estado === "VISTO") && !estaVencida(p.validoHasta, ahora);
export const puedeReenviar = admiteRespuesta;
export const puedeAnular = (p: { estado: EstadoPres }) => transicionValida(p.estado, "VENCIDO");

/** Fecha (YYYY-MM-DD) a `dias` días de hoy en Bogotá. */
export function fechaVigencia(dias: number, ahora = new Date()) {
  const [a, m, d] = hoyBogota(ahora).split("-").map(Number) as [number, number, number];
  return diaIso(new Date(Date.UTC(a, m - 1, d + dias)));
}
export const aFechaDb = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** Último instante de la vigencia (hora de Bogotá). */
export const finDeVigencia = (validoHasta: Date) => new Date(`${diaIso(validoHasta)}T23:59:59-05:00`);
/** Hasta cuándo el enlace sirve para entrar y ver el aviso de vencida. */
export const venceEnlace = (validoHasta: Date) => new Date(finDeVigencia(validoHasta).getTime() + DIAS_GRACIA_ENLACE * 86_400_000);
export const venceSesionPresupuesto = (ahora: Date, validoHasta: Date) => new Date(Math.min(ahora.getTime() + SESION_PRESUPUESTO_MS, venceEnlace(validoHasta).getTime()));

/** El código solo se compara mientras el enlace esté activo y queden intentos. */
export function estadoCodigo(p: { estado: EstadoPres; validoHasta: Date | null; intentosCodigo: number }, ahora = new Date()): "ACTIVO" | "CERRADO" | "BLOQUEADO" {
  if (p.estado === "BORRADOR" || p.estado === "VENCIDO") return "CERRADO";
  if (p.validoHasta && venceEnlace(p.validoHasta) <= ahora) return "CERRADO";
  return p.intentosCodigo >= MAX_INTENTOS_CODIGO ? "BLOQUEADO" : "ACTIVO";
}

export const numeroPresupuesto = (n: number) => `P-${String(n).padStart(4, "0")}`;

// --- Totales ---
export type LineaEntrada = { cantidad: number; valorUnitario: number; descuento: number; costoUnitario?: number };
export type DescuentoGlobal = { tipo: "PORCENTAJE" | "VALOR"; valor: number } | null | undefined;
export const bruto = (l: Pick<LineaEntrada, "cantidad" | "valorUnitario">) => l.cantidad * l.valorUnitario;
export const lineaNeta = (l: LineaEntrada) => Math.max(0, bruto(l) - l.descuento);

/**
 * Totales siempre calculados aquí: el descuento de cada ítem se limita a su valor, y el descuento global (porcentaje o valor)
 * se reparte entre los ítems en proporción a lo que valen (resto por mayor fracción) y queda guardado en el `descuento` de cada uno.
 */
export function calcularTotales<T extends LineaEntrada>(items: T[], global?: DescuentoGlobal) {
  const base = items.map((i) => ({ ...i, descuento: Math.min(Math.max(0, Math.round(i.descuento)), bruto(i)) }));
  const subtotal = base.reduce((t, i) => t + bruto(i), 0);
  const descuentoItems = base.reduce((t, i) => t + i.descuento, 0);
  const netos = base.map(lineaNeta);
  const sumaNeta = netos.reduce((t, n) => t + n, 0);
  const pedido = !global ? 0 : global.tipo === "PORCENTAJE" ? Math.round((sumaNeta * Math.min(100, Math.max(0, global.valor))) / 100) : Math.max(0, Math.round(global.valor));
  const descuentoGlobal = Math.min(pedido, sumaNeta);
  const partes = netos.map((n, idx) => {
    const exacto = sumaNeta === 0 ? 0 : (descuentoGlobal * n) / sumaNeta;
    return { idx, piso: Math.floor(exacto), frac: exacto - Math.floor(exacto), tope: n };
  });
  let resto = descuentoGlobal - partes.reduce((t, p) => t + p.piso, 0);
  for (const p of [...partes].sort((a, b) => b.frac - a.frac || a.idx - b.idx)) {
    if (resto <= 0) break;
    if (p.piso < p.tope) { p.piso++; resto--; }
  }
  const finales = base.map((i, idx) => ({ ...i, descuento: i.descuento + partes[idx]!.piso }));
  const total = finales.reduce((t, i) => t + lineaNeta(i), 0);
  const costo = finales.reduce((t, i) => t + i.cantidad * (i.costoUnitario ?? 0), 0);
  const utilidad = total - costo;
  // Margen sobre costo (markup), como `Presupuesto.margen`; sin costo no hay margen que mostrar.
  const margenPct = costo > 0 ? Math.round((utilidad / costo) * 10_000) / 100 : null;
  return { items: finales, subtotal, descuentoItems, descuentoGlobal, descuento: descuentoItems + descuentoGlobal, total, costo, utilidad, margenPct };
}

/** Total de una cotización ya guardada (los descuentos ya están dentro de cada ítem). */
export const totalGuardado = (items: { cantidad: number; valorUnitario: number; descuento: number }[]) => items.reduce((t, i) => t + lineaNeta(i), 0);
export const precioSugerido = (costo: number, margenPct: number) => Math.round(costo * (1 + margenPct / 100));

// --- Validación (trust boundary) ---
const FDI = new Set([
  ...[1, 2, 3, 4].flatMap((c) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => c * 10 + n)),
  ...[5, 6, 7, 8].flatMap((c) => [1, 2, 3, 4, 5].map((n) => c * 10 + n)),
]);
export const esDienteFdi = (n: number) => FDI.has(n);
const texto = (max: number) => z.string().trim().max(max);
const entero = (min: number, max: number) => z.number().int().min(min).max(max);

export const esquemaItem = z.strictObject({
  servicioId: z.string().min(1).max(40).nullish(),
  descripcion: texto(200).default(""),
  cantidad: entero(1, MAX_CANTIDAD),
  /** Solo cuenta en ítems libres: en los del catálogo el precio lo resuelve el servidor. */
  valorUnitario: entero(0, MAX_VALOR).default(0),
  descuento: entero(0, MAX_VALOR).default(0),
  fase: entero(1, 12).default(1),
  diente: z.number().int().refine(esDienteFdi, "Diente no válido (numeración FDI)").nullish(),
  /** Solo lo toma el servidor si quien guarda es administrador. */
  costoUnitario: entero(0, MAX_VALOR).default(0),
}).refine((i) => !!i.servicioId || i.descripcion.length >= 2, { message: "Describe el ítem libre", path: ["descripcion"] });

export const esquemaPresupuesto = z.strictObject({
  pacienteId: z.string().min(1).max(40).nullish(),
  leadId: z.string().min(1).max(40).nullish(),
  valoracionId: z.string().min(1).max(40).nullish(),
  tipoDocumento: z.enum(["CC", "TI", "CE", "PA", "RC"]).nullish(),
  numeroDocumento: z.string().trim().max(20).nullish(),
  titulo: texto(120).optional(),
  notas: texto(2000).optional(),
  validoHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de vigencia inválida"),
  convenioId: z.string().min(1).max(40).nullish(),
  descuentoGlobal: z.strictObject({ tipo: z.enum(["PORCENTAJE", "VALOR"]), valor: z.number().min(0).max(MAX_TOTAL) }).nullish(),
  items: z.array(esquemaItem).min(1, "Agrega al menos un ítem").max(MAX_ITEMS, `Máximo ${MAX_ITEMS} ítems`),
});
export type EntradaPresupuesto = z.input<typeof esquemaPresupuesto>;

/** La vigencia debe ser futura (o hoy) y no pasar de MAX_DIAS_VIGENCIA. */
export function vigenciaValida(iso: string, ahora = new Date()) {
  if (iso < hoyBogota(ahora)) return "La vigencia no puede estar en el pasado";
  if (iso > fechaVigencia(MAX_DIAS_VIGENCIA, ahora)) return `La vigencia máxima es de ${MAX_DIAS_VIGENCIA} días`;
  return null;
}

// --- Mapeo valoración -> borrador ---
/** Datos con los que se precarga una cotización desde una valoración completada. Lo clínico (tratamiento sugerido) solo se copia si quien crea puede verlo. */
export function borradorDeValoracion(v: { nombre: string; presupuestoEstimado: number | null; tratamientoSugerido: string | null }, puedeVerClinico: boolean) {
  const lineas = [
    v.presupuestoEstimado !== null ? `Presupuesto estimado en la valoración virtual: ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v.presupuestoEstimado)}.` : null,
    puedeVerClinico && v.tratamientoSugerido ? `Tratamiento sugerido: ${v.tratamientoSugerido}` : null,
  ].filter(Boolean);
  return { titulo: `Cotización de ${v.nombre}`.slice(0, 120), notas: lineas.join("\n").slice(0, 2000) };
}

// --- Aceptación ---
export const TEXTO_ACEPTACION_VERSION = "2026-11-v1";
/**
 * Texto que firma el paciente. PENDIENTE DE VALIDACIÓN LEGAL (abogado): alcance de la aceptación electrónica (Ley 527 de 1999),
 * valor probatorio de nombre + documento + IP truncada y redacción de "valores estimados".
 */
export function textoAceptacion(a: { numero: number; total: number; validoHasta: Date; centro: string }) {
  const valor = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(a.total);
  const hasta = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", dateStyle: "long" }).format(a.validoHasta);
  return `Acepto la cotización N° ${numeroPresupuesto(a.numero)} de ${a.centro} por ${valor}, vigente hasta el ${hasta}. Entiendo que los valores son estimados y están sujetos a la valoración presencial del odontólogo, y que aceptar esta cotización no es un pago ni obliga a iniciar el tratamiento.`;
}

export const esquemaAceptacion = z.strictObject({
  nombre: z.string().trim().min(5, "Escribe tu nombre completo").max(120).refine((s) => /\s/.test(s), "Escribe tu nombre completo"),
  documento: z.string().trim().min(4, "Escribe tu número de documento").max(20).regex(/^[A-Za-z0-9.\- ]+$/, "El documento solo lleva letras y números"),
  acepto: z.literal(true, { error: "Marca la casilla para aceptar" }),
});
export const esquemaRechazo = z.strictObject({ motivo: texto(500).optional() });
export const esquemaPregunta = z.strictObject({ texto: z.string().trim().min(3, "Escribe tu pregunta").max(1000) });

// --- Conversión en orden ---
export type ItemConvertible = { servicioId: string | null; descripcion: string; cantidad: number; valorUnitario: number; descuento: number };
/** Separa lo que viaja a la orden (catálogo) de lo que queda como nota (ítems libres). */
export function partirParaOrden<T extends ItemConvertible>(items: T[]) {
  return { catalogo: items.filter((i) => !!i.servicioId), libres: items.filter((i) => !i.servicioId) };
}
/** Servicios de la orden: una línea por unidad (la orden no maneja cantidad). */
export const serviciosParaOrden = (items: { servicioId: string | null; cantidad: number }[]) =>
  items.flatMap((i) => (i.servicioId ? Array.from({ length: i.cantidad }, () => ({ servicioId: i.servicioId! })) : []));
export function notaLibres(libres: { descripcion: string; cantidad: number }[], numero: number) {
  return libres.length ? `Cotización ${numeroPresupuesto(numero)}, ítems fuera del catálogo: ${libres.map((l) => `${l.cantidad} × ${l.descripcion}`).join("; ")}`.slice(0, 2000) : "";
}

// --- Tablero ---
export const DIAS_POR_VENCER = 7;
export const esEstadoVisible = (v: unknown): v is EstadoVisible => ESTADOS_VISIBLES.includes(v as EstadoVisible);
/** Filtro por estado visible; `hoy` es el día calendario de Bogotá como fecha UTC (como se guarda `validoHasta`). VENCIDA se deriva de la fecha. */
export function filtroEstado(e: EstadoVisible, hoy: Date): { estado?: EstadoPres | { in: EstadoPres[] }; validoHasta?: { gte: Date } | { lt: Date } } {
  switch (e) {
    case "ANULADA": return { estado: "VENCIDO" };
    case "VENCIDA": return { estado: { in: ["ENVIADO", "VISTO"] }, validoHasta: { lt: hoy } };
    case "ENVIADO": case "VISTO": return { estado: e, validoHasta: { gte: hoy } };
    default: return { estado: e };
  }
}
export type FilaResumen = { estado: EstadoPres; validoHasta: Date | null; enviadoEn: Date | null; vistoEn: Date | null; aceptadoEn: Date | null; total: number };
/** KPI del tablero sobre las cotizaciones del periodo: enviadas, vistas, aceptadas, tasa, valor en juego (enviadas/vistas vigentes) y por vencer. */
export function resumenPresupuestos(filas: FilaResumen[], ahora = new Date()) {
  const enviadas = filas.filter((f) => f.enviadoEn);
  const vigentes = filas.filter((f) => admiteRespuesta(f, ahora));
  const aceptadas = filas.filter((f) => f.aceptadoEn).length;
  const limite = fechaVigencia(DIAS_POR_VENCER, ahora);
  return {
    enviadas: enviadas.length,
    vistas: filas.filter((f) => f.vistoEn).length,
    aceptadas,
    tasaAceptacion: enviadas.length ? Math.round((aceptadas / enviadas.length) * 1000) / 10 : null,
    valorEnJuego: vigentes.reduce((t, f) => t + f.total, 0),
    porVencer: vigentes.filter((f) => f.validoHasta && diaIso(f.validoHasta) <= limite).length,
    convertidas: filas.filter((f) => f.estado === "CONVERTIDO").length,
  };
}
