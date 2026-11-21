import { describe, expect, it } from "vitest";
import { slugify } from "./plataforma";

describe("slugify", () => {
  it("quita tildes, símbolos y bordes", () => {
    expect(slugify("  Radiología Ñandú & Cía. ")).toBe("radiologia-nandu-cia");
  });
  it("limita la longitud", () => {
    expect(slugify("a".repeat(100))).toHaveLength(48);
  });
});
