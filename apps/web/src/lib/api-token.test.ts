import { describe, expect, it } from "vitest";
import { estadoToken, formatoTokenValido, generarTokenApi, hashTokenApi, permisosValidos, tienePermiso, tokenDeCabecera } from "./api-token";
import { cifrar, descifrar } from "./cifrado";

describe("token de API", () => {
  it("genera un token con formato válido y su hash coincide", () => {
    const t = generarTokenApi();
    expect(formatoTokenValido(t.token)).toBe(true);
    expect(t.token.startsWith(t.prefijo)).toBe(true);
    expect(hashTokenApi(t.token)).toBe(t.tokenHash);
    expect(generarTokenApi().token).not.toBe(t.token);
  });
  it("lee el token solo de un Bearer bien formado", () => {
    const { token } = generarTokenApi();
    expect(tokenDeCabecera(`Bearer ${token}`)).toBe(token);
    expect(tokenDeCabecera(`bearer ${token}`)).toBe(token);
    expect(tokenDeCabecera(token)).toBeNull();
    expect(tokenDeCabecera("Bearer abc")).toBeNull();
    expect(tokenDeCabecera(null)).toBeNull();
  });
  it("estado: revocado y vencido no sirven", () => {
    const ahora = new Date("2026-11-20T12:00:00Z");
    expect(estadoToken({ vence: null, revocadoEn: null }, ahora)).toBe("ACTIVO");
    expect(estadoToken({ vence: new Date("2026-11-21T00:00:00Z"), revocadoEn: null }, ahora)).toBe("ACTIVO");
    expect(estadoToken({ vence: new Date("2026-11-20T11:00:00Z"), revocadoEn: null }, ahora)).toBe("VENCIDO");
    expect(estadoToken({ vence: null, revocadoEn: ahora }, ahora)).toBe("REVOCADO");
  });
  it("leer no implica escribir y se descartan permisos inventados", () => {
    expect(tienePermiso({ permisos: ["pacientes:leer"] }, "pacientes:escribir")).toBe(false);
    expect(permisosValidos(["pacientes:leer", "admin:todo", "pacientes:leer"])).toEqual(["pacientes:leer"]);
  });
});

describe("cifrado de secretos", () => {
  it("cifra y descifra; cada cifrado es distinto", () => {
    const a = cifrar("token-secreto", "clave-del-servidor"), b = cifrar("token-secreto", "clave-del-servidor");
    expect(a).not.toBe(b);
    expect(a).not.toContain("token-secreto");
    expect(descifrar(a, "clave-del-servidor")).toBe("token-secreto");
  });
  it("falla con otra clave o con el valor alterado", () => {
    const c = cifrar("x", "clave-1");
    expect(() => descifrar(c, "clave-2")).toThrow();
    expect(() => descifrar(c.slice(0, -2) + "AA", "clave-1")).toThrow();
    expect(() => descifrar("basura", "clave-1")).toThrow();
  });
});

describe("tokens API vs MCP (H1)", () => {
  it("pii solo con mcp; mcp es solo lectura y debe leer algo", async () => {
    const { validarCombinacion, esTokenMcp } = await import("./api-token");
    expect(validarCombinacion(["pacientes:leer"])).toBeNull();
    expect(validarCombinacion(["pacientes:leer", "pii"])).not.toBeNull();
    expect(validarCombinacion(["mcp", "pacientes:leer", "pii"])).toBeNull();
    expect(validarCombinacion(["mcp", "pacientes:leer", "pacientes:escribir"])).not.toBeNull();
    expect(validarCombinacion(["mcp"])).not.toBeNull();
    expect(esTokenMcp({ permisos: ["mcp", "pacientes:leer"] })).toBe(true);
    expect(esTokenMcp({ permisos: ["pacientes:leer"] })).toBe(false);
  });
});
