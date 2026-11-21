// Formato de montos COP para campos de entrada: se guarda solo dígitos y se muestra con separador de miles.
export { cop } from "./precios";

/** "180.000" → "180000"; ignora todo lo que no sea dígito. */
export const soloDigitos = (s: string) => s.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

/** "180000" → "180.000". */
export const conMiles = (digitos: string) => (digitos ? new Intl.NumberFormat("es-CO").format(Number(digitos)) : "");

/** Valor numérico del texto del campo (0 si está vacío). */
export const parsearCop = (s: string) => Number(soloDigitos(s)) || 0;
