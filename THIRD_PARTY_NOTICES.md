# Avisos de terceros (THIRD_PARTY_NOTICES)

dent-view incluye, adapta o ejecuta los componentes de terceros que se listan abajo. Los textos de licencia son copia literal de los originales.

## OpenDentist (MIT)

Origen: https://github.com/clawnify/OpenDentist. Algunos módulos clínicos de dent-view (odontograma, plan de tratamiento, notas clínicas, facturación) están adaptados de este proyecto.

```text
MIT License

Copyright (c) 2026 Clawnify

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## OHIF Viewers (MIT)

Origen: https://github.com/OHIF/Viewers (submódulo `viewer/ohif`, copia de su archivo `LICENSE`). Se usa como visor DICOM, compilado por el Dockerfile oficial de OHIF.

```text
MIT License

Copyright (c) 2018 Open Health Imaging Foundation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Orthanc (GPLv3, servicio separado)

Orthanc (https://www.orthanc-server.com/, imagen `orthancteam/orthanc`) se ejecuta como un contenedor independiente y se comunica con dent-view únicamente por HTTP/DICOMweb. Dent-view no enlaza ni incorpora código de Orthanc; Orthanc y sus plugins se distribuyen bajo sus propias licencias (el servidor y los plugins principales bajo GNU GPL v3 o posterior, o AGPL según el plugin). Quien redistribuya la imagen de Orthanc debe cumplir esas licencias y ofrecer su código fuente (https://orthanc.uclouvain.be/hg/). Texto de la GPLv3: https://www.gnu.org/licenses/gpl-3.0.txt

## Otras dependencias

Las dependencias de npm (Next.js, React, Prisma, Better Auth, Zod, Vitest, entre otras) se distribuyen bajo licencias permisivas (MIT, Apache-2.0, ISC o BSD). La lista completa con sus licencias se obtiene del lockfile (`package-lock.json`) y de cada paquete en `node_modules/<paquete>/LICENSE`. PostgreSQL (licencia PostgreSQL), MinIO (imagen bitnamilegacy, solo desarrollo), Caddy (Apache-2.0) y Mailpit (MIT) se ejecutan como servicios separados.
