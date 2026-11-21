import { describe, expect, it } from "vitest";
import { construirWhere, filtroDoctor, filtroVisibles, leerFiltros } from "./pacientes-filtro";

const ORG = "org1";
const vacio = leerFiltros({});

describe("leerFiltros", () => {
  it("normaliza parámetros inválidos", () => {
    const f = leerFiltros({ desde: "2026-13-99x", hasta: "2026-11-20", orden: "hack", pendientes: "1", q: [" ana ", "b"] });
    expect(f).toMatchObject({ desde: "", hasta: "2026-11-20", orden: "nombre", pendientes: true, cartera: false, q: "ana" });
  });
});

describe("filtroVisibles", () => {
  it("el centro completo para el personal", () => expect(filtroVisibles(ORG, "u1", "recepcion")).toEqual({ organizationId: ORG }));
  it("el doctor remitente solo ve pacientes que remitió (orden o estudio), dentro del centro", () => {
    expect(filtroVisibles(ORG, "doc1", "doctor_remitente")).toEqual({ organizationId: ORG, ...filtroDoctor(ORG, "doc1") });
    expect(filtroDoctor(ORG, "doc1").OR).toEqual([
      { ordenes: { some: { organizationId: ORG, doctorRemitenteId: "doc1" } } },
      { estudios: { some: { organizationId: ORG, doctorRemitenteId: "doc1" } } },
      { doctores: { some: { organizationId: ORG, doctorId: "doc1" } } },
    ]);
  });
});

describe("construirWhere", () => {
  it("el personal filtra por doctor X", () => {
    const w = construirWhere(ORG, { id: "u1", rol: "admin_tenant" }, { ...vacio, doctor: "docX" });
    expect(w.AND).toContainEqual(filtroDoctor(ORG, "docX"));
  });
  it("el doctor remitente no puede ver los de otro doctor con ?doctor=", () => {
    const w = construirWhere(ORG, { id: "doc1", rol: "doctor_remitente" }, { ...vacio, doctor: "docX" });
    expect(JSON.stringify(w)).not.toContain("docX");
    expect(JSON.stringify(w)).toContain("doc1");
  });
  it("una documento de más de 10 dígitos no se usa como número de orden (overflow INT)", () => {
    const w = JSON.stringify(construirWhere(ORG, { id: "u1", rol: "recepcion" }, { ...vacio, q: "9876543210123" }));
    expect(w).toContain("numeroDocumento");
    expect(w).not.toContain('"numero"');
  });
  it("un número corto también busca por orden", () => {
    expect(JSON.stringify(construirWhere(ORG, { id: "u1", rol: "recepcion" }, { ...vacio, q: "#12" }))).toContain('"numero":12');
  });
  it("rango de último estudio: uno dentro del rango y ninguno posterior", () => {
    const w = construirWhere(ORG, { id: "u1", rol: "recepcion" }, { ...vacio, desde: "2026-01-01", hasta: "2026-06-30" });
    expect(w.AND).toHaveLength(3);
    expect(JSON.stringify(w)).toContain('"none"');
  });
  it("filtra por especialidad (perfil del doctor o relación manual), dentro del centro", () => {
    const w = JSON.stringify(construirWhere(ORG, { id: "u1", rol: "recepcion" }, { ...vacio, especialidad: "ortod" }));
    expect(w).toContain("perfilDoctor");
    expect(w).toContain('"doctores":{"some":{"organizationId":"org1","especialidad"');
  });
  it("todo acotado por centro", () => {
    const w = JSON.stringify(construirWhere(ORG, { id: "u1", rol: "recepcion" }, { ...vacio, pendientes: true, cartera: true }));
    expect(w.match(/"organizationId":"org1"/g)!.length).toBeGreaterThanOrEqual(3);
  });
});
