import { describe, expect, it } from "vitest";
import { avisosDeFoto, medirPixeles, type Pixeles } from "./calidad-foto";

const imagen = (ancho: number, alto: number, f: (x: number, y: number) => number): Pixeles => {
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) { const v = f(x, y), i = (y * ancho + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255; }
  return { data, ancho, alto };
};
const tablero = (x: number, y: number) => ((x >> 2) + (y >> 2)) % 2 ? 230 : 120; // bordes marcados, brillo medio-alto
const dims = { ancho: 100, alto: 100 };

describe("calidad de foto (solo avisa)", () => {
  it("una foto nítida y con luz no genera avisos", () => {
    expect(avisosDeFoto(imagen(64, 64, tablero), "horizontal", { ancho: 1600, alto: 1200 })).toEqual([]);
  });
  it("oscura: luminancia media baja", () => {
    expect(avisosDeFoto(imagen(64, 64, (x, y) => (tablero(x, y) > 200 ? 40 : 10)), "horizontal", { ancho: 1600, alto: 1200 })).toContain("OSCURA");
  });
  it("borrosa: sin bordes (degradado suave o color plano)", () => {
    expect(avisosDeFoto(imagen(64, 64, (x) => 100 + x), "horizontal", { ancho: 1600, alto: 1200 })).toContain("BORROSA");
    expect(medirPixeles(imagen(64, 64, () => 128)).nitidez).toBe(0);
  });
  it("orientación: avisa si el celular está girado respecto de la guía, y no con cuadradas", () => {
    const nitida = imagen(64, 64, tablero);
    expect(avisosDeFoto(nitida, "vertical", { ancho: 1600, alto: 1200 })).toEqual(["ORIENTACION"]);
    expect(avisosDeFoto(nitida, "horizontal", { ancho: 1200, alto: 1600 })).toEqual(["ORIENTACION"]);
    expect(avisosDeFoto(nitida, "vertical", dims)).toEqual([]);
  });
});
