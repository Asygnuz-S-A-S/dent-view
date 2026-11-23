/** Cambio entre un periodo y el anterior. `pct` es null si el anterior fue 0 (no hay base para un porcentaje). */
export function variacion(actual: number, anterior: number) {
  const dif = actual - anterior;
  const pct = anterior === 0 ? null : Math.round((dif / anterior) * 100);
  return { dif, pct, sentido: dif > 0 ? "sube" : dif < 0 ? "baja" : "igual" } as const;
}

/** Frase corta para lectores de pantalla y pies de gráfica: "3 más que el periodo anterior". */
export function fraseVariacion(actual: number, anterior: number, unidad = "", periodo = "el periodo anterior", fmt = (n: number) => String(n)) {
  const v = variacion(actual, anterior);
  if (v.sentido === "igual") return `Igual que ${periodo}`;
  return `${fmt(Math.abs(v.dif))}${unidad ? ` ${unidad}` : ""} ${v.sentido === "sube" ? "más" : "menos"} que ${periodo}`;
}
