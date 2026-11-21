# Agente de ingesta (PC del centro)

Vigila las carpetas donde el software del equipo (CS 9600, panorámico…) exporta los estudios y los sube a Radia por
`POST /api/ingesta` con el token de la estación (se crea en **Configuración → Estaciones de ingesta**). Node 24, sin
dependencias.

- Espera a que cada archivo deje de cambiar (`estableSegundos`, 10 s por defecto) antes de subirlo.
- Sube DICOM (`.dcm` o sin extensión: se reconoce por `DICM` en el byte 128) y `.zip`. Ignora `DICOMDIR`, ejecutables
  y archivos del visor de los CD; los DICOM del CD se suben uno por uno.
- `fs.watch` + barrido de respaldo cada `barridoSegundos` (60 s).
- Reintentos con espera exponencial (2 s … 5 min) ante fallos de red, 429 o 5xx. 401/403: token inválido o estación
  desactivada, deja los archivos en su sitio.
- Lo subido va a `enviados` y lo rechazado (409 estudio de otro centro, 413, 415, 422) a `errores`, conservando la ruta
  relativa.
- Reanudación: guarda en `estado` (JSON) el SHA-256 de cada archivo enviado; si se cae entre la subida y el movimiento,
  al volver solo lo mueve.
- `GET /api/ingesta/ping` al arrancar y cada 5 min (estado "En línea" en la app).

## Configuración (`agente-ingesta.json`)

```json
{
  "servidor": "https://radia.example.com",
  "token": "<token de la estación>",
  "carpetas": ["C:\\Exportaciones"],
  "enviados": "C:\\RadiaAgente\\enviados",
  "errores": "C:\\RadiaAgente\\errores",
  "estado": "C:\\RadiaAgente\\estado.json",
  "log": "C:\\RadiaAgente\\agente.log",
  "estableSegundos": 10,
  "barridoSegundos": 60
}
```

Las rutas relativas se resuelven desde la carpeta del JSON. `servidor` debe ser HTTPS (HTTP solo para `localhost`).

## Desarrollo

```sh
node --test apps/agente-ingesta/src/*.test.ts
npx tsc --noEmit -p apps/agente-ingesta
node apps/agente-ingesta/src/agente.ts ruta/a/agente-ingesta.json
```

## Empaquetar como `.exe` (Single Executable Application de Node)

En Windows, con Node 24 (x64) instalado, desde `apps/agente-ingesta`:

```powershell
..\..\node_modules\.bin\esbuild src/agente.ts --bundle --platform=node --target=node24 --format=cjs --outfile=dist/agente-ingesta.cjs
node --experimental-sea-config sea-config.json
node -e "require('fs').copyFileSync(process.execPath, 'dist/agente-ingesta.exe')"
npx postject dist/agente-ingesta.exe NODE_SEA_BLOB dist/agente-ingesta.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
```

(Con Node ≥ 25.5 basta `node --build-sea sea.json` con `"output": "dist/agente-ingesta.exe"`, sin postject.) Opcional:
quitar la firma de `node.exe` antes de inyectar (`signtool remove /s`) y firmar el `.exe` resultante con el certificado
de la empresa para que SmartScreen no lo bloquee.

El `.exe` lee `agente-ingesta.json` de su misma carpeta, o la ruta que se le pase como primer argumento.

### Como servicio de Windows

Un `.exe` de Node no habla el protocolo de servicios de Windows; se registra con un envoltorio, p. ej.
[WinSW](https://github.com/winsw/winsw) (MIT) o NSSM:

```powershell
nssm install RadiaAgente C:\RadiaAgente\agente-ingesta.exe C:\RadiaAgente\agente-ingesta.json
nssm set RadiaAgente AppDirectory C:\RadiaAgente
nssm start RadiaAgente
```

El servicio debe correr con un usuario que pueda leer la carpeta de exportación y escribir en `enviados`/`errores`.

## Pendiente (depende de la exportación real del CS 9600)

- Confirmar formato y estructura de la exportación (DICOM sueltos, carpeta tipo CD con `DICOMDIR`, ZIP) y si el PatientID
  lleva la cédula.
- Subida por partes con reanudación a mitad de archivo para ZIP muy grandes (hoy se reintenta el archivo completo).
- Agrupar por `StudyInstanceUID` y archivos no DICOM (JPG, PDF, STL, PLY) por subcarpeta.
- Actualización automática del agente.
