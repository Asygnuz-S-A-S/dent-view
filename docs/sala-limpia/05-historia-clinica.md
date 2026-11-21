# Especificación funcional 05 — Historia clínica del paciente: antecedentes, alergias, medicación, contactos de emergencia y alertas

## Procedencia

- **Fecha de elaboración:** 2026-11-19
- **Naturaleza:** descripción funcional independiente, elaborada a partir del análisis de comportamiento de un producto de terceros licenciado bajo Business Source License 1.1 (DentalPin).
- **Garantía de limpieza:** no contiene código, esquemas, nombres de tablas/campos/clases/funciones/rutas ni textos de interfaz o plantillas del producto analizado. Redacción propia; describe QUÉ, no CÓMO.
- **Elaborado por:** agente "sala sucia".
- **Alcance:** antecedentes médicos normalizados (alergias, medicación, enfermedades sistémicas, cirugías previas, contexto médico), contacto de emergencia, representante legal, alertas clínicas calculadas, y listas de referencia clínicas administradas por el centro con detección de interacciones y contraindicaciones.
- **Nota sobre cifras:** rangos y límites de longitud son los del original o sugerencias; dent-view decide los suyos.

---

## 1. Objetivo

1. Guardar de forma estructurada lo que el equipo clínico necesita saber **antes de exponer a un paciente a un procedimiento** (en radiología: estado de embarazo, anticoagulación, alergias a medios de contraste o anestésicos, enfermedades que afectan el estudio).
2. Mostrar **alertas visibles** en el encabezado del paciente a partir de esos datos.
3. Registrar a quién llamar en una emergencia y quién es el representante legal de un menor o de una persona sin capacidad.
4. Ofrecer **listas de referencia** (autocompletado) para estandarizar nombres de alergias, medicamentos, enfermedades y cirugías, y avisar cuando lo registrado en un paciente implique una **interacción medicamentosa** o una **contraindicación**.
5. Nunca perder historia: todo borrado es una baja lógica.

## 2. Actores y roles

| Actor | Permisos en el original |
|---|---|
| Administrador | Todo. |
| Odontólogo / radiólogo | Lectura y escritura de antecedentes médicos; lectura de contacto de emergencia. Gestiona listas de referencia (lectura y escritura). |
| Higienista | Lectura de antecedentes; **sin** escritura. |
| Auxiliar / tecnólogo | Lectura (según política del centro). |
| Recepcionista | Solo contacto de emergencia (y, según la configuración del centro, ni siquiera eso). Lectura de listas de referencia. |

Hay dos permisos distintos: antecedentes médicos (leer/escribir) y contacto de emergencia (leer/escribir). La separación existe porque el dato es sensible y debe quedar restringido a roles clínicos.

## 3. Historias de usuario

- Como **tecnólogo** quiero ver, al abrir al paciente, alertas rojas de embarazo, anticoagulantes o alergias graves antes de iniciar el estudio.
- Como **radiólogo** quiero registrar los antecedentes completos del paciente en una sola pantalla y guardarlos juntos.
- Como **radiólogo** quiero que al escribir el nombre de un medicamento se me sugieran los del catálogo del centro.
- Como **radiólogo** quiero que el sistema me avise si dos medicamentos del paciente interactúan o si una enfermedad contraindica un medicamento.
- Como **recepcionista** quiero ver a quién llamar si el paciente se descompensa en la sala de espera.
- Como **recepcionista** quiero registrar el representante legal de un menor para pedir su autorización.
- Como **administrador** quiero mantener el catálogo del centro: agregar, renombrar y retirar entradas, y definir pares de interacciones y contraindicaciones con una nota de riesgo.
- Como **auditor** quiero que cada modificación quede registrada y que nada se borre físicamente.

## 4. Flujos paso a paso

### 4.1 Ver los antecedentes
El sistema devuelve en un solo bloque: alergias activas, medicamentos activos, enfermedades sistémicas activas, cirugías previas activas, y el contexto médico (banderas) con fecha y autor de la última actualización. Las filas dadas de baja no se listan, pero siguen siendo consultables por identificador para el historial.

### 4.2 Guardar los antecedentes (reemplazo completo)
1. El formulario envía **todo el bloque** de una vez: listas completas más el contexto médico.
2. El sistema, de forma **atómica**, da de baja lógica todas las filas activas anteriores del paciente en las cuatro listas, inserta como nuevas las enviadas y actualiza (o crea) el contexto médico, registrando fecha y autor.
3. Resultado determinista: lo que se envía es lo que queda activo; lo anterior permanece archivado.
4. Se emite un evento de "antecedentes actualizados" que alimenta la línea de tiempo del paciente, y el cliente avisa a otras partes de la pantalla (alertas, avisos de interacción) para que se actualicen sin recargar.
5. Si algún dato es inválido (por ejemplo, una gravedad de alergia fuera de vocabulario), **toda la operación se rechaza**.

### 4.2.1 Operaciones individuales
Además del bloque completo existen altas, ediciones y bajas lógicas por elemento (alergia, medicamento, enfermedad, cirugía) y la edición del contexto médico por separado. Un elemento inexistente o de otro centro responde "no encontrado". Todas verifican que el paciente pertenezca al centro.

### 4.3 Contacto de emergencia
Uno por paciente. Se crea o actualiza (upsert). Si existía y estaba dado de baja, se **reactiva** reutilizando el mismo registro. Baja lógica con eliminar.

### 4.4 Representante legal
Uno por paciente; para menores o personas sin capacidad legal. Mismo comportamiento de upsert, reactivación y baja lógica. Incluye identificación, parentesco, teléfono, correo, dirección y notas. Se puede eliminar; si no existe, "no encontrado".

### 4.5 Alertas calculadas
Cada vez que se consultan, se calculan (no se guardan) a partir de los datos activos:
| Condición | Gravedad | Contenido |
|---|---|---|
| Alergia con gravedad alta o crítica | La misma de la alergia | Nombre de la alergia y la reacción |
| Embarazo | Alta | Indica semanas si se conocen |
| Lactancia | Media | — |
| Anticoagulantes | **Crítica** | Medicamento y valor de coagulación (INR) si existen |
| Reacción adversa previa a anestesia | **Crítica** | Detalles |
| Enfermedad sistémica marcada como crítica | Alta | Nombre y notas |
Alergias de gravedad baja o media **no** generan alerta. Si el paciente no tiene contexto médico, solo se evalúan las alergias.

Presentación: banner en el encabezado con chips por gravedad (crítica, alta, media, baja se distinguen por color y no solo por color), con colapso/expansión y contador "y N más". Las alertas se refrescan tras cada guardado.

### 4.5.1 Banderas de interacción y contraindicación
1. Considera solo los **medicamentos y enfermedades activos del paciente que estén enlazados a una entrada del catálogo**. Las entradas escritas a mano sin enlace **no** se comparan (no se hace coincidencia aproximada de texto).
2. Si hay dos o más medicamentos enlazados, busca pares de interacción activos del centro cuyo ambos medicamentos estén presentes; produce una bandera de tipo "interacción" con la nota de riesgo y los dos nombres.
3. Si hay enfermedad y medicamento enlazados, busca contraindicaciones activas del centro y produce una bandera "contraindicación" con la nota y los nombres.
4. Se muestran como chips adicionales en el encabezado del paciente y se refrescan tras cada guardado.

### 4.6 Catálogo de referencia (administrado por el centro)
- Cuatro listas planas: alergias, medicamentos, enfermedades, cirugías.
- **Búsqueda** por texto contenido en el nombre, sin distinguir mayúsculas, ordenada alfabéticamente, con tope de resultados (25 por defecto); por defecto solo activos.
- **Crear:** el nombre debe ser único en el centro sin distinguir mayúsculas; si existe, conflicto.
- **Renombrar:** igual regla de unicidad frente a otras entradas.
- **Retirar:** baja lógica (el elemento deja de sugerirse, pero los registros de pacientes que lo usaron siguen siendo válidos).
- **Interacciones** (medicamento × medicamento): el par se guarda en un orden canónico, de modo que A-B y B-A son el mismo; no se permite un medicamento consigo mismo; ambos deben existir en el centro; un par repetido es conflicto; incluye nota de riesgo obligatoria; activable/desactivable.
- **Contraindicaciones** (enfermedad × medicamento): ambos deben existir en el centro; par único; nota de riesgo; activable/desactivable.
- Todo acceso por identificador se filtra por centro (otro centro: "no encontrado").

### 4.7 Integración suave con los antecedentes
Cada campo de nombre de alergia, medicamento, enfermedad o cirugía puede ser un buscador conectado al catálogo; si el catálogo no está instalado, es un campo de texto libre y la entrada no queda enlazada. Los enlaces con el catálogo son **sueltos** (sin dependencia dura), de modo que los antecedentes siguen funcionando aunque el catálogo desaparezca.

## 5. Reglas de negocio y validaciones

1. Todo filtra por centro; el paciente debe pertenecer al centro.
2. **Nunca borrar físicamente** datos del paciente: las bajas son lógicas; las listas muestran solo activos; la consulta puntual devuelve incluso archivados.
3. Gravedad de alergia: vocabulario cerrado (baja, media, alta, crítica). Cualquier otro valor se rechaza (de lo contrario no generaría alerta y quedaría silenciado). Las filas viejas con valores antiguos siguen legibles, pero reenviarlas en un reemplazo completo se rechaza hasta corregirlas.
4. Nombre obligatorio en alergia, medicamento y enfermedad; procedimiento obligatorio en cirugía.
5. Semana de embarazo entre 1 y 42; valor de coagulación entre 0 y 20.
6. Campos con tope de longitud (nombre 100; procedimiento 200; teléfono 20; observaciones largas libres; detalles de anestesia 500).
7. Un campo opcional vaciado en el formulario llega como cadena vacía y debe interpretarse como "sin valor" (semana, valor de coagulación, fecha de última medición, fecha de cirugía, correos), no como error.
8. Correo del contacto o representante: formato válido si se informa.
9. Teléfono del contacto y del representante: obligatorio.
10. Parentesco: obligatorio en el representante legal; opcional en el contacto.
11. Cada escritura se **audita** (es la superficie más sensible junto con facturación): fecha, autor, evento.
12. Hay permisos separados para antecedentes y para contacto de emergencia.
13. El catálogo: un nombre repetido (ignorando mayúsculas) es conflicto, no error genérico.
14. Las banderas del catálogo se calculan solo con entradas enlazadas, activas y del centro.

## 6. Estados y transiciones

| Entidad | Estados | Transiciones |
|---|---|---|
| Alergia, medicamento, enfermedad, cirugía, contacto, representante | Activo, archivado | activo → archivado (baja o reemplazo); contacto y representante: archivado → activo por reactivación en nuevo guardado |
| Entrada del catálogo / interacción / contraindicación | Activa, inactiva | activa ↔ inactiva |
| Alerta | No se guarda: se calcula | — |

## 7. Datos de negocio

- **Contexto médico (uno por paciente):** embarazo y semana; lactancia; anticoagulantes, medicamento, valor de coagulación y fecha de la última medición; fumador y frecuencia; consumo de alcohol; bruxismo; reacciones adversas previas a anestesia y su detalle; fecha y autor de la última actualización.
- **Alergia:** nombre, tipo, gravedad, reacción, notas, enlace opcional al catálogo.
- **Medicamento actual:** nombre, dosis, frecuencia, fecha de inicio, notas, enlace opcional.
- **Enfermedad sistémica:** nombre, tipo, fecha de diagnóstico, si está controlada, si es crítica, medicación asociada (texto), notas, enlace opcional.
- **Cirugía previa:** procedimiento, fecha, complicaciones, notas, enlace opcional.
- **Contacto de emergencia:** nombre, parentesco, teléfono, correo, indicador de si también es representante legal.
- **Representante legal:** nombre, parentesco, documento de identidad, teléfono, correo, dirección, notas.
- **Catálogo:** nombre y estado por lista; pares de interacción y contraindicación con nota de riesgo.

## 8. Casos borde

- Paciente sin contexto médico: las alertas muestran solo alergias graves.
- Guardado con lista vacía: archiva todo lo previo y deja el conjunto activo vacío.
- Dos guardados simultáneos: el resultado final debe ser uno de los dos completos, nunca una mezcla.
- Alergia con gravedad antigua no válida reenviada: rechazo con indicación.
- Interacción entre un medicamento enlazado y otro escrito a mano: sin bandera (limitación asumida).
- Retiro de una entrada del catálogo usada por pacientes: los pacientes conservan su registro y las banderas dejan de calcularse si el par se desactiva.
- Catálogo no instalado: formularios libres, sin banderas.
- Reactivación del contacto de emergencia archivado: usa el mismo registro, vuelve a activo.
- Campos opcionales vaciados: aceptados como "sin valor".
- Paciente de otro centro: "no encontrado" en todas las operaciones.
- Representante legal inexistente al eliminar: "no encontrado".
- Edad: el original no calcula obligatoriedad de representante por edad; es regla manual.

## 9. Criterios de aceptación

1. Guardar los antecedentes deja activos exactamente los elementos enviados y archivados los anteriores, de forma atómica.
2. Ninguna operación elimina físicamente filas; las consultas por lista muestran solo activos.
3. Una alergia con gravedad "alta" genera alerta; una con gravedad "media" no.
4. Un paciente con anticoagulantes muestra alerta crítica con el medicamento y el INR si existen.
5. Un paciente embarazado con 20 semanas muestra alerta alta con ese dato.
6. Una gravedad fuera del vocabulario cierra el guardado con error y no guarda nada.
7. Dejar vacía la semana de embarazo o el INR no produce error.
8. Un rol sin permiso de escritura no puede modificar antecedentes pero puede leerlos si tiene lectura.
9. Un rol sin permiso de contacto de emergencia no ve ese dato.
10. Un paciente con dos medicamentos enlazados que forman un par de interacción activo muestra una bandera con ambos nombres y la nota de riesgo; con una entrada sin enlace, no.
11. Una enfermedad y un medicamento enlazados con contraindicación activa muestran bandera de contraindicación.
12. Crear en el catálogo un nombre que ya existe (aunque cambien las mayúsculas) devuelve conflicto.
13. Registrar el par A-B y luego B-A devuelve conflicto; registrar A con A devuelve error de validación.
14. Retirar una entrada del catálogo la saca de las sugerencias pero no de los pacientes que la usaron.
15. Las alertas del encabezado se actualizan tras guardar sin recargar la página.
16. Cada guardado queda registrado con autor y fecha, y se emite el evento hacia la línea de tiempo.
17. Un recurso de otro centro responde "no encontrado".
18. Reactivar un contacto archivado conserva un único contacto por paciente.

## 10. Adaptación a dent-view

### Contexto
En radiología odontológica la historia clínica es **breve y orientada a la seguridad del estudio**, no al tratamiento restaurador. El centro recibe al paciente con una orden del remitente y necesita confirmar condiciones antes de exponerlo a radiación o a contraste.

### Qué conservar
- Bloque de antecedentes con guardado atómico y baja lógica (nunca borrado físico).
- Contexto médico con embarazo, lactancia, anticoagulantes y reacción a anestesia (útil si se usa anestesia tópica o sedación en niños).
- Alergias con gravedad y alerta visible; enfermedades críticas.
- Contacto de emergencia y representante legal, con upsert y reactivación.
- Permisos separados para clínica y para contacto de emergencia.
- Alertas calculadas (no almacenadas) y su refresco inmediato.
- Catálogo con autocompletado y enlace suelto; banderas de interacción/contraindicación como mejora opcional.

### Qué añadir específico de radiología
1. **Tamizaje previo al estudio** (cuestionario corto firmado): embarazo o sospecha, estudios radiográficos recientes, implantes o dispositivos metálicos, marcapasos y prótesis relevantes, alergia a contraste si se usa, claustrofobia (tomografía), capacidad de permanecer inmóvil, uso de protección plomada.
2. **Datos del doctor remitente y motivo de la remisión** asociados a la orden (se detallan en el módulo 01).
3. **Dosis/estudios previos** realizados en el centro (para trazabilidad de exposición), si el centro lo exige.
4. **Consentimiento informado del procedimiento** firmado por el paciente o su representante (ver módulo 02), vinculado a la historia.
5. **Menores:** representante legal obligatorio cuando el paciente sea menor (regla por fecha de nacimiento); adolescente con su asentimiento según la política del centro.
6. **Identificación colombiana:** tipo y número de documento (tarjeta de identidad, cédula, pasaporte, permiso especial, etc.) en el representante, no un identificador de otra jurisdicción.
7. **Aseguradora / entidad responsable del pago** y número de autorización, si el centro atiende por convenios (fuera del alcance de este módulo, pero relacionado).
8. **Reserva y acceso:** la historia clínica es reservada; el acceso debe registrarse (incluyendo **lecturas**, que el original no audita) y solo para personal asistencial autorizado. Debe sujetarse a la normativa colombiana de historia clínica y de datos sensibles (validar con asesoría jurídica) y a los plazos de conservación definidos en el módulo 02.
9. **Alertas para el informe:** que las alertas relevantes (embarazo, implantes metálicos) puedan citarse en el informe radiológico cuando afecten la interpretación.

### Qué descartar
- Campos propios de la odontología general que no afecten el estudio (hábito de fumar, bruxismo, alcohol) pueden omitirse o dejarse opcionales; el original los registra como contexto.
- Cirugías previas como lista independiente: mantener solo si el radiólogo las usa (cirugías maxilofaciales, implantes, ortognáticas son relevantes).
- Lista de medicación detallada con dosis y frecuencia: puede simplificarse a "medicación relevante".
- Catálogo de interacciones/contraindicaciones: opcional; no es crítico para radiología salvo contraste y anticoagulantes.
- La ausencia de reglas de edad para representante legal en el original: dent-view debe automatizarlas.
- Mensajes y etiquetas de la interfaz del original (redactar propias).
