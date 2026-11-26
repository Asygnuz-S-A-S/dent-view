// Registro de proveedores de facturación electrónica. Agregar uno = importar su archivo y sumarlo a la lista.
import { siigo } from "./proveedores/siigo";
import { simulado } from "./proveedores/simulado";
import { simuladoPermitido, type ProveedorFacturacionElectronica } from "./proveedor";

const LISTA: ProveedorFacturacionElectronica[] = [simulado, siigo];

/** Registro vivo (las pruebas pueden agregar un proveedor falso con registrar()). */
const ADAPTADORES = new Map<string, ProveedorFacturacionElectronica>(LISTA.map((p) => [p.clave, p]));
export const registrar = (p: ProveedorFacturacionElectronica) => void ADAPTADORES.set(p.clave, p);
export const quitar = (clave: string) => void ADAPTADORES.delete(clave);

const permitido = (p: ProveedorFacturacionElectronica) => !p.soloLocal || simuladoPermitido();
/** Proveedores que el centro puede ver y conectar (el simulado solo en localhost). */
export const proveedoresDisponibles = () => [...ADAPTADORES.values()].filter(permitido);
export const obtenerProveedor = (clave: string) => {
  const p = ADAPTADORES.get(clave);
  return p && permitido(p) ? p : null;
};
export const slugProveedor = (c: string) => c.toLowerCase();
export const proveedorDeSlug = (s: string) => proveedoresDisponibles().find((p) => p.clave.toLowerCase() === s.toLowerCase()) ?? null;
