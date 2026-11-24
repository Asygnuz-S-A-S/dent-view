import { describe, expect, it } from "vitest";
import { ajustarContraste, contraste, cssMarca, esquemaLogo, normalizarHex, temaMarca, textoSobre } from "./marca";

describe("marca del centro", () => {
  it("normaliza hex de 6 dígitos y rechaza lo demás", () => {
    expect(normalizarHex(" #0E6B8A ")).toBe("#0e6b8a");
    for (const malo of ["red", "#fff", "#12345g", "#000000;}body{display:none", "", null, 42]) expect(normalizarHex(malo)).toBeNull();
  });

  it("calcula el contraste WCAG", () => {
    expect(contraste("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contraste("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("elige un texto que cumple AA sobre cualquier color", () => {
    expect(textoSobre("#0e6b8a")).toBe("#ffffff");
    expect(textoSobre("#f5d90a")).not.toBe("#ffffff");
    for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) {
      const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
      expect(contraste(hex, textoSobre(hex))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("aclara el color en modo oscuro hasta leerse sobre el fondo", () => {
    const t = temaMarca("#1e3a8a");
    expect(contraste(t.oscuro.primario, "#0a0a0a")).toBeGreaterThanOrEqual(4.5);
    expect(contraste(t.oscuro.primario, t.oscuro.texto)).toBeGreaterThanOrEqual(4.5);
    expect(ajustarContraste("#ffffff", "#0a0a0a", 4.5)).toBe("#ffffff");
  });

  it("avisa cuando el color es muy claro sobre fondo blanco", () => {
    expect(temaMarca("#0e6b8a").aviso).toBeNull();
    expect(temaMarca("#fde68a").aviso).toMatch(/muy claro/);
  });

  it("genera CSS solo con colores válidos", () => {
    expect(cssMarca("#0E6B8A")).toContain(
      ":root{--primary:#0e6b8a;--primary-foreground:#ffffff;--ring:#0e6b8a;--sidebar-primary:#0e6b8a;--sidebar-primary-foreground:#ffffff;--sidebar-ring:#0e6b8a;}.dark{--primary:#",
    );
    expect(cssMarca("#0e6b8a")).toMatch(/^:root\{[^<>]*\}\.dark\{[^<>]*\}$/);
    expect(cssMarca("</style><script>")).toBeNull();
    expect(cssMarca(null)).toBeNull();
  });

  it("valida el logo como data URL PNG/JPEG", () => {
    expect(esquemaLogo.safeParse("data:image/png;base64,iVBORw0KGgo=").success).toBe(true);
    expect(esquemaLogo.safeParse("data:image/svg+xml;base64,PHN2Zz4=").success).toBe(false);
    expect(esquemaLogo.safeParse("javascript:alert(1)").success).toBe(false);
  });
});

describe("modo oscuro: el primario se lee también sobre su tinte y sobre tarjetas", () => {
  it("teal institucional (#0f766e) llega a 6:1 contra el fondo oscuro", () => {
    expect(contraste(temaMarca("#0f766e").oscuro.primario, "#0a0a0a")).toBeGreaterThanOrEqual(6);
  });
});
