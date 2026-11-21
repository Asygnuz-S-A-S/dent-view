# Paquete para revisión legal — propiedad intelectual y datos (dent-view)

**Para:** abogado(a) de propiedad intelectual y protección de datos (Colombia)
**Producto:** dent-view, SaaS multitenant de gestión y visor de estudios de radiología odontológica (Asygnuz).
**Fecha de corte:** 2026-11-20

## 1. Qué necesitamos que valide

1. Que el proceso de **ingeniería inversa en sala limpia** usado para funciones inspiradas en *DentalPin* (licencia Business Source License 1.1, que prohíbe usar su código en un SaaS comercial de gestión dental) es suficiente para que esas funciones de dent-view sean una creación independiente y no una obra derivada.
2. Que el uso de código de **OpenDentist** (licencia MIT) y de **OHIF Viewer** (licencia MIT) cumple sus licencias (avisos de copyright conservados).
3. Riesgos de marca o competencia desleal (nombres, interfaz, textos).
4. Tratamiento de datos clínicos bajo la **Ley 1581 de 2012** y normas de historia clínica (Resolución 1995 de 1999, Resolución 839 de 2017): autorizaciones, derechos del titular, retención, transferencia internacional si el hosting está fuera de Colombia.

## 2. Componentes de terceros y su licencia

| Componente | Licencia | Uso en dent-view | Evidencia |
|---|---|---|---|
| OHIF Viewer v3.13.14 | MIT | Visor DICOM (fork con traducción al español) | `viewer/ohif` (submódulo), `viewer/patches/` |
| OpenDentist | MIT | Odontograma, plan de tratamiento, notas clínicas, laboratorio, facturación interna, reportes (adaptados) | Cabecera `// Adaptado de OpenDentist (MIT, © 2026 Clawnify)` en cada archivo adaptado |
| DentalPin | BSL 1.1 | **Ningún código.** Solo especificaciones funcionales escritas con palabras propias | `docs/sala-limpia/` |
| Orthanc | GPLv3 (servidor separado, sin modificar, comunicación por red) | Servidor DICOM | `infra/compose.yaml` |
| Better Auth, Next.js, Prisma, shadcn/ui, Tailwind | MIT / Apache-2.0 | Dependencias | `package-lock.json` |

> Punto a validar: Orthanc es GPLv3; se usa como servicio independiente, sin modificar y sin enlazarlo al código de dent-view.

## 3. Proceso de sala limpia aplicado (DentalPin)

1. **Sala sucia:** un agente analista leyó el repositorio de DentalPin y escribió 5 especificaciones funcionales (`docs/sala-limpia/01` a `05`), cada una con encabezado de procedencia y la regla explícita de no incluir código, nombres internos, esquemas ni textos de interfaz.
2. **Auditoría de las especificaciones:** se verificó que no contienen bloques de código, identificadores del repositorio, rutas ni nombres de módulos internos (solo la mención de procedencia).
3. **Separación:** se borró la copia local de DentalPin antes de implementar.
4. **Sala limpia:** otro agente, con instrucción explícita de no consultar DentalPin en ninguna forma, implementó solo desde las especificaciones; cada archivo nuevo lleva la cabecera `// Implementación independiente (sala limpia) a partir de docs/sala-limpia/<archivo>.md`.
5. **Rastro:** especificaciones, cabeceras y este documento quedan en el repositorio (y en su historial de git una vez se haga commit).

Preguntas abiertas para el abogado:
- ¿Es suficiente que ambas "salas" sean agentes de IA distintos, coordinados por la misma persona? ¿Conviene que un humano firme la separación?
- ¿Debemos conservar evidencia adicional (registros de sesión de los agentes, fechas, hashes de las especificaciones)?
- ¿Hay riesgo por similitud funcional (mismas funciones, distinto código)?
- Alternativas: licencia comercial con el titular de DentalPin, o esperar a su fecha de cambio a Apache-2.0 (4 años desde cada publicación).

## 4. Datos personales y clínicos (Ley 1581)

- Datos sensibles: historia clínica, alergias, embarazo, imágenes diagnósticas.
- Implementado: autorizaciones por finalidad y consentimiento del procedimiento (solo se agregan, guardan el texto mostrado), solicitudes del titular con plazo en días hábiles, bitácora de accesos inmutable, datos de cada paciente separados por centro (cada centro es responsable de sus datos), entrega de resultados por enlace con código temporal y vencimiento.
- A validar: textos de autorización, plazos (los actuales no descuentan festivos), retención de 15 años y archivo en discos físicos, rol de dent-view (encargado) frente a cada centro (responsable) y contrato de transmisión de datos, alojamiento fuera de Colombia (transferencia internacional), registro de bases de datos ante la SIC.

## 5. Documentos de soporte en el repositorio

- `docs/sala-limpia/README.md` y especificaciones `01`–`05`.
- `docs/seguridad/auditoria-2026-11-20.md` y `docs/seguridad/reauditoria-oleada-3.md`.
- `docs/visor-i18n-fork.md` (modificaciones a OHIF).
- `../Arquitectura-Radia-SaaS-2026-11-18.md` (arquitectura y decisiones).
