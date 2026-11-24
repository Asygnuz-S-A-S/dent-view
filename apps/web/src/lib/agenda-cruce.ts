/** Violación de la restricción de no cruce de la BD (SQLSTATE 23P01): se informa como cualquier otro cruce. */
export function esCruceDeCitas(e: unknown): boolean {
  const txt = [e instanceof Error ? e.message : "", String((e as { code?: unknown })?.code ?? ""), JSON.stringify((e as { meta?: unknown })?.meta ?? "")].join(" ");
  return /23P01|exclusion constraint|Cita_sin_cruce_/i.test(txt);
}
