import { describe, expect, it } from "vitest";
import { esquemaNumeroDocumento, calcularEdad, iniciales, normalizarDocumento } from "./pacientes";

describe("normalizarDocumento", () => {
  it("quita separadores y pasa a mayúsculas", () => {
    expect(normalizarDocumento(" 1.053-123 456 ")).toBe("1053123456");
    expect(normalizarDocumento("ab-12")).toBe("AB12");
  });
});

describe("calcularEdad", () => {
  const nac = new Date("1990-06-15T00:00:00Z");
  it("aún no cumple años", () => expect(calcularEdad(nac, new Date("2026-06-14T12:00:00Z"))).toBe(35));
  it("el día del cumpleaños", () => expect(calcularEdad(nac, new Date("2026-06-15T12:00:00Z"))).toBe(36));
  it("recién nacido", () => expect(calcularEdad(nac, nac)).toBe(0));
});

describe("iniciales", () => it("toma hasta dos", () => expect(iniciales("  ana maría  pérez")).toBe("AM")));

describe("esquemaNumeroDocumento", () => {
  it("normaliza a mayúsculas sin separadores", () => expect(esquemaNumeroDocumento.parse("ab-1.2 3")).toBe("AB123"));
  it("rechaza símbolos, emojis y etiquetas", () => {
    for (const x of ["12<script>", "123'45", "12😀34", "12_34", "ñ1234"]) expect(esquemaNumeroDocumento.safeParse(x).success, x).toBe(false);
  });
  it("exige de 3 a 20 caracteres", () => {
    expect(esquemaNumeroDocumento.safeParse("12").success).toBe(false);
    expect(esquemaNumeroDocumento.safeParse("1".repeat(21)).success).toBe(false);
    expect(esquemaNumeroDocumento.safeParse("1".repeat(20)).success).toBe(true);
  });
});
