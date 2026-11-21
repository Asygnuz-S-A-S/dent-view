# Especificación funcional 01 — Documentos e informes con membrete

## Procedencia

- **Fecha de elaboración:** 2026-11-19
- **Naturaleza:** descripción funcional independiente, elaborada a partir del análisis de comportamiento de un producto de terceros licenciado bajo Business Source License 1.1 (DentalPin).
- **Garantía de limpieza:** este documento no contiene código, esquemas de datos, nombres de tablas, campos, clases, funciones, rutas ni textos de interfaz o de plantillas del producto analizado. Todo está redactado con palabras propias y describe QUÉ debe hacer el sistema, no CÓMO lo hace el original.
- **Elaborado por:** agente "sala sucia" (análisis de ingeniería inversa en sala limpia).
- **Destinatario:** equipo de implementación "sala limpia" de dent-view, que no debe acceder al producto de origen.
- **Nota sobre cifras:** los números (plazos, tamaños, límites) que aparecen como "valor sugerido" son decisiones de producto a confirmar por dent-view; no son requisitos heredados.

---

## 1. Objetivo del módulo

Permitir que el centro genere documentos formales en PDF con la identidad visual de la clínica (membrete: logotipo, nombre, dirección, teléfono, correo y número de registro/habilitación), asociados a un paciente, con un ciclo de vida controlado (borrador, emitido, archivado), con descarga posterior de la copia exacta emitida y con rastro de quién y cuándo lo emitió.

El producto de referencia cubría cuatro tipos de documento clínico (fórmula médica, certificado, carta de remisión y solicitud de radiología). Para dent-view el documento central es el **informe radiológico**, y los demás tipos son variantes que comparten el mismo mecanismo.

## 2. Actores y roles

| Actor | Qué hace con los documentos |
|---|---|
| Administrador del centro | Configura el membrete, ve todos los documentos, puede archivar. |
| Radiólogo / odontólogo radiólogo | Redacta, firma y emite informes y certificados. |
| Tecnólogo / auxiliar de imagenología | Puede consultar y descargar documentos emitidos; no emite ni edita contenido clínico. |
| Recepcionista | Consulta y descarga documentos emitidos para entregarlos; no edita contenido clínico. |
| Doctor remitente (externo) | Destinatario del informe; no inicia sesión necesariamente (ver sección 12). |
| Paciente | Destinatario de su copia. |

Permisos mínimos del producto de referencia (útil como patrón): un permiso de lectura y uno de escritura por módulo; administrador total, profesional clínico lectura+escritura, auxiliar solo lectura. El membrete se gobierna con los permisos de administración de la clínica, no con los del módulo.

## 3. Historias de usuario

- Como **radiólogo** quiero redactar un informe sobre un estudio de un paciente y guardarlo como borrador para terminarlo después.
- Como **radiólogo** quiero emitir el informe en PDF con el membrete del centro y mi identificación profesional para entregarlo al doctor remitente.
- Como **recepcionista** quiero buscar los documentos de un paciente por tipo y estado y descargar el PDF emitido para entregarlo o enviarlo.
- Como **administrador** quiero subir el logotipo y definir los datos del membrete para que todos los documentos salgan con la imagen del centro.
- Como **administrador** quiero archivar un documento emitido por error sin destruir su rastro.
- Como **doctor remitente** quiero recibir el informe con los datos del paciente y del estudio de forma clara para decidir el tratamiento.
- Como **auditor interno** quiero saber quién emitió cada documento y cuándo.

## 4. Flujos paso a paso

### 4.1 Crear un documento (borrador)
1. El usuario con permiso de escritura elige el paciente (búsqueda por nombre/identificación en el centro actual).
2. Elige el tipo de documento.
3. Escribe un título descriptivo (límite sugerido: 200 caracteres) y completa los campos propios del tipo.
4. Guarda. El sistema valida que el paciente pertenezca al mismo centro; si no, rechaza con un error de validación.
5. El documento queda en estado borrador y puede editarse libremente.

### 4.2 Emitir (generar el PDF)
1. El usuario abre un borrador y solicita la emisión, indicando el idioma de los rótulos (por defecto español).
2. El sistema compone la página con: membrete, título del tipo, bloque del paciente (nombre, fecha de nacimiento, identificador, fecha y hora de emisión en la zona horaria del centro, nombre de quien emite), el cuerpo propio del tipo y un pie con atribución e identificación del centro.
3. El PDF se construye completo **antes** de cambiar el estado. Si la composición falla, el documento sigue siendo borrador y no se anuncia nada.
4. Con el PDF listo, se guarda el archivo en almacenamiento privado separado por centro, se marca el documento como emitido y se registra un evento interno de "documento emitido" (con tipo, paciente, título y autor) para que la bitácora/línea de tiempo del paciente lo registre.
5. El sistema devuelve el documento actualizado.

### 4.3 Descargar
1. Con permiso de lectura, el usuario pide la descarga.
2. Si el documento nunca fue emitido: error de conflicto de estado.
3. Si fue emitido pero el archivo no se encuentra: error "no encontrado" indicando que debe re-emitirse.
4. Si todo está bien, se entrega el PDF como adjunto descargable con nombre de archivo limpio (sin caracteres residuales; el original tuvo un defecto donde el nombre terminaba con un carácter extra en Windows).

### 4.4 Archivar
Quien tenga escritura puede archivar. Es una baja lógica: el documento deja de aparecer en listados por defecto pero permanece íntegro. Nunca se borra físicamente.

### 4.5 Configurar membrete
1. El administrador abre la configuración de membrete.
2. Puede sobrescribir: nombre, dirección, teléfono, correo, número de registro y logotipo.
3. Todo campo vacío cae automáticamente al dato del perfil general del centro (nombre, dirección, teléfono, correo, identificación tributaria como número de registro).
4. El logotipo se guarda incrustado (imagen en línea); se recomienda PNG cuadrado y ligero (valor sugerido: menor de 512×512 px) y se muestra arriba a la izquierda.

### 4.6 Listar y filtrar
Listado paginado (valor sugerido: 20 por página, máximo 100), filtrable por paciente, tipo y estado, ordenado de más reciente a más antiguo con un desempate determinista para que la paginación no repita ni omita filas.

## 5. Contenido por tipo de documento

### 5.1 Fórmula / prescripción (referencia; en dent-view solo si el centro prescribe)
Diagnóstico en texto libre; lista de medicamentos, cada uno con nombre, dosis, frecuencia, duración y notas; notas generales. Los medicamentos son texto libre, sin catálogo. Si no hay medicamentos, el PDF muestra un marcador vacío en lugar de una tabla.

### 5.2 Certificado médico
Diagnóstico, descripción, recomendaciones, fecha de inicio y fecha de fin de vigencia (ambas opcionales; una cadena vacía equivale a "sin fecha").

### 5.3 Carta de remisión
Destinatario, especialidad, motivo, resumen clínico y notas.

### 5.4 Solicitud de radiología
Tipo de examen, región anatómica, pregunta clínica y notas. En dent-view esto es lo que **llega** del doctor remitente (ver sección 12).

### 5.5 Informe radiológico (nuevo para dent-view; no existía en el original)
Ver sección 12; sigue el mismo ciclo de vida.

El contenido de cada tipo se valida contra la forma del tipo declarado; un contenido que no encaja se rechaza. Las fechas se normalizan a texto de fecha estándar. El texto que escribe el usuario se reproduce tal cual (escapado para que no pueda inyectar formato); solo se traducen los rótulos fijos.

## 6. Reglas de negocio y validaciones

1. Todo documento pertenece a un único centro; toda consulta se filtra por centro. Un usuario nunca ve ni descarga documentos de otro centro.
2. El paciente debe pertenecer al centro del usuario al crear.
3. El tipo es de un conjunto cerrado; título obligatorio con tope de longitud.
4. El PDF se genera siempre desde los datos actuales de borrador, del centro y del paciente en el momento de emitir.
5. Emitir no publica el evento si el archivo no se escribió correctamente.
6. El archivo se guarda en una ruta que no sea pública; la descarga siempre pasa por autorización.
7. Idiomas de rótulos: el original soportaba diez idiomas; dent-view requiere español y, opcionalmente, inglés. Árabe implicaba escritura de derecha a izquierda (descartar).
8. Las identificaciones inválidas (formato de id incorrecto) se rechazan antes de consultar.
9. El nombre del emisor se imprime solo si el documento tiene autor conocido.
10. Si el centro no existe en el contexto, el membrete queda vacío sin romper la generación.

## 7. Estados y transiciones

| Estado | Significado | Transiciones permitidas |
|---|---|---|
| Borrador | Editable, sin archivo | a Emitido; a Archivado |
| Emitido | Tiene PDF almacenado | a Archivado (y re-emisión, ver abajo) |
| Archivado | Baja lógica | ninguna (recuperación solo por administrador, a decidir) |

**Observación del original:** permitía editar y re-emitir un documento ya emitido, sobrescribiendo el archivo. Eso es riesgoso para documentos con valor legal. **Requisito para dent-view:** un informe firmado es inmutable; las correcciones se hacen con una nueva versión que referencia a la anterior (adenda o sustitución), conservando ambas y marcando cuál es la vigente.

## 8. Datos de negocio manejados

- Documento: centro, paciente, tipo, título, estado, contenido estructurado según el tipo, referencia al archivo emitido, autor, fechas de creación y modificación.
- Configuración de membrete por centro: nombre, dirección, teléfono, correo, número de registro, logotipo; todos opcionales con respaldo en el perfil del centro.
- Etiquetas de interfaz del PDF por idioma.
- Archivo PDF (binario) en almacenamiento por centro.

## 9. Casos borde

- Paciente de otro centro: rechazo de validación, no creación.
- Documento inexistente o de otro centro: "no encontrado".
- Descarga de borrador: conflicto; descarga con archivo perdido: no encontrado con indicación de re-emitir.
- Logotipo ausente, muy grande o corrupto: se omite o se escala dentro de un alto/ancho máximo; nunca debe impedir emitir.
- Textos muy largos o con caracteres especiales/markup: se escapan; los bloques deben ajustarse al ancho de página (en ambos sentidos de escritura) en lugar de cortarse.
- Paciente sin fecha de nacimiento: se muestra un guion.
- Zona horaria del centro inválida: usar UTC.
- Fechas "solo día": interpretarlas como fecha local, no como medianoche UTC (el original mostró la fecha corrida un día en zonas al oeste de UTC; Colombia es UTC-5 y se vería afectada).
- Listados con filas empatadas por fecha: orden estable para no duplicar filas entre páginas.
- Dos usuarios emitiendo el mismo borrador a la vez: el resultado debe ser un único documento emitido coherente.

## 10. Criterios de aceptación

1. Dado un paciente del centro, al crear un documento válido queda en borrador y aparece en el listado.
2. Dado un paciente de otro centro, la creación falla con error de validación.
3. Dado un borrador, al emitir se genera un PDF con membrete (con el logotipo si existe), datos del paciente, cuerpo del tipo, fecha/hora de emisión en la zona del centro y nombre de quien emite.
4. Si la generación del PDF falla, el estado sigue siendo borrador y no hay evento.
5. Tras emitir, la descarga entrega exactamente el PDF emitido; descargar un borrador da conflicto.
6. Campos vacíos del membrete usan los datos del perfil del centro.
7. Archivar oculta el documento del listado por defecto y no lo elimina.
8. Un usuario de otro centro no puede listar, ver ni descargar el documento.
9. El nombre del archivo descargado no contiene caracteres residuales en ningún sistema operativo.
10. La paginación nunca repite ni omite documentos con la misma fecha.
11. Se registra en bitácora quién emitió y cuándo.
12. Un informe firmado no puede modificarse; solo versionarse.

## 11. Relación con otros módulos

- **Pacientes:** fuente de los datos demográficos del encabezado.
- **Bitácora de actividad:** recibe el evento de documento emitido.
- **Protección de datos:** al atender una solicitud de supresión, los documentos clínicos emitidos se **conservan** (son parte de la historia clínica) y el sistema debe declararlo explícitamente en el resultado de la supresión.
- **Configuración del centro:** de ahí viene el respaldo del membrete.

## 12. Adaptación a dent-view

### Contexto
dent-view es un centro de radiología odontológica colombiano que recibe pacientes **remitidos** por odontólogos externos, realiza el estudio (periapical, panorámica, cefalometría, tomografía de haz cónico, etc.) y entrega el **informe radiológico** al doctor remitente y al paciente.

### Qué conservar
- Mecanismo de membrete con respaldo al perfil del centro.
- Ciclo borrador, emisión, archivo; descarga de la copia exacta.
- Evento de emisión hacia la bitácora.
- Aislamiento por centro y generación del PDF antes de cambiar de estado.

### Qué construir de más (no existía)
1. **Informe radiológico como tipo principal**, con: datos del paciente; **datos del doctor remitente** (nombre, registro profesional, contacto, clínica); motivo de la remisión y pregunta clínica; tipo de estudio, técnica, región, fecha del estudio, equipo/ parámetros si aplica; hallazgos (texto estructurado por región o por pieza dental); impresión diagnóstica / conclusiones; recomendaciones; referencia a las imágenes del estudio; datos del radiólogo informante.
2. **Firma del profesional:** nombre completo, profesión/especialidad, número de tarjeta profesional y, si aplica, registro en el sistema de talento humano en salud; imagen de firma o firma electrónica con sello de fecha y hora. Verificar con asesoría legal los requisitos de firma electrónica y de contenido mínimo del informe (normativa de mensajes de datos y firmas electrónicas; normas de historia clínica).
3. **Estados adicionales:** borrador, pendiente de firma/revisión, firmado/emitido, entregado (con registro de a quién y por qué canal), corregido (con versión vigente), archivado.
4. **Entrega:** enlace seguro con vencimiento o envío por correo al doctor remitente y al paciente, con registro de apertura/descarga; control de que el paciente solo accede a lo suyo.
5. **Código de verificación** (por ejemplo, QR) en el PDF que permita comprobar autenticidad y versión vigente.
6. **Identificación del estudio:** número de orden/consecutivo del centro.
7. **Conservación:** los informes forman parte de la historia clínica; los plazos de conservación se definen en el módulo 02.
8. **Solicitud de radiología entrante:** en dent-view es el insumo que trae el remitente (orden con tipo de examen, región y pregunta clínica); se registra como orden de servicio y de ella nace el informe.

### Qué descartar
- Soporte de diez idiomas y derecha-a-izquierda (basta español, opcional inglés).
- Fórmulas médicas y cartas de remisión salientes, salvo que el centro decida prescribir o remitir; de lo contrario omitirlos.
- Uso de identificador interno del paciente impreso como identificación: en Colombia debe mostrarse el tipo y número de documento de identidad.
- Etiquetas y texto del PDF del original: dent-view debe redactar su propio contenido y diseño.
- La posibilidad de re-emitir sobrescribiendo (ver sección 7).
