import { describe, expect, it } from "vitest";
import { ALCANCES, copiaMinima, CONSENTIMIENTO_REMISION_V, ESTADOS, SELECT_DESTINO, TEXTO_CONSENTIMIENTO_REMISION, transicionRemision, type EstadoRemision } from "./remisiones";

const paciente = {
  nombre: "Ana Pérez", fechaNacimiento: new Date("1990-05-01"), celular: "3001112233", persona: { tipoDocumento: "CC", numeroDocumento: "123" },
  correo: "ana@x.co", direccion: "Calle 1", alertas: "alergia", notas: "nota privada", fotoKey: "k", sexo: "M", codMunicipio: "11001",
};

describe("copiaMinima", () => {
  it("solo identificación: nombre y documento; nada más", () => {
    const c = copiaMinima(paciente, ["IDENTIFICACION"], true);
    expect(c).toEqual({ tipoDocumento: "CC", numeroDocumento: "123", nombre: "Ana Pérez", fechaNacimiento: null, celular: null, embarazo: null });
  });
  it("agrega cada campo solo si está en el alcance", () => {
    const c = copiaMinima(paciente, [...ALCANCES], true);
    expect(c.celular).toBe("3001112233");
    expect(c.fechaNacimiento).toEqual(paciente.fechaNacimiento);
    expect(c.embarazo).toBe(true);
  });
  it("nunca copia correo, dirección, alertas, notas, foto ni RIPS", () => {
    const llaves = Object.keys(copiaMinima(paciente, [...ALCANCES], false));
    expect(llaves.sort()).toEqual(["celular", "embarazo", "fechaNacimiento", "nombre", "numeroDocumento", "tipoDocumento"]);
  });
  it("sin IDENTIFICACION lanza error", () => {
    expect(() => copiaMinima(paciente, ["CONTACTO"])).toThrow();
  });
});

describe("transicionRemision", () => {
  const ok = (de: EstadoRemision, a: EstadoRemision, lado: "origen" | "destino", motivo?: string) => transicionRemision(de, a, lado, motivo).ok;
  it("flujo feliz del destino", () => {
    expect(ok("ENVIADA", "RECIBIDA", "destino")).toBe(true);
    expect(ok("RECIBIDA", "EN_PROCESO", "destino")).toBe(true);
    expect(ok("EN_PROCESO", "DEVUELTA", "destino")).toBe(true);
    expect(ok("DEVUELTA", "DEVUELTA", "destino")).toBe(true);
  });
  it("rechazar exige motivo y es del destino", () => {
    expect(ok("ENVIADA", "RECHAZADA", "destino")).toBe(false);
    expect(ok("RECIBIDA", "RECHAZADA", "destino", "  ")).toBe(false);
    expect(ok("RECIBIDA", "RECHAZADA", "destino", "Sin equipo")).toBe(true);
    expect(ok("ENVIADA", "RECHAZADA", "origen", "x")).toBe(false);
  });
  it("cancelar es del origen, antes de que el destino cree la orden", () => {
    expect(ok("ENVIADA", "CANCELADA", "origen")).toBe(true);
    expect(ok("RECIBIDA", "CANCELADA", "origen")).toBe(true);
    expect(ok("EN_PROCESO", "CANCELADA", "origen")).toBe(false);
    expect(ok("ENVIADA", "CANCELADA", "destino")).toBe(false);
  });
  it("el origen no puede hacer transiciones del destino", () => {
    for (const a of ["RECIBIDA", "EN_PROCESO", "DEVUELTA"] as const) expect(ok("ENVIADA", a, "origen")).toBe(false);
    expect(ok("DEVUELTA", "DEVUELTA", "origen")).toBe(false);
  });
  it("estados finales no avanzan", () => {
    for (const de of ["RECHAZADA", "CANCELADA"] as const) for (const a of ESTADOS) for (const l of ["origen", "destino"] as const) expect(ok(de, a, l, "m")).toBe(false);
  });
});

describe("consentimiento y proyección al destino", () => {
  it("texto y versión definidos", () => {
    expect(CONSENTIMIENTO_REMISION_V).toBe("2026-11");
    expect(TEXTO_CONSENTIMIENTO_REMISION).toContain("1581");
  });
  it("SELECT_DESTINO no incluye ids ni autoría del origen", () => {
    for (const k of ["pacienteOrigenId", "autorizacionId", "creadoPorId", "consentimientoPorId", "pacienteOrigen", "vinculoId"]) expect(SELECT_DESTINO).not.toHaveProperty(k);
  });
});
