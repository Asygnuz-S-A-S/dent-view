import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { centroDeEtiquetas, extraerMallaPly, formatearNombre } from './dicom.ts';

const muestras = process.env.MUESTRAS_DIR ?? '../../../Radia';
const facial = join(muestras, 'FacialScanning.dcm');

test('formatearNombre invierte Apellidos^Nombres', () => {
  assert.equal(formatearNombre('perez gomez^ana maria'), 'ana maria perez gomez');
  assert.equal(formatearNombre('Perez'), 'Perez');
});

test('extrae el PLY de FacialScanning.dcm', { skip: !existsSync(facial) }, () => {
  const ply = extraerMallaPly(readFileSync(facial));
  assert.ok(ply && ply.length > 1_000_000);
  assert.ok(ply.subarray(0, 21).toString().startsWith('ply\nformat ascii 1.0'));
});

test('centroDeEtiquetas lee el centro de la etiqueta de Orthanc', () => {
  assert.equal(centroDeEtiquetas(undefined), null);
  assert.equal(centroDeEtiquetas(['otra']), null);
  assert.equal(centroDeEtiquetas(['otra', 'tenant-abc-123']), 'abc-123');
  assert.equal(centroDeEtiquetas(['tenant-a', 'tenant-a']), 'a');
  assert.equal(centroDeEtiquetas(['tenant-a', 'tenant-b']), 'varios');
});
