// Sube a Orthanc los .dcm de MUESTRAS_DIR (CBCT_demo_dicom/*.dcm y FacialScanning.dcm).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const orthanc = process.env.ORTHANC_URL ?? 'http://orthanc:8042';
const dir = process.env.MUESTRAS_DIR ?? '../Radia';
const archivos = [
  ...readdirSync(join(dir, 'CBCT_demo_dicom')).filter((f) => f.endsWith('.dcm')).map((f) => join(dir, 'CBCT_demo_dicom', f)),
  join(dir, 'FacialScanning.dcm'),
];

let fallos = 0;
for (const f of archivos) {
  const r = await fetch(`${orthanc}/instances`, { method: 'POST', body: readFileSync(f) });
  if (!r.ok) { fallos++; console.error(`${f}: ${r.status} ${await r.text()}`); }
}
console.log(`${archivos.length - fallos}/${archivos.length} instancias subidas`);
process.exit(fallos ? 1 : 0);
