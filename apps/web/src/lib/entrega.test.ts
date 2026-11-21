import { describe, expect, it } from "vitest";
import {
  estadoEnlace, firmarCookie, generarCodigoAcceso, generarToken, hashCodigo, hashToken, igualesSeguro, limitarIp, MAX_INTENTOS,
  SESION_RESULTADOS_MS, venceSesion, verificarCookie,
} from "./entrega";

const S = "secreto-de-prueba";
const ahora = new Date("2026-11-20T12:00:00Z");
const mas = (ms: number) => new Date(ahora.getTime() + ms);

describe("token y código", () => {
  it("el token es aleatorio y de alta entropía", () => {
    const a = generarToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generarToken()).not.toBe(a);
  });
  it("el código tiene 6 dígitos con ceros a la izquierda", () => {
    expect(generarCodigoAcceso(() => 42)).toBe("000042");
    expect(generarCodigoAcceso()).toMatch(/^\d{6}$/);
  });
  it("hashes: determinista, distinto por token/código/secreto, sin texto en claro", () => {
    const t = hashToken("abc");
    expect(t).toBe(hashToken("abc"));
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    const h = hashCodigo(t, "123456", S);
    expect(h).toBe(hashCodigo(t, "123456", S));
    expect(h).not.toBe(hashCodigo(t, "123457", S));
    expect(h).not.toBe(hashCodigo(hashToken("abd"), "123456", S));
    expect(h).not.toBe(hashCodigo(t, "123456", "otro"));
    expect(h).not.toContain("123456");
  });
  it("igualesSeguro compara hashes", () => {
    const h = hashToken("x");
    expect(igualesSeguro(h, hashToken("x"))).toBe(true);
    expect(igualesSeguro(h, hashToken("y"))).toBe(false);
    expect(igualesSeguro(h, "corto")).toBe(false);
  });
});

describe("estadoEnlace", () => {
  const base = { venceEn: mas(1000), revocadoEn: null, intentosFallidos: 0 };
  it("activo", () => expect(estadoEnlace(base, ahora)).toBe("ACTIVO"));
  it("vencido (incluye el instante exacto)", () => {
    expect(estadoEnlace({ ...base, venceEn: mas(-1) }, ahora)).toBe("VENCIDO");
    expect(estadoEnlace({ ...base, venceEn: ahora }, ahora)).toBe("VENCIDO");
  });
  it("revocado gana sobre todo", () => expect(estadoEnlace({ ...base, revocadoEn: ahora, venceEn: mas(-1) }, ahora)).toBe("REVOCADO"));
  it("bloqueado al llegar al máximo de intentos", () => {
    expect(estadoEnlace({ ...base, intentosFallidos: MAX_INTENTOS - 1 }, ahora)).toBe("ACTIVO");
    expect(estadoEnlace({ ...base, intentosFallidos: MAX_INTENTOS }, ahora)).toBe("BLOQUEADO");
  });
});

describe("cookie de resultados", () => {
  it("la sesión dura 2 h pero nunca pasa del vencimiento del enlace", () => {
    expect(venceSesion(ahora, mas(10 * SESION_RESULTADOS_MS))).toEqual(mas(SESION_RESULTADOS_MS));
    expect(venceSesion(ahora, mas(60_000))).toEqual(mas(60_000));
  });
  it("firma y verifica", () => {
    const c = firmarCookie("enl1", mas(60_000), S);
    expect(verificarCookie(c, S, ahora)).toBe("enl1");
  });
  it("rechaza vencida, otro secreto, manipulada o con formato inválido", () => {
    const c = firmarCookie("enl1", mas(60_000), S);
    expect(verificarCookie(c, S, mas(60_001))).toBeNull();
    expect(verificarCookie(c, "otro", ahora)).toBeNull();
    expect(verificarCookie(c.replace("enl1", "enl2"), S, ahora)).toBeNull();
    expect(verificarCookie(c.replace(/\.\d+\./, `.${mas(9e9).getTime()}.`), S, ahora)).toBeNull();
    for (const v of [null, undefined, "", "a.b.c", "x"]) expect(verificarCookie(v, S, ahora)).toBeNull();
  });
});

describe("limitarIp", () => {
  it("permite hasta el máximo en la ventana y luego bloquea; la ventana se libera", () => {
    const m = new Map<string, number[]>();
    for (let i = 0; i < 20; i++) expect(limitarIp(m, "1.1.1.1", 1000 + i)).toBe(true);
    expect(limitarIp(m, "1.1.1.1", 2000)).toBe(false);
    expect(limitarIp(m, "2.2.2.2", 2000)).toBe(true);
    expect(limitarIp(m, "1.1.1.1", 1000 + 11 * 60_000)).toBe(true);
  });
});
