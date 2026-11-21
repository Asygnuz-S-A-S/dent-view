#!/usr/bin/env node
// Lista las claves de en-US que faltan o están vacías en otro locale de OHIF (por defecto `es`).
// Uso: node viewer/scripts/claves-faltantes.mjs [locale] [--detalle] [--json]
// Sale con código 1 si falta alguna clave, o si un namespace existe pero no está registrado en index.js.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const locale = args.find(a => !a.startsWith('--')) ?? 'es';
const detalle = args.includes('--detalle');
const json = args.includes('--json');
const base = join(dirname(fileURLToPath(import.meta.url)), '../ohif/platform/i18n/src/locales');
const leer = f => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
const indice = existsSync(join(base, locale, 'index.js')) ? readFileSync(join(base, locale, 'index.js'), 'utf8') : '';

const faltantes = {};
const sinRegistrar = [];
let total = 0;
let faltan = 0;
for (const archivo of readdirSync(join(base, 'en-US')).filter(f => f.endsWith('.json')).sort()) {
  const en = leer(join(base, 'en-US', archivo));
  const otro = leer(join(base, locale, archivo)) ?? {};
  const ns = archivo.replace(/\.json$/, '');
  if (existsSync(join(base, locale, archivo)) && !new RegExp(`from './${ns}.json'`).test(indice)) sinRegistrar.push(ns);
  const lista = Object.keys(en).filter(k => typeof otro[k] !== 'string' || otro[k].trim() === '');
  total += Object.keys(en).length;
  faltan += lista.length;
  if (lista.length) faltantes[ns] = lista;
}

if (json) {
  console.log(JSON.stringify({ locale, total, faltan, sinRegistrar, faltantes }, null, 2));
} else {
  for (const [ns, lista] of Object.entries(faltantes)) {
    console.log(`${ns}: ${lista.length}`);
    if (detalle) lista.forEach(k => console.log(`  - ${k}`));
  }
  if (sinRegistrar.length) console.log(`Sin registrar en ${locale}/index.js: ${sinRegistrar.join(', ')}`);
  console.log(`\n${locale}: faltan ${faltan} de ${total} claves en ${Object.keys(faltantes).length} namespaces.`);
}
process.exit(faltan || sinRegistrar.length ? 1 : 0);
