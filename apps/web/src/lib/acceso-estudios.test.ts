import { describe, expect, it } from "vitest";
import { diaUtc, filtroListadoEstudios } from "./acceso-estudios";

const base = { organizationId: "o1", doctorRemitenteId: "yo" };

describe("filtroListadoEstudios", () => {
  it("siempre conserva el filtro de acceso como primer AND", () => {
    const w = filtroListadoEstudios(base, { doctor: "otro", estado: "PUBLICADO" });
    expect((w.AND as unknown[])[0]).toEqual(base);
    expect(w).not.toHaveProperty("doctorRemitenteId");
  });
  it("ignora estado inválido y fechas mal formadas", () => {
    expect(filtroListadoEstudios(base, { estado: "X", desde: "2026-13-40", hasta: "hoy" }).AND).toEqual([base]);
  });
  it("hasta es inclusivo (exclusivo al día siguiente)", () => {
    const w = filtroListadoEstudios(base, { desde: "2026-03-01", hasta: "2026-03-31" });
    expect((w.AND as { fechaEstudio?: unknown }[])[1]).toEqual({ fechaEstudio: { gte: new Date("2026-03-01T00:00:00Z"), lt: new Date("2026-04-01T00:00:00Z") } });
  });
  it("la pestaña por-asignar equivale al estado", () => {
    expect(filtroListadoEstudios(base, { tab: "por-asignar" }).AND).toContainEqual({ estado: "POR_ASIGNAR" });
  });
  it("diaUtc rechaza fechas imposibles", () => expect(diaUtc("2026-02-30")).toBeNull());
});
