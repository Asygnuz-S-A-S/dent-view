// DICOM Part 10 mínimo (Explicit VR Little Endian, sin píxeles) escrito a mano: basta para que Orthanc lo acepte.
const ascii = (s: string) => Buffer.from(s, "latin1");
function el(grupo: number, elemento: number, vr: string, valor: Buffer, pad = " "): Buffer {
  const v = valor.length % 2 ? Buffer.concat([valor, Buffer.from(pad)]) : valor;
  const cab = Buffer.alloc(vr === "OB" ? 12 : 8);
  cab.writeUInt16LE(grupo, 0); cab.writeUInt16LE(elemento, 2); cab.write(vr, 4, "latin1");
  if (vr === "OB") cab.writeUInt32LE(v.length, 8); else cab.writeUInt16LE(v.length, 6);
  return Buffer.concat([cab, v]);
}
const ui = (g: number, e: number, v: string) => el(g, e, "UI", ascii(v), "\0");

export function dicomSintetico(opc: { patientId: string; studyUid: string }): Buffer {
  const clase = "1.2.840.10008.5.1.4.1.1.1.1";
  const sop = `${opc.studyUid}.3`;
  const meta = Buffer.concat([el(2, 1, "OB", Buffer.from([0, 1]), "\0"), ui(2, 2, clase), ui(2, 3, sop), ui(2, 0x10, "1.2.840.10008.1.2.1")]);
  const largo = Buffer.alloc(4); largo.writeUInt32LE(meta.length);
  const datos = Buffer.concat([
    ui(8, 0x16, clase), ui(8, 0x18, sop), el(8, 0x20, "DA", ascii("20260101")), el(8, 0x60, "CS", ascii("DX")), el(8, 0x1030, "LO", ascii("QA carga web")),
    el(0x10, 0x10, "PN", ascii("QA^Cargar")), el(0x10, 0x20, "LO", ascii(opc.patientId)),
    ui(0x20, 0x0d, opc.studyUid), ui(0x20, 0x0e, `${opc.studyUid}.2`),
  ]);
  return Buffer.concat([Buffer.alloc(128), ascii("DICM"), el(2, 0, "UL", largo), meta, datos]);
}
