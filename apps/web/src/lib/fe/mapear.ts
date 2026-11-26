// Mapeadores puros: datos de dent-view -> documentos FE. Sin acceso a la base (los datos los carga servicio.ts).
import { digitoVerificacionNit, MEDIO_PAGO_DIAN, tipoDocumentoDian } from "./dian";
import type { AdquirenteFE, EmisorFE, FacturaFE, LineaFE, MedioPagoFE, NotaFE, SaludFE } from "./proveedor";

/** Error de datos del centro/paciente: el mensaje se muestra tal cual al usuario. */
export class ErrorMapeo extends Error {}

export type TratamientoIva = "EXCLUIDO" | "IVA_19";
export type ConfigMapeo = {
  nit: string | null; dv: string | null; razonSocial: string | null; nombreComercial: string | null; regimen: string | null; responsabilidadFiscal: string | null;
  codigoPrestador: string | null; prefijoFactura: string | null; modalidadDefecto: string | null; generaRips: boolean;
  /** Valor por defecto 'EXCLUIDO' (servicios de salud sin IVA): lo debe validar el contador. */
  tratamientoIva?: TratamientoIva;
};
export type EntradaFactura = {
  numero: number; fecha: Date; vence: Date | null; notas: string | null;
  paciente: { nombre: string; tipoDocumento: string; numeroDocumento: string; correo: string | null; direccion: string | null; celular: string | null } | null;
  convenio: { nombre: string; nit: string | null; nitPagador: string | null; cucon: string | null; coberturaPlan: string | null } | null;
  items: { descripcion: string; cantidad: number; valorUnitario: number; descuento: number; servicioId: string | null; codigoCups: string | null }[];
  pagos: { valor: number; medio: string; fecha: Date; anuladoEn: Date | null }[];
  total: number; estado: string;
};

const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
export const numeroFacturaFE = (n: number) => `FC-${String(n).padStart(4, "0")}`;
export const numeroNotaFE = (n: number) => `NC-${String(n).padStart(4, "0")}`;

export function mapearEmisor(c: ConfigMapeo): EmisorFE {
  if (!c.nit || !c.razonSocial) throw new ErrorMapeo("Faltan el NIT y la razón social del facturador (Integraciones > Facturación electrónica)");
  const dv = digitoVerificacionNit(c.nit);
  if (!dv || (c.dv && c.dv !== dv)) throw new ErrorMapeo("El NIT o su dígito de verificación no son válidos");
  return { nit: c.nit.replace(/\D/g, ""), dv, razonSocial: c.razonSocial, nombreComercial: c.nombreComercial, regimen: c.regimen, responsabilidadFiscal: c.responsabilidadFiscal };
}

export function mapearAdquirente(p: EntradaFactura["paciente"], convenio: EntradaFactura["convenio"]): AdquirenteFE {
  const nit = convenio ? (convenio.nitPagador || convenio.nit || "").replace(/[.\s-]/g, "") : "";
  if (convenio && nit) {
    const dv = digitoVerificacionNit(nit);
    if (!dv) throw new ErrorMapeo(`El NIT del convenio «${convenio.nombre}» no es válido`);
    return { tipoPersona: "JURIDICA", tipoDocumento: "31", numeroDocumento: nit, dv, nombre: convenio.nombre, correo: null, direccion: null, celular: null };
  }
  if (!p) throw new ErrorMapeo("La cuenta no tiene paciente ni convenio con NIT: no hay a quién facturar");
  const tipo = tipoDocumentoDian(p.tipoDocumento);
  if (!tipo) throw new ErrorMapeo(`El tipo de documento «${p.tipoDocumento}» del paciente no tiene equivalente DIAN`);
  const doc = p.numeroDocumento.replace(/[.\s-]/g, "");
  if (!doc) throw new ErrorMapeo("El paciente no tiene número de documento");
  return { tipoPersona: tipo === "31" ? "JURIDICA" : "NATURAL", tipoDocumento: tipo, numeroDocumento: doc, dv: tipo === "31" ? digitoVerificacionNit(doc) : null, nombre: p.nombre, correo: p.correo, direccion: p.direccion, celular: p.celular };
}

function linea(i: { descripcion: string; cantidad: number; valorUnitario: number; descuento?: number; servicioId?: string | null; codigoCups?: string | null }, iva: TratamientoIva): LineaFE {
  const descuento = i.descuento ?? 0;
  return {
    descripcion: i.descripcion, cantidad: i.cantidad, valorUnitario: i.valorUnitario, descuento, total: i.cantidad * i.valorUnitario - descuento,
    codigoCups: i.codigoCups ?? null, servicioId: i.servicioId ?? null, impuesto: iva === "IVA_19" ? { tipo: "IVA", tarifa: 19 } : { tipo: "EXCLUIDO", tarifa: 0 },
  };
}
/** Con IVA el valor de la cuenta se toma como base gravable (no incluido): el total FE = subtotal + IVA. TODO: validar con el contador antes de activar IVA. */
const totales = (lineas: LineaFE[]) => {
  const subtotal = lineas.reduce((t, l) => t + l.total, 0);
  const impuestos = lineas.reduce((t, l) => t + Math.round((l.total * l.impuesto.tarifa) / 100), 0);
  return { subtotal, impuestos, total: subtotal + impuestos };
};

export function mapearFactura(f: EntradaFactura, c: ConfigMapeo): FacturaFE {
  const iva = c.tratamientoIva ?? "EXCLUIDO";
  const emisor = mapearEmisor(c);
  const adquirente = mapearAdquirente(f.paciente, f.convenio);
  if (f.items.length === 0) throw new ErrorMapeo("La cuenta no tiene ítems");
  const lineas = f.items.map((i) => linea(i, iva));
  const t = totales(lineas);
  const vigentes = f.pagos.filter((p) => !p.anuladoEn);
  const anticipos = vigentes.filter((p) => p.medio === "ANTICIPO").reduce((s, p) => s + p.valor, 0);
  const mediosPago: MedioPagoFE[] = vigentes.map((p) => ({ codigoDian: MEDIO_PAGO_DIAN[p.medio] ?? "1", valor: p.valor, fecha: dia(p.fecha) }));
  const salud: SaludFE | null = c.generaRips
    ? {
        codigoPrestador: c.codigoPrestador ?? "", modalidadPago: c.modalidadDefecto,
        coberturaPlanBeneficios: f.convenio?.coberturaPlan || "15", // 15 = Particular
        numeroContrato: f.convenio?.cucon ?? null,
        copago: 0, cuotaModeradora: 0, // TODO: dent-view no registra copago ni cuota moderadora todavía
        anticipo: anticipos,
      }
    : null;
  if (salud && !/^\d{12}$/.test(salud.codigoPrestador)) throw new ErrorMapeo("El código de prestador debe tener 12 dígitos (Integraciones > Facturación electrónica)");
  return {
    referencia: numeroFacturaFE(f.numero), fecha: dia(f.fecha), prefijo: c.prefijoFactura, formaPago: f.estado === "PAGADA" ? "CONTADO" : "CREDITO", vence: f.vence ? dia(f.vence) : null,
    emisor, adquirente, lineas, mediosPago, anticipos, ...t, observaciones: f.notas, salud,
  };
}

export type EntradaNota = { consecutivo: number; fecha: Date; valor: number; motivo: string; totalOrigen: number };
/** 2 = anulación de la factura electrónica (nota por el total); 1 = devolución/no aceptación parcial. */
export function mapearNotaCredito(n: EntradaNota, origen: { idExterno: string | null; numeroDian: string | null; cufe: string | null; fecha: Date }, f: EntradaFactura, c: ConfigMapeo): NotaFE {
  if (!origen.cufe) throw new ErrorMapeo("La factura de origen no tiene CUFE: debe estar aceptada por la DIAN");
  const iva = c.tratamientoIva ?? "EXCLUIDO";
  const lineas = [linea({ descripcion: `Nota crédito: ${n.motivo}`.slice(0, 200), cantidad: 1, valorUnitario: n.valor }, iva)];
  return {
    referencia: numeroNotaFE(n.consecutivo), fecha: dia(n.fecha), motivoDian: n.valor >= n.totalOrigen ? "2" : "1", motivo: n.motivo,
    emisor: mapearEmisor(c), adquirente: mapearAdquirente(f.paciente, f.convenio),
    origen: { idExterno: origen.idExterno, numeroDian: origen.numeroDian, cufe: origen.cufe, fecha: dia(origen.fecha) }, lineas, ...totales(lineas),
  };
}
