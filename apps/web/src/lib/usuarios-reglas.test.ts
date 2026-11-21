import { describe, expect, it } from "vitest";
import { validarCambioMiembro } from "./usuarios-reglas";

const base = { actorId: "a", objetivoId: "b", rolActual: "recepcion", rolNuevo: "especialista", admins: 2 };

describe("validarCambioMiembro", () => {
  it("permite cambiar el rol de otro", () => expect(validarCambioMiembro(base)).toBeNull());
  it("permite quitar a otro", () => expect(validarCambioMiembro({ ...base, rolNuevo: null })).toBeNull());
  it("no deja quitarse a sí mismo", () => {
    expect(validarCambioMiembro({ ...base, objetivoId: "a", rolActual: "admin_tenant", rolNuevo: null })).toMatch(/ti mismo/);
  });
  it("no deja degradarse a sí mismo", () => {
    expect(validarCambioMiembro({ ...base, objetivoId: "a", rolActual: "admin_tenant" })).toMatch(/ti mismo/);
  });
  it("siempre queda un admin", () => {
    expect(validarCambioMiembro({ ...base, rolActual: "admin_tenant", admins: 1 })).toMatch(/al menos un administrador/);
    expect(validarCambioMiembro({ ...base, rolActual: "admin_tenant", rolNuevo: null, admins: 1 })).toMatch(/al menos/);
    expect(validarCambioMiembro({ ...base, rolActual: "admin_tenant", admins: 2 })).toBeNull();
  });
  it("rechaza doctores y roles inválidos", () => {
    expect(validarCambioMiembro({ ...base, rolActual: "doctor_remitente" })).toMatch(/Doctores/);
    expect(validarCambioMiembro({ ...base, rolNuevo: "doctor_remitente" })).toMatch(/Rol no válido/);
  });
});
