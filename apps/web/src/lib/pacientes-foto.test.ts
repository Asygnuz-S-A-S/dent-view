import { describe, expect, it } from "vitest";
import { claveFoto, claveFotoValida, FOTO_MAX_BYTES, tipoDeImagen, validarFoto } from "./pacientes-foto";

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = Uint8Array.from([..."RIFF"].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [..."WEBP"].map((c) => c.charCodeAt(0))));

describe("validarFoto", () => {
  it("acepta JPEG, PNG y WebP por su firma", () => {
    expect([jpeg, png, webp].map(tipoDeImagen)).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect([jpeg, png, webp].map(validarFoto)).toEqual([null, null, null]);
  });
  it("rechaza lo que no es imagen aunque el cliente diga lo contrario (GIF, SVG, texto)", () => {
    expect(validarFoto(new TextEncoder().encode("GIF89a....."))).toMatch(/JPEG, PNG o WebP/);
    expect(validarFoto(new TextEncoder().encode("<svg onload=alert(1)>"))).toMatch(/JPEG, PNG o WebP/);
  });
  it("rechaza vacío y más de 5 MB", () => {
    expect(validarFoto(new Uint8Array(0))).toMatch(/vacío/);
    const grande = new Uint8Array(FOTO_MAX_BYTES + 1);
    grande.set(jpeg);
    expect(validarFoto(grande)).toMatch(/5 MB/);
  });
});

describe("clave de la foto", () => {
  it("va por centro y paciente, y solo se acepta la propia", () => {
    const k = claveFoto("o1", "p1", "abc");
    expect(k).toBe("tenants/o1/pacientes/p1/foto-abc.jpg");
    expect(claveFotoValida(k, "o1", "p1")).toBe(true);
    expect(claveFotoValida(k, "o2", "p1")).toBe(false);
    expect(claveFotoValida(k, "o1", "p2")).toBe(false);
  });
});
