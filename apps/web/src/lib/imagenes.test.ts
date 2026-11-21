import { describe, expect, it } from "vitest";
import {
  claveImagenValida, claveOriginal, claveVariante, filtroImagenes, IMG_MAX_BYTES, instanciaCentral, MAX_CAPTURAS, moverCaptura,
  nombreDescarga, normalizarCapturas, tipoDeImagenEstudio, validarCantidad, validarImagenEstudio,
} from "./imagenes";

const bytes = (...v: number[]) => Uint8Array.from([...v, ...new Array(16).fill(0)]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const heic = (marca: string) => Uint8Array.from([0, 0, 0, 24, ...ascii("ftyp"), ...ascii(marca), 0, 0, 0, 0]);

describe("tipo por firma real", () => {
  it("reconoce JPEG, PNG, WebP y HEIC", () => {
    expect(tipoDeImagenEstudio(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(tipoDeImagenEstudio(bytes(0x89, ...ascii("PNG")))).toBe("image/png");
    expect(tipoDeImagenEstudio(Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")]))).toBe("image/webp");
    expect(tipoDeImagenEstudio(heic("heic"))).toBe("image/heic");
    expect(tipoDeImagenEstudio(heic("mif1"))).toBe("image/heic");
  });
  it("rechaza AVIF, SVG, PDF y texto aunque el nombre diga .jpg", () => {
    expect(tipoDeImagenEstudio(heic("avif"))).toBeNull();
    expect(tipoDeImagenEstudio(Uint8Array.from(ascii("<svg xmlns='http://www.w3.org/2000/svg'/>")))).toBeNull();
    expect(tipoDeImagenEstudio(Uint8Array.from(ascii("%PDF-1.7 ........")))).toBeNull();
    expect(tipoDeImagenEstudio(new Uint8Array(0))).toBeNull();
  });
});

describe("validación de archivo y cantidad", () => {
  it("vacío, muy grande y formato inválido", () => {
    expect(validarImagenEstudio(new Uint8Array(0))).toMatch(/vacío/);
    expect(validarImagenEstudio(bytes(1, 2, 3))).toMatch(/JPG, PNG, WebP o HEIC/);
    expect(validarImagenEstudio(bytes(0xff, 0xd8, 0xff))).toBeNull();
    const grande = new Uint8Array(IMG_MAX_BYTES + 1);
    grande.set([0xff, 0xd8, 0xff]);
    expect(validarImagenEstudio(grande)).toMatch(/25 MB/);
  });
  it("de 1 a 20 archivos por subida", () => {
    expect(validarCantidad(0)).not.toBeNull();
    expect(validarCantidad(1)).toBeNull();
    expect(validarCantidad(20)).toBeNull();
    expect(validarCantidad(21)).toMatch(/20/);
  });
});

describe("claves S3", () => {
  const k = claveOriginal("org1", "img1", "image/heic");
  it("viven bajo tenants/{org}/imagenes y las variantes están al lado", () => {
    expect(k).toBe("tenants/org1/imagenes/img1/original.heic");
    expect(claveVariante(k, "web")).toBe("tenants/org1/imagenes/img1/web.jpg");
    expect(claveVariante(k, "thumb")).toBe("tenants/org1/imagenes/img1/thumb.jpg");
  });
  it("una clave de otro centro o con .. no es válida", () => {
    expect(claveImagenValida(k, "org1", "img1")).toBe(true);
    expect(claveImagenValida(k, "org2", "img1")).toBe(false);
    expect(claveImagenValida(k, "org1", "otra")).toBe(false);
    expect(claveImagenValida("tenants/org1/imagenes/img1/../x", "org1", "img1")).toBe(false);
  });
  it("nombre de descarga limpio", () => {
    expect(nombreDescarga("Panorámica final", "a.jpg", "jpg")).toBe("Panoramica-final.jpg");
    expect(nombreDescarga(null, "IMG 01.HEIC", "heic")).toBe("IMG-01.heic");
  });
});

describe("permisos (filtro de imágenes)", () => {
  it("el personal ve todo el centro y solo el centro", () => {
    for (const rol of ["admin_tenant", "recepcion", "especialista"]) expect(filtroImagenes("o1", "u1", rol)).toEqual({ organizationId: "o1" });
  });
  it("el doctor remitente solo ve lo suyo (estudio u orden), siempre dentro de su centro", () => {
    expect(filtroImagenes("o1", "d1", "doctor_remitente")).toEqual({ organizationId: "o1", OR: [{ estudio: { doctorRemitenteId: "d1" } }, { orden: { doctorRemitenteId: "d1" } }] });
  });
});

describe("selección y orden de capturas", () => {
  it("numera en el orden recibido, descarta repetidas y vacía leyendas en blanco", () => {
    const r = normalizarCapturas([
      { origen: "DICOM", estudioUid: "1.2.3", serieUid: "1.2.3.4", leyenda: "  Axial  " },
      { origen: "IMAGEN", imagenId: "a", leyenda: " " },
      { origen: "IMAGEN", imagenId: "a" },
      { origen: "DICOM", estudioUid: "1.2.3", serieUid: "1.2.3.5" },
    ]);
    if (!("capturas" in r)) throw new Error(r.error);
    expect(r.capturas.map((c) => [c.orden, c.origen, c.imagenId, c.serieUid, c.leyenda])).toEqual([
      [0, "DICOM", null, "1.2.3.4", "Axial"], [1, "IMAGEN", "a", null, null], [2, "DICOM", null, "1.2.3.5", null],
    ]);
  });
  it("rechaza más de 12, UIDs raros y leyendas largas", () => {
    const muchas = Array.from({ length: MAX_CAPTURAS + 1 }, (_, i) => ({ origen: "IMAGEN", imagenId: `i${i}` }));
    expect(normalizarCapturas(muchas)).toHaveProperty("error");
    expect(normalizarCapturas([{ origen: "DICOM", estudioUid: "../../x" }])).toHaveProperty("error");
    expect(normalizarCapturas([{ origen: "IMAGEN", imagenId: "a", leyenda: "x".repeat(201) }])).toHaveProperty("error");
    expect(normalizarCapturas("no es lista")).toHaveProperty("error");
  });
  it("mueve arriba/abajo sin salirse de rango", () => {
    expect(moverCaptura(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moverCaptura(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    const l = ["a", "b"];
    expect(moverCaptura(l, 0, -1)).toBe(l);
    expect(moverCaptura(l, 1, 1)).toBe(l);
  });
  it("la instancia central de una serie sale del orden por IndexInSeries", () => {
    const inst = [{ ID: "c", IndexInSeries: 3 }, { ID: "a", IndexInSeries: 1 }, { ID: "b", IndexInSeries: 2 }, { ID: "d", IndexInSeries: 4 }, { ID: "e", IndexInSeries: 5 }];
    expect(instanciaCentral(inst)?.ID).toBe("c");
    expect(instanciaCentral([{ ID: "x" }, { ID: "y" }])?.ID).toBe("x");
    expect(instanciaCentral([])).toBeNull();
  });
});
