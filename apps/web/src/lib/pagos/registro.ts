import { bold } from "./bold";
import { epayco } from "./epayco";
import { mercadopago } from "./mercadopago";
import { payu } from "./payu";
import { simulacionActiva, type ClaveProveedor, type Modo, type ProveedorPago } from "./proveedor";
import { wompi } from "./wompi";

export const ADAPTADORES: Record<ClaveProveedor, ProveedorPago> = { WOMPI: wompi, MERCADOPAGO: mercadopago, BOLD: bold, PAYU: payu, EPAYCO: epayco };

export const esProveedor = (v: string): v is ClaveProveedor => Object.hasOwn(ADAPTADORES, v);
export const slugProveedor = (c: ClaveProveedor) => c.toLowerCase();
export const proveedorDeSlug = (s: string) => (esProveedor(s.toUpperCase()) ? (s.toUpperCase() as ClaveProveedor) : null);

const urlBase = () => process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/**
 * Proveedor listo para usar. Con PAGOS_SIMULADO=1 (solo desarrollo) y modo SANDBOX se sustituyen las llamadas salientes
 * (crear link, consultar, probar) por respuestas locales; la verificación de firmas y el mapeo de eventos siguen siendo los reales.
 */
export function obtenerProveedor(clave: ClaveProveedor, modo: Modo): ProveedorPago {
  const real = ADAPTADORES[clave];
  if (!simulacionActiva(modo)) return real;
  return {
    ...real,
    async crearLink(_l, _m, e) {
      const id = `SIM-${e.referencia}`;
      return { idExterno: id, urlPago: `${urlBase()}/pago-simulado/${id}`, expiraEn: e.expiraEn };
    },
    consultarEstado: async () => ({ estado: "PENDIENTE", monto: null, moneda: null, idTransaccion: null }),
    probarConexion: async () => ({ ok: true, mensaje: "Conexión simulada (PAGOS_SIMULADO activo)" }),
  };
}
