import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  cargarEstado, clasificar, detectarTipo, esIgnorado, espera, guardarEstado, revisarEstabilidad, sha256, validarConfig, type Visto,
} from './lib.ts';

test('detectarTipo: DICOM por DICM en el byte 128 (sin importar la extensión) y ZIP por PK\\x03\\x04', () => {
  const dcm = Buffer.alloc(132);
  dcm.write('DICM', 128, 'latin1');
  assert.equal(detectarTipo(dcm), 'dicom');
  assert.equal(detectarTipo(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0])), 'zip');
  assert.equal(detectarTipo(Buffer.from('MZ\x90\x00', 'latin1')), null); // ejecutable
  assert.equal(detectarTipo(Buffer.alloc(131)), null);
  assert.equal(detectarTipo(Buffer.alloc(0)), null);
});

test('esIgnorado: DICOMDIR, programas del visor y temporales', () => {
  for (const r of ['CD/DICOMDIR', 'CD/dicomdir', 'CD/Viewer.EXE', 'CD/lib.dll', 'CD/autorun.inf', 'x/.DS_Store', 'x/~tmp.dcm']) assert.ok(esIgnorado(r), r);
  for (const r of ['CD/DICOM/IM000001', 'a/s0048.dcm', 'a/estudio.zip']) assert.ok(!esIgnorado(r), r);
});

test('revisarEstabilidad: listo solo cuando tamaño y fecha no cambian durante el tiempo pedido', () => {
  const v = new Map<string, Visto>();
  const st = (size: number, mtimeMs = 1) => ({ size, mtimeMs });
  assert.equal(revisarEstabilidad(v, 'a', st(10), 0, 5000), false); // primera vez
  assert.equal(revisarEstabilidad(v, 'a', st(10), 3000, 5000), false); // aún no pasa el tiempo
  assert.equal(revisarEstabilidad(v, 'a', st(20, 2), 4000, 5000), false); // creció: reinicia
  assert.equal(revisarEstabilidad(v, 'a', st(20, 2), 8000, 5000), false);
  assert.equal(revisarEstabilidad(v, 'a', st(20, 2), 9000, 5000), true);
  assert.equal(revisarEstabilidad(v, 'b', st(0), 0, 0), false);
  assert.equal(revisarEstabilidad(v, 'b', st(0), 10_000, 0), false); // vacío: nunca listo
});

test('espera exponencial con tope', () => {
  assert.deepEqual([0, 1, 2, 3].map((i) => espera(i)), [2000, 4000, 8000, 16000]);
  assert.equal(espera(20), 300_000);
});

test('clasificar respuestas del servidor', () => {
  assert.equal(clasificar(200), 'ok');
  assert.equal(clasificar(401), 'token');
  assert.equal(clasificar(429), 'reintentar');
  assert.equal(clasificar(502), 'reintentar');
  for (const s of [409, 413, 415, 422]) assert.equal(clasificar(s), 'rechazado');
});

test('estado: persiste y recarga el SHA-256 de lo enviado', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agente-'));
  const ruta = join(dir, 'estado.json');
  assert.deepEqual(cargarEstado(ruta), {});
  const archivo = join(dir, 'x.dcm');
  writeFileSync(archivo, 'abc');
  const h = await sha256(archivo);
  assert.equal(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  guardarEstado(ruta, { [h]: '2026-11-20T00:00:00.000Z' });
  assert.deepEqual(cargarEstado(ruta), { [h]: '2026-11-20T00:00:00.000Z' });
});

test('validarConfig exige los campos y HTTPS fuera del equipo local', () => {
  const ok = { servidor: 'https://radia.co', token: 't', carpetas: ['C:\\Export'], enviados: 'e', errores: 'r' };
  assert.equal(validarConfig(ok).servidor, 'https://radia.co');
  assert.ok(validarConfig({ ...ok, servidor: 'http://127.0.0.1:3200' }));
  assert.throws(() => validarConfig({ ...ok, servidor: 'http://radia.co' }));
  assert.throws(() => validarConfig({ ...ok, servidor: 'http://localhost.evil.com' }));
  assert.throws(() => validarConfig({ ...ok, token: '' }), /token/);
  assert.throws(() => validarConfig({ ...ok, carpetas: [] }), /carpetas/);
});
