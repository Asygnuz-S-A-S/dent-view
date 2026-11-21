import dicomParser from 'dicom-parser';

export const SOP_RAW_DATA = '1.2.840.10008.5.1.4.1.1.66';

// "Apellidos^Nombres" -> "Nombres Apellidos"
export function formatearNombre(patientName: string): string {
  const [apellidos = '', nombres = ''] = patientName.split('^');
  return [nombres, apellidos].map((s) => s.trim()).filter(Boolean).join(' ');
}

// Malla PLY ASCII que Carestream guarda en la secuencia privada (0009,11a0), ítem MESH_BUFFER_1.
export function extraerMallaPly(dicom: Uint8Array): Buffer | null {
  const ds = dicomParser.parseDicom(dicom);
  if (ds.string('x00080016') !== SOP_RAW_DATA) return null;
  for (const item of ds.elements.x000911a0?.items ?? []) {
    const d = item.dataSet!;
    if (d.string('x000911a1') !== 'MESH_BUFFER_1') continue;
    const datos = d.elements.x000911a3;
    if (!datos) continue;
    // El valor va rellenado a longitud par: el largo real está en (0009,11a2).
    return Buffer.from(dicom.subarray(datos.dataOffset, datos.dataOffset + (d.uint32('x000911a2') ?? datos.length)));
  }
  return null;
}

// Misma convención que apps/web/src/lib/ingesta.ts (etiqueta "tenant-<organizationId>" en Orthanc).
const PREFIJO_ETIQUETA = 'tenant-';
/** Centro dueño según las etiquetas del estudio; "varios" si hay más de uno. */
export function centroDeEtiquetas(etiquetas: string[] | undefined): string | null | 'varios' {
  const centros = [...new Set((etiquetas ?? []).filter((e) => e.startsWith(PREFIJO_ETIQUETA)).map((e) => e.slice(PREFIJO_ETIQUETA.length)))];
  return centros.length > 1 ? 'varios' : (centros[0] ?? null);
}
