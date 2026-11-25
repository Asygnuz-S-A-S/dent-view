// Plan de estudios DICOM sintéticos: se generan con Python (generar_dicom.py) y se suben a Orthanc con la etiqueta del centro.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { orthancIdEstudio, subirEstudio, subirS3 } from "./externos";
import { conConcurrencia, log, type Entorno } from "./util";

export type TipoDicom = "PX" | "CEFALO" | "IO" | "BW" | "CBCT" | "FACIAL";
export type PlanEstudio = {
  key: string; tipo: TipoDicom; patientId: string; patientName: string; birthDate: string; sex: string; studyDate: string; studyUid: string;
  desc: string; seed: number; orthancId: string; centro: string; remitente: string; accession: string; cortes?: number; superficieKey?: string;
};
export const MODALIDAD_DICOM: Record<TipoDicom, string> = { PX: "PX", CEFALO: "DX", IO: "IO", BW: "IO", CBCT: "CT", FACIAL: "OT" };

export const uidEstudio = (slug: string, n: number) => `2.25.${BigInt(`0x${createHash("sha256").update(`${slug}:${n}`).digest("hex").slice(0, 30)}`).toString()}`;

export function planEstudio(p: Omit<PlanEstudio, "orthancId">): PlanEstudio {
  return { ...p, orthancId: orthancIdEstudio(p.patientId, p.studyUid) };
}

/** "Nombre Segundo Apellido1 Apellido2" -> "Apellido1 Apellido2^Nombre Segundo" (formato DICOM, lo invierte formatearNombre del worker). */
export function nombreDicom(nombre: string) {
  const partes = nombre.split(" ");
  const n = partes.length;
  const apellidos = partes.slice(-2).join(" ");
  const nombres = partes.slice(0, n - 2).join(" ");
  return `${apellidos}^${nombres}`;
}
export const fechaDicom = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

const DIR = resolve(import.meta.dirname);
const PYTHON = () => {
  const venv = join(DIR, ".venv", "bin", "python");
  return existsSync(venv) ? venv : process.env.PYTHON ?? "python3";
};

/** Genera los archivos, los sube a Orthanc (etiquetados) y sube las mallas PLY a S3. Verifica el id que asigna Orthanc. */
export async function generarYSubir(env: Entorno, orgId: string, planes: PlanEstudio[]) {
  if (!planes.length) return;
  const trabajo = mkdtempSync(join(tmpdir(), "dv-demo-dicom-"));
  try {
    writeFileSync(join(trabajo, "manifiesto.json"), JSON.stringify(planes));
    const r = spawnSync(PYTHON(), [join(DIR, "generar_dicom.py"), join(trabajo, "manifiesto.json"), join(trabajo, "out")], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`generar_dicom.py falló: ${r.stderr || r.stdout}`);
    const etiqueta = `tenant-${orgId}`;
    await conConcurrencia(planes, 3, async (p) => {
      const carpeta = join(trabajo, "out", p.key);
      const archivos = readdirSync(carpeta).filter((f) => f.endsWith(".dcm")).sort().map((f) => readFileSync(join(carpeta, f)));
      const id = await subirEstudio(env, archivos, etiqueta);
      if (id !== p.orthancId) throw new Error(`Orthanc asignó ${id} y se esperaba ${p.orthancId} (${p.key})`);
      if (p.superficieKey) await subirS3(env.bucket, p.superficieKey, readFileSync(join(carpeta, "face.ply")), "text/plain");
    });
    log(`  ${planes.length} estudios DICOM subidos a Orthanc (${orgId}).`);
  } finally {
    rmSync(trabajo, { recursive: true, force: true });
  }
}
