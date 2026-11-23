import { describe, expect, it } from "vitest";
import { dimensionesFinales } from "./comprimir";

describe("dimensionesFinales", () => {
  it("reduce al lado máximo conservando proporción y nunca agranda", () => {
    expect(dimensionesFinales(4032, 3024)).toEqual({ ancho: 1920, alto: 1440 });
    expect(dimensionesFinales(3024, 4032)).toEqual({ ancho: 1440, alto: 1920 });
    expect(dimensionesFinales(800, 600)).toEqual({ ancho: 800, alto: 600 });
    expect(dimensionesFinales(10000, 1)).toEqual({ ancho: 1920, alto: 1 });
  });
});
