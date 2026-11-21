import { describe, expect, it } from "vitest";
import { debeActivarMfa, validarClaveNueva } from "./perfil";

describe("validarClaveNueva", () => {
  it("exige mínimo 10 caracteres", () => {
    expect(validarClaveNueva("corta123", "corta123")).toMatch(/10/);
    expect(validarClaveNueva("1234567890", "1234567890")).toBeNull();
  });
  it("exige que la confirmación coincida", () => {
    expect(validarClaveNueva("1234567890", "1234567891")).toMatch(/confirmación/);
  });
});

describe("debeActivarMfa", () => {
  it("lo exige al admin del centro y al superadmin sin MFA", () => {
    expect(debeActivarMfa({ role: null, twoFactorEnabled: false }, "admin_tenant", false)).toBe(true);
    expect(debeActivarMfa({ role: "admin", twoFactorEnabled: null }, null, false)).toBe(true);
  });
  it("no lo exige a los demás roles", () => {
    for (const rol of ["recepcion", "especialista", "doctor_remitente"]) expect(debeActivarMfa({ role: null, twoFactorEnabled: false }, rol, false)).toBe(false);
  });
  it("no lo exige si ya está activo ni en una suplantación", () => {
    expect(debeActivarMfa({ role: "admin", twoFactorEnabled: true }, null, false)).toBe(false);
    expect(debeActivarMfa({ role: null, twoFactorEnabled: false }, "admin_tenant", true)).toBe(false);
  });
});
