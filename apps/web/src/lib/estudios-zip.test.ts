import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extraerDicomDeZip, LIMITES_ZIP, ZipInvalido } from "./estudios-zip";

const dcm = (extra = 0) => Uint8Array.from([...new Array(128).fill(0), 68, 73, 67, 77, ...new Array(extra).fill(7)]);
const flujo = (b: Uint8Array, trozo = 4096) => new ReadableStream<Uint8Array>({
  start(c) { for (let i = 0; i < b.length; i += trozo) c.enqueue(b.subarray(i, i + trozo)); c.close(); },
});
const correr = (archivos: Record<string, Uint8Array>, lim = LIMITES_ZIP) => {
  const subidos: string[] = [];
  return extraerDicomDeZip(flujo(zipSync(archivos)), async (n) => void subidos.push(n), lim).then((n) => ({ n, subidos }));
};

describe("extraerDicomDeZip", () => {
  it("sube cada .dcm, ignora DICOMDIR, carpetas y __MACOSX", async () => {
    const r = await correr({ "a/1.dcm": dcm(10), "a/2": dcm(5), "DICOMDIR": strToU8("x"), "__MACOSX/._1.dcm": strToU8("x") });
    expect(r.n).toBe(2);
    expect(r.subidos.sort()).toEqual(["a/1.dcm", "a/2"]);
  });
  it("rechaza rutas con .. y rutas absolutas", async () => {
    await expect(correr({ "../evil.dcm": dcm() })).rejects.toThrow(/rutas no permitidas/);
    await expect(correr({ "/abs/x.dcm": dcm() })).rejects.toThrow(/rutas no permitidas/);
    await expect(correr({ "a/../../x.dcm": dcm() })).rejects.toThrow(ZipInvalido);
  });
  it("rechaza un ZIP con archivos que no son DICOM y no sube nada del resto antes del fallo posterior", async () => {
    await expect(correr({ "ok.dcm": dcm(), "readme.txt": strToU8("hola") })).rejects.toThrow(/no son DICOM/);
    await expect(correr({ "solo.txt": strToU8("hola") })).rejects.toThrow(/no son DICOM/);
  });
  it("zip-bomb: corta por bytes descomprimidos reales, tamaño de entrada y cantidad de archivos", async () => {
    const gordo = dcm(200_000); // comprime a casi nada pero descomprime a 200 KB
    await expect(correr({ "a.dcm": gordo, "b.dcm": gordo, "c.dcm": gordo }, { ...LIMITES_ZIP, total: 500_000 })).rejects.toThrow(/descomprimido/);
    await expect(correr({ "a.dcm": gordo }, { ...LIMITES_ZIP, entrada: 100_000 })).rejects.toThrow(/demasiado grande/);
    await expect(correr({ "a.dcm": dcm(), "b.dcm": dcm(), "c.dcm": dcm() }, { ...LIMITES_ZIP, entradas: 2 })).rejects.toThrow(/más de 2/);
  });
  it("un ZIP sin entradas o basura falla", async () => {
    await expect(correr({})).rejects.toThrow(ZipInvalido);
    await expect(extraerDicomDeZip(flujo(Uint8Array.from([0x50, 0x4b, 3, 4, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9])), async () => {})).rejects.toThrow(ZipInvalido);
  });
  it("si subir falla, el error se propaga y se detiene", async () => {
    await expect(extraerDicomDeZip(flujo(zipSync({ "a.dcm": dcm(), "b.dcm": dcm() })), async () => { throw new Error("orthanc caído"); })).rejects.toThrow("orthanc caído");
  });
});
