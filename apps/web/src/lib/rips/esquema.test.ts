import { describe, expect, it } from "vitest";
import { errorDiagnosticos, esquemaRips, permitidosParaRol } from "./esquema";

describe("esquemaRips y permisos", () => {
  it("normaliza y valida", () => {
    const r = esquemaRips.parse({ diagnosticoPrincipal: " k021 ", tipoUsuario: "", items: [{ id: "a", codigoCups: "870114", tipoRips: "PROCEDIMIENTO" }] });
    expect(r.diagnosticoPrincipal).toBe("K021");
    expect(r.tipoUsuario).toBeNull();
    expect(esquemaRips.safeParse({ diagnosticoPrincipal: "K02" }).success).toBe(false);
    expect(esquemaRips.safeParse({ items: [{ id: "a", codigoCups: "12", tipoRips: "CONSULTA" }] }).success).toBe(false);
  });
  it("recepción no guarda diagnóstico ni finalidad; especialista y admin sí", () => {
    const d = esquemaRips.parse({ tipoUsuario: "05", finalidad: "15", diagnosticoPrincipal: "K021", diagnosticosRelacionados: ["K053"], tipoDiagnostico: "01" });
    const rec = permitidosParaRol("recepcion", d);
    expect(rec).toEqual({ tipoUsuario: "05" });
    expect(permitidosParaRol("especialista", d)).toEqual(d);
    expect(permitidosParaRol("admin_tenant", d)).toEqual(d);
  });
  it("detecta diagnósticos repetidos", () => {
    expect(errorDiagnosticos("K021", ["K053", "K053"])).toMatch(/repetidos/);
    expect(errorDiagnosticos("K021", ["K021"])).toMatch(/principal/);
    expect(errorDiagnosticos("K021", ["K053"])).toBeNull();
  });
});
