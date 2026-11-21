# Visor OHIF: español, marca dent-view y parche del fork

Visor: OHIF 3.13.14 (MIT), submódulo `viewer/ohif` apuntando a upstream. Se compila con su Dockerfile oficial
(servicio `visor` de `infra/compose.yaml`, `PUBLIC_URL=/visor/`) y usa la config `viewer/config/dent-view.js`
montada como `app-config.js`.

Como el submódulo apunta a upstream, **los cambios al código de OHIF no se commitean en el submódulo**: viven en
`viewer/patches/0001-dent-view-es.patch` y se aplican con `viewer/scripts/aplicar-parches.sh` antes de compilar.

## Qué hace el parche (`viewer/patches/0001-dent-view-es.patch`)

- **Español completo.** Las 36 namespaces de `platform/i18n/src/locales/en-US/` tienen su JSON en `es/` y están
  registradas en `es/index.js`. Antes faltaban 533 de 665 claves; ahora 0 (ver `claves-faltantes.mjs`).
  También se corrigieron traducciones viejas de upstream ("Cepillo" → "Pincel", "Probar" → "Sonda",
  "Secuencia" → "Serie", "Medidas" → "Mediciones", "Fecha de estudo", "Num. Adhesión" → "N.º de acceso"…).
  Fecha local en formato `DD/MM/YYYY` (`Common:localDateFormat`).
- **Idioma por defecto por configuración.** `platform/i18n/src/index.js` lee `window.config.defaultLanguage`
  (app-config.js se carga antes del bundle). Con esa clave, i18next detecta solo `?lng=`, cookie y localStorage
  (no el idioma del navegador) y usa `fallbackLng: [defaultLanguage, 'en-US']`. Sin la clave, el comportamiento
  es el de upstream. `dent-view.js` define `defaultLanguage: 'es'` (ya no se siembra localStorage).
  Quien eligió otro idioma en Preferencias lo conserva (localStorage `i18nextLng`).
- **Textos fijos en inglés pasados a i18n:** "Patient"/"Multiple Patients" del encabezado (`Header`),
  mensajes de "estudio no disponible" y "no se pudo consultar" (`Common:StudyNotAvailable`,
  `Common:ServerNotAvailable`).
- **Marca dent-view:**
  - Pestaña: `<title>dent-view · Visor</title>`, `lang="es"`, `application-name` y `manifest.json`.
  - "Acerca de": título "Acerca de dent-view", nombre "dent-view" y "Basado en OHIF Viewer 3.13.14" con el
    enlace al repositorio de OHIF (atribución de la licencia MIT).
  - Pantallas de error (estudio no disponible / servidor): muestran el enlace de marca de
    `whiteLabeling.createLogoComponentFn` ("dent-view ← Volver"), que vuelve a la página de origen o a `/estudios`.

Resuelto solo con configuración (`viewer/config/dent-view.js`, sin parche):
- Enlace "dent-view ← Volver" en el encabezado (`whiteLabeling.createLogoComponentFn`).
- Sin el aviso "investigational use" (`investigationalUseDialog.option: 'never'`).
- `infra/Caddyfile`: `Cache-Control: no-cache` en `/visor/app-config.js`. El volumen es un archivo suelto: si un
  editor reemplaza el archivo, recrear con `docker compose -f infra/compose.yaml -p dent-view up -d --force-recreate --no-deps visor`.

## Scripts

- `node viewer/scripts/claves-faltantes.mjs [locale] [--detalle] [--json]`: lista por namespace las claves de
  `en-US` que faltan o están vacías en el locale (por defecto `es`) y las namespaces con JSON pero sin registrar en
  `index.js`. Sale con código 1 si falta algo: sirve como verificación en CI o antes de compilar.
- `viewer/scripts/aplicar-parches.sh`: aplica `viewer/patches/*.patch` sobre `viewer/ohif` (idempotente: salta los
  ya aplicados) y corre la verificación de cobertura.
- `viewer/scripts/aplicar-parches.sh --generar`: regenera `0001-dent-view-es.patch` desde los cambios actuales del
  submódulo (incluye archivos nuevos sin seguimiento).

Compilar y desplegar el visor:

```bash
viewer/scripts/aplicar-parches.sh
docker compose -f infra/compose.yaml --env-file infra/.env build visor
docker compose -f infra/compose.yaml --env-file infra/.env up -d --no-deps visor
```

La compilación es pesada (pnpm install + webpack de todo OHIF); con caché de capas tarda varios minutos.

## Actualizar OHIF sin perder la traducción

1. Con el parche aplicado, guardar el estado actual: `viewer/scripts/aplicar-parches.sh --generar`.
2. Limpiar el submódulo y moverlo a la nueva versión:
   `git -C viewer/ohif checkout -- . && git -C viewer/ohif clean -fd platform/i18n/src/locales/es`
   `git -C viewer/ohif fetch --tags && git -C viewer/ohif checkout v3.X.Y`
3. `viewer/scripts/aplicar-parches.sh`. Si un hunk no aplica: `git -C viewer/ohif apply --3way viewer/patches/0001-dent-view-es.patch`,
   resolver los conflictos (normalmente en `es/*.json` si upstream tradujo algo, o en `index.tsx` /
   `aboutModalCustomization.tsx` si cambiaron) y volver a generar el parche con `--generar`.
4. `node viewer/scripts/claves-faltantes.mjs --detalle`: upstream suele agregar claves nuevas a `en-US`; traducirlas
   en el JSON de `es` correspondiente (y registrar namespaces nuevas en `es/index.js`) hasta que salga 0.
5. Buscar textos fijos nuevos en inglés que no pasen por i18n (p. ej. `grep -rn "OHIF Viewer" platform extensions`)
   y revisar el visor en el navegador: barra de herramientas, panel de estudios, menús, MPR/3D, "Acerca de".
6. Regenerar el parche (`--generar`), compilar y desplegar.

## Límites conocidos

- Textos que no pasan por i18n en OHIF siguen en inglés si aparecen fuera del flujo revisado (p. ej. el enlace
  "Return to the study list" de la pantalla de error, oculto porque `showStudyList: false`; textos fijos de modos
  que dent-view no usa como microscopía o TMTV).
- Algunos términos técnicos se dejan sin traducir a propósito: MPR, ROI, LUT, SUV, DICOM SEG/RTSS, spline, Cine.
- No hay clave de configuración para ocultar/explicar "Rotar 3D" y "Punto de mira" deshabilitados en series axiales.
- Navegadores que visitaron el visor antes del parche pueden tener `en-US` guardado (cookie `i18next` / localStorage
  `i18nextLng`, que i18next guardaba al detectar el idioma del navegador): se cambia una vez en Preferencias → Idioma
  o abriendo el visor con `?lng=es`.

Evidencias: `docs/qa/evidencias/visor-es/` (antes/después).
