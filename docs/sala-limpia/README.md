# Proceso de sala limpia (clean room) para dent-view

## Propósito

dent-view necesita funciones que existen en un producto de terceros, DentalPin, publicado bajo Business Source License 1.1. Esa licencia prohíbe reutilizar su código en un SaaS dental comercial. Para aprovechar el **conocimiento funcional** sin **copiar expresión protegida**, se aplica un proceso de ingeniería inversa en sala limpia.

## Los tres pasos

1. **Sala sucia (análisis).** Un agente analista lee el producto de origen (código, documentación y manifiestos) en modo solo lectura, sin ejecutarlo, y redacta especificaciones funcionales con palabras propias. Entiende el comportamiento; no transcribe la implementación.
2. **Especificación (barrera).** Las especificaciones de esta carpeta son el único canal permitido entre ambos lados. Describen QUÉ hace cada función, las reglas de negocio, los estados, los casos borde y los criterios de aceptación verificables, y proponen la adaptación a dent-view. No incluyen código, pseudocódigo, nombres de tablas, columnas, clases, funciones, rutas o endpoints, estructuras de archivos, textos de interfaz ni de plantillas, ni nombres de variables del producto de origen.
3. **Sala limpia (implementación).** El equipo implementador construye las funciones en dent-view a partir **únicamente** de estas especificaciones y de sus propias decisiones de diseño, nombres, esquemas, interfaz y textos.

## Reglas obligatorias

- **Los implementadores no acceden a DentalPin** en ninguna forma: ni a su repositorio, ni a su documentación, ni a capturas, ni a su demostración, ni a su código compilado. Tampoco usan agentes o asistentes con acceso a él durante la implementación.
- Si surge una duda funcional, se **pregunta al analista de sala sucia**, quien responde únicamente ampliando la especificación (sin código ni textos literales). La pregunta y la respuesta quedan registradas.
- Los nombres de datos, módulos y pantallas de dent-view se definen de forma independiente; no deben imitar los del origen.
- Las cifras marcadas como "sugerido" o "valor por defecto" son decisiones de producto de dent-view; se pueden cambiar libremente.
- Las referencias normativas colombianas son orientativas y **deben validarse con asesoría jurídica** antes de implementarse.
- Se conserva evidencia del proceso: fecha de las especificaciones, quién las elaboró, quién implementó y las consultas realizadas.
- Cualquier uso o contacto de un implementador con el producto de origen debe reportarse de inmediato; en ese caso se reasigna la función a otra persona.

## Especificaciones

| N.º | Archivo | Contenido |
|---|---|---|
| 01 | `01-documentos-e-informes.md` | Documentos PDF con membrete, ciclo de vida, informe radiológico, entrega al remitente y al paciente. |
| 02 | `02-consentimientos-y-proteccion-de-datos.md` | Autorizaciones por finalidad, solicitudes del titular, retención, supresión parcial, incidentes, exportación y bitácora de actividad; adaptación a la Ley 1581 de 2012. |
| 03 | `03-recordatorios-y-seguimiento.md` | Seguimiento de pacientes (recalls), recordatorios de cita, check-in, horarios y disponibilidad. |
| 04 | `04-notificaciones.md` | Pasarela de mensajes, plantillas, preferencias, canales correo/SMS/WhatsApp, disparo por eventos. |
| 05 | `05-historia-clinica.md` | Antecedentes, alergias, medicación, contactos de emergencia, alertas y catálogo clínico de referencia. |

Cada especificación incluye: encabezado de procedencia, objetivo, actores, historias de usuario, flujos, reglas y validaciones, estados y transiciones, datos de negocio, casos borde, criterios de aceptación y la sección "Adaptación a dent-view" (qué encaja en un centro de radiología odontológica colombiano que recibe pacientes remitidos y qué descartar).

## Orden sugerido de implementación

1. 05 Historia clínica (base de seguridad del paciente).
2. 02 Consentimientos y bitácora (requisito legal previo a tratar datos).
3. 01 Documentos e informes (producto principal hacia el remitente).
4. 04 Notificaciones (canal de entrega).
5. 03 Recordatorios y seguimiento (depende de agenda y notificaciones).
