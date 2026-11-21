// Implementación independiente (sala limpia) a partir de docs/sala-limpia/05-historia-clinica.md
import { describe, expect, it } from "vitest";
import { calcularAlertas, esMenor, esquemaAntecedentes, esquemaContacto, type ContextoAlertas } from "./historia-clinica";

const base: ContextoAlertas = {
  embarazo: false, semanasEmbarazo: null, lactancia: false, anticoagulantes: false, anticoagulanteNombre: null, inr: null,
  reaccionAnestesia: false, detalleAnestesia: null, implantesMetalicos: false, marcapasos: false,
};
const ctxForm = { embarazo: false, lactancia: false, anticoagulantes: false, reaccionAnestesia: false, implantesMetalicos: false, marcapasos: false, claustrofobia: false };

describe("calcularAlertas", () => {
  it("alergia alta alerta y media no", () => {
    const r = calcularAlertas(null, [{ nombre: "Látex", gravedad: "ALTA", reaccion: "urticaria" }, { nombre: "Polen", gravedad: "MEDIA" }]);
    expect(r).toEqual([{ gravedad: "ALTA", texto: "Alergia a Látex (urticaria)" }]);
  });
  it("embarazo con semanas es alta", () => {
    expect(calcularAlertas({ ...base, embarazo: true, semanasEmbarazo: 20 }, [])).toEqual([{ gravedad: "ALTA", texto: "Embarazo de 20 semanas" }]);
  });
  it("anticoagulantes es crítica con medicamento e INR y va primero", () => {
    const r = calcularAlertas({ ...base, embarazo: true, anticoagulantes: true, anticoagulanteNombre: "Warfarina", inr: 2.5 }, []);
    expect(r[0]).toEqual({ gravedad: "CRITICA", texto: "Anticoagulantes: Warfarina, INR 2.5" });
    expect(r).toHaveLength(2);
  });
  it("enfermedad crítica alerta; no crítica no", () => {
    expect(calcularAlertas(null, [], [{ nombre: "Cardiopatía", critica: true }, { nombre: "Gastritis", critica: false }])).toHaveLength(1);
  });
});

describe("esMenor", () => {
  it("usa 18 años cumplidos", () => {
    const hoy = new Date("2026-11-19T12:00:00Z");
    expect(esMenor(new Date("2008-11-20T00:00:00Z"), hoy)).toBe(true);
    expect(esMenor(new Date("2008-11-19T00:00:00Z"), hoy)).toBe(false);
    expect(esMenor(null, hoy)).toBe(false);
  });
});

describe("esquemaAntecedentes", () => {
  it("semana e INR vacíos no son error", () => {
    const r = esquemaAntecedentes.safeParse({ contexto: { ...ctxForm, semanasEmbarazo: "", inr: "" }, alergias: [], medicaciones: [], enfermedades: [] });
    expect(r.success).toBe(true);
  });
  it("gravedad fuera de vocabulario rechaza todo", () => {
    const r = esquemaAntecedentes.safeParse({ contexto: ctxForm, alergias: [{ nombre: "X", gravedad: "grave" }], medicaciones: [], enfermedades: [] });
    expect(r.success).toBe(false);
  });
  it("rangos de semana e INR", () => {
    expect(esquemaAntecedentes.safeParse({ contexto: { ...ctxForm, semanasEmbarazo: 43 }, alergias: [], medicaciones: [], enfermedades: [] }).success).toBe(false);
    expect(esquemaAntecedentes.safeParse({ contexto: { ...ctxForm, inr: 21 }, alergias: [], medicaciones: [], enfermedades: [] }).success).toBe(false);
  });
});

describe("esquemaContacto", () => {
  it("teléfono obligatorio y correo vacío aceptado", () => {
    expect(esquemaContacto.safeParse({ nombre: "Ana", telefono: "" }).success).toBe(false);
    expect(esquemaContacto.safeParse({ nombre: "Ana", telefono: "300", correo: "" }).success).toBe(true);
    expect(esquemaContacto.safeParse({ nombre: "Ana", telefono: "300", correo: "x" }).success).toBe(false);
  });
});
