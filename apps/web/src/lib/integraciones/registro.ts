import { crearDentalink } from "./dentalink.ts";
import { crearSimulado } from "./simulado.ts";
import type { Conector } from "./tipos.ts";

export const ADAPTADORES: Record<string, Conector> = {
  simulado: crearSimulado(),
  dentalink: crearDentalink(),
};

export const obtenerAdaptador = (clave: string): Conector | null => (Object.hasOwn(ADAPTADORES, clave) ? ADAPTADORES[clave]! : null);
