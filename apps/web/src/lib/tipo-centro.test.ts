import { describe, expect, it, vi } from "vitest";
import { etiquetaModulo, moduloDeRuta, moduloHabilitado, MODULOS, rutaBloqueada } from "./tipo-centro";

const findUnique = vi.fn();
vi.mock("@dent-view/db", () => ({ prisma: { configCentro: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
vi.mock("react", () => ({ cache: <T,>(f: T) => f }));

describe("matriz de módulos", () => {
  it("radiológico: flujo completo sin laboratorio; seguimiento de doctores solo aquí", () => {
    const SIN = ["laboratorio", "valoraciones", "crm"]; // exclusivos de odontología
    for (const m of SIN) expect(moduloHabilitado("CENTRO_RADIOLOGICO", m as never)).toBe(false);
    for (const m of MODULOS.filter((m) => !SIN.includes(m))) expect(moduloHabilitado("CENTRO_RADIOLOGICO", m)).toBe(true);
    for (const t of ["CENTRO_ODONTOLOGICO", "CLINICA_ODONTOLOGICA", "ODONTOLOGO_PARTICULAR"] as const) {
      expect(moduloHabilitado(t, "seguimiento-doctores")).toBe(false);
      expect(moduloHabilitado(t, "valoraciones")).toBe(true);
      expect(moduloHabilitado(t, "crm")).toBe(true);
    }
  });
  it("odontológico y clínica: laboratorio y cartera sí; ingesta y convenios no", () => {
    for (const t of ["CENTRO_ODONTOLOGICO", "CLINICA_ODONTOLOGICA"] as const) {
      expect(moduloHabilitado(t, "laboratorio")).toBe(true);
      expect(moduloHabilitado(t, "cartera")).toBe(true);
      expect(moduloHabilitado(t, "ingesta")).toBe(false);
      expect(moduloHabilitado(t, "convenios")).toBe(false);
    }
  });
  it("particular: sin usuarios múltiples, doctores ni cartera; con pacientes, agenda y estudios", () => {
    for (const m of ["usuarios", "doctores", "cartera", "reportes"] as const) expect(moduloHabilitado("ODONTOLOGO_PARTICULAR", m)).toBe(false);
    for (const m of ["pacientes", "agenda", "estudios", "facturacion"] as const) expect(moduloHabilitado("ODONTOLOGO_PARTICULAR", m)).toBe(true);
  });
  it("etiqueta de doctores según tipo", () => {
    expect(etiquetaModulo("CENTRO_RADIOLOGICO", "doctores", "Doctores remitentes")).toBe("Doctores remitentes");
    expect(etiquetaModulo("CLINICA_ODONTOLOGICA", "doctores", "Doctores remitentes")).toBe("Odontólogos");
    expect(etiquetaModulo("CLINICA_ODONTOLOGICA", "pacientes", "Pacientes")).toBe("Pacientes");
  });
});

describe("moduloDeRuta / rutaBloqueada", () => {
  it("usa el prefijo más específico", () => {
    expect(moduloDeRuta("/seguimiento-doctores")).toBe("seguimiento-doctores");
    expect(moduloDeRuta("/seguimiento-doctores/abc")).toBe("seguimiento-doctores");
    expect(moduloDeRuta("/seguimiento")).toBe("seguimiento");
    expect(moduloDeRuta("/integraciones/pasarelas/")).toBe("pasarelas");
    expect(moduloDeRuta("/integraciones/api")).toBe("integraciones");
  });
  it("no confunde prefijos parciales ni rutas libres", () => {
    expect(moduloDeRuta("/pacientesx")).toBeNull();
    expect(moduloDeRuta("/perfil")).toBeNull();
    expect(moduloDeRuta("/plataforma")).toBeNull();
    expect(moduloDeRuta("/entrega/x")).toBeNull();
  });
  it("bloquea rutas de módulos deshabilitados", () => {
    expect(rutaBloqueada("CENTRO_ODONTOLOGICO", "/seguimiento-doctores")).toBe(true);
    expect(rutaBloqueada("CENTRO_RADIOLOGICO", "/laboratorio/1")).toBe(true);
    expect(rutaBloqueada("CENTRO_RADIOLOGICO", "/estudios")).toBe(false);
    expect(rutaBloqueada("CENTRO_RADIOLOGICO", "/perfil")).toBe(false);
  });
});

describe("tipoDeCentro", () => {
  it("default radiológico sin fila y respeta el tipo guardado", async () => {
    const { tipoDeCentro } = await import("./tipo-centro-servidor");
    findUnique.mockResolvedValueOnce(null);
    expect(await tipoDeCentro("o1")).toBe("CENTRO_RADIOLOGICO");
    findUnique.mockResolvedValueOnce({ tipoCentro: "CLINICA_ODONTOLOGICA" });
    expect(await tipoDeCentro("o2")).toBe("CLINICA_ODONTOLOGICA");
  });
});
