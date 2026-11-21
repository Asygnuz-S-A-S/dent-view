import { describe, expect, it } from "vitest";
import { mensajeErrorLogin } from "./login";

describe("mensajeErrorLogin", () => {
  it("distingue demasiados intentos (429) de credenciales erróneas", () => {
    expect(mensajeErrorLogin(429)).toMatch(/Demasiados intentos/);
    expect(mensajeErrorLogin(401)).toBe("Correo o contraseña incorrectos.");
    expect(mensajeErrorLogin(undefined)).toBe("Correo o contraseña incorrectos.");
  });
  it("errores del servidor no se presentan como contraseña incorrecta", () => expect(mensajeErrorLogin(500)).toMatch(/servidor/));
});
