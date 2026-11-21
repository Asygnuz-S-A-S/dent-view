# Especificación funcional 03 — Recordatorios de citas y seguimiento de pacientes (recalls)

## Procedencia

- **Fecha de elaboración:** 2026-11-19
- **Naturaleza:** descripción funcional independiente, elaborada a partir del análisis de comportamiento de un producto de terceros licenciado bajo Business Source License 1.1 (DentalPin).
- **Garantía de limpieza:** no contiene código, esquemas, nombres de tablas/campos/clases/funciones/rutas ni textos de interfaz o plantillas del producto analizado. Redacción propia; describe QUÉ, no CÓMO.
- **Elaborado por:** agente "sala sucia".
- **Alcance:** módulo de seguimiento de pacientes ("llamar de nuevo" / recall), módulo que conecta ese seguimiento con el envío de mensajes, y las partes de agenda y horarios que lo sostienen (máquina de estados de la cita, recordatorio previo a la cita, check-in, disponibilidad).
- **Nota sobre cifras:** plazos e intervalos son valores por defecto del original o sugerencias; dent-view decide los suyos.

---

## 1. Objetivo

1. Dar a recepción una **lista de trabajo mensual** de pacientes a quienes hay que contactar para que vuelvan (control, seguimiento, repetir un estudio), con registro de cada intento de contacto.
2. Cerrar el ciclo automáticamente cuando el paciente agenda y asiste.
3. Disparar un **mensaje de recordatorio** al paciente cuando se crea un seguimiento (vía el módulo de notificaciones).
4. Enviar **recordatorios de cita** antes de la fecha y permitir un **check-in** simple del paciente.
5. Conocer la **disponibilidad** (horarios del centro y de cada profesional) para ofrecer espacios.

El seguimiento es operativo, no de mercadeo: no hace campañas masivas.

## 2. Actores y roles

| Actor | Participación |
|---|---|
| Recepcionista | Trabaja la lista, registra intentos, agenda, aplaza, cancela. |
| Radiólogo / odontólogo | Puede crear seguimientos recomendados y asignarse como responsable. |
| Tecnólogo / auxiliar | Lectura y escritura del seguimiento (en el original, igual que el odontólogo). |
| Administrador | Todo, y es el único que puede borrar definitivamente un seguimiento; configura intervalos y automatizaciones. |
| Paciente | Recibe mensajes, responde, hace check-in. |
| Doctor remitente | En dent-view, destinatario potencial de avisos sobre su paciente (ver adaptación). |

## 3. Historias de usuario

- Como **recepcionista** quiero ver cada mes la lista de pacientes por contactar, ordenada por prioridad y fecha, con contadores de vencidos y próximos.
- Como **recepcionista** quiero registrar un intento de contacto con su canal y resultado en un toque (por ejemplo, "no contestó").
- Como **recepcionista** quiero agendar la cita desde el seguimiento y que quede vinculada.
- Como **radiólogo** quiero marcar que un paciente debe volver a control en cierto mes con un motivo.
- Como **administrador** quiero definir cada cuántos meses se sugiere el seguimiento según el motivo y la categoría del procedimiento.
- Como **paciente** quiero recibir un recordatorio de mi cita con un enlace de llegada para anunciarme.
- Como **recepcionista** quiero exportar la lista a hoja de cálculo.
- Como **director** quiero ver una tasa de conversión de seguimientos.

## 4. Flujos paso a paso

### 4.1 Crear un seguimiento
1. Se elige paciente (debe ser del centro), mes objetivo (se normaliza al primer día del mes), fecha concreta opcional, motivo, prioridad (baja, normal, alta), nota opcional, profesional responsable opcional (debe pertenecer al centro) y vínculo opcional a un tratamiento (solo referencia informativa).
2. **Guarda anti-duplicados:** si el paciente ya tiene un seguimiento **activo con el mismo motivo**, se **actualiza** ese en lugar de crear otro. La respuesta es de éxito en ambos casos, pero el evento de "seguimiento creado" solo se emite si hubo inserción real.
3. Estado inicial: pendiente. Quién lo recomendó queda registrado.

### 4.2 Trabajar la lista mensual
- Vista por defecto: mes actual, estado pendiente, orden por prioridad (alta, normal, baja), luego mes objetivo, luego antigüedad, con desempate estable.
- Filtros: mes, motivo, profesional, estado, prioridad, vencidos, paciente.
- **Exclusiones obligatorias:** pacientes archivados y pacientes marcados como "no contactar" no aparecen en la lista activa ni en los contadores; sus seguimientos activos quedan en un estado aparte "requiere revisión" para que alguien decida, sin borrarse.
- Contadores: vencen esta semana, vencidos (mes objetivo anterior al actual), agendados este mes, completados este mes y **tasa de conversión** (completados ÷ (completados + cancelados) del mes, entre 0 y 1; si no hay ninguno, cero). "Este mes" se mide con el calendario de la zona horaria del centro.
- Acciones por fila: llamar (en móvil abre el marcador), registrar intento, agendar cita, aplazar, cancelar.
- Acciones masivas del diseño: exportar CSV, aplazar y reasignar en bloque (el original las planteó; implementar según prioridad).
- La exportación respeta los mismos filtros y exclusiones (tope generoso, del orden de diez mil filas).
- Diseño móvil primero: una columna, áreas táctiles amplias.

### 4.3 Registrar un intento de contacto
1. Datos: canal (teléfono, WhatsApp, SMS, correo), resultado (sin respuesta, buzón de voz, agendó, declinó, número equivocado), nota y, si agendó, la cita vinculada.
2. El seguimiento debe estar **abierto**; si está cerrado (completado o cancelado), se rechaza. Se bloquea la fila durante la operación para que dos usuarios simultáneos vean el estado correcto.
3. La cita vinculada debe ser del mismo paciente y del centro.
4. Efectos: aumenta el contador de intentos y fija la fecha del último intento.
   - Resultado "agendó" → estado "contactado y agendado" y, si hay cita, se vincula.
   - Resultado "declinó" → "contactado y declinó".
   - Resultados "sin respuesta", "buzón" o "número equivocado" → si estaba pendiente, pasa a "contactado sin respuesta"; si ya estaba en otro estado, no cambia.

### 4.4 Aplazar
Mueve el mes objetivo N meses adelante, deja el estado en pendiente y, si hay motivo, añade a las notas una línea con fecha y autor. Solo en seguimientos abiertos. Emite evento.

### 4.5 Cancelar
Pasa a cancelado, con nota opcional agregada. Solo abiertos. Emite evento.

### 4.6 Completar manualmente
Pasa a completado y sella la fecha de finalización. Solo abiertos. Emite evento.

### 4.7 Vincular cita
Manual (acción explícita) o automática.
- **Automática al crearse una cita:** solo si el paciente tiene **exactamente un** seguimiento activo candidato (pendiente o sin respuesta, mes objetivo menor o igual al mes de la cita, sin cita vinculada) y la opción está activada. Con cero o con dos o más candidatos **no hace nada** ("mejor un fallo que un vínculo equivocado"). El candidato pasa a "contactado y agendado".
- Al vincular manualmente, si el estado era pendiente o sin respuesta, pasa a "contactado y agendado".

### 4.8 Reacción a eventos de la cita
- Cita completada → el seguimiento vinculado pasa a completado.
- Cita cancelada → se desvincula y vuelve de "contactado y agendado" a pendiente.
- Paciente archivado → sus seguimientos activos (pendiente, sin respuesta, agendado) pasan a "requiere revisión".
- Supresión de datos de contacto (módulo 02) → se limpian las notas de intentos cuyo canal corresponde al dato suprimido; el seguimiento y su motivo clínico permanecen.
- Procedimiento terminado en el plan de tratamiento → **no crea nada solo**: el sistema puede **sugerir** un seguimiento según la categoría del procedimiento y los intervalos configurados; la persona debe confirmar. La sugerencia se calcula al consultar (sin guardar descartes) y solo si la opción de sugerir está activada.

### 4.9 Configuración por centro
- Intervalo en meses por motivo (por defecto del original: higiene 6, control 12, revisión de ortodoncia 1, revisión de implante 6, posoperatorio 1, seguimiento de tratamiento 3, otro 3).
- Mapa categoría de tratamiento → motivo (preventivo → higiene, ortodoncia → revisión de ortodoncia, cirugía → posoperatorio, implantes → revisión de implante).
- Dos interruptores: sugerir al completar tratamiento (activo por defecto) y vincular automáticamente al agendar (activo por defecto).
- Si el centro no tiene configuración, se crea con los valores por defecto al primer uso.

### 4.10 Mensaje de recordatorio al crear el seguimiento
1. Al crearse un seguimiento nuevo (no en la actualización por duplicado), se pide al módulo de notificaciones que envíe un recordatorio al paciente.
2. Se ejecuta **dentro de la misma transacción**: si la creación no se confirma, no se encola mensaje.
3. El contexto del mensaje: nombre del paciente, nombre del centro, motivo y mes objetivo en formato legible ("septiembre 2026").
4. Usa una **clave de no repetición** ligada al seguimiento: aunque el evento llegue dos veces, se envía una sola vez.
5. Ni este módulo ni la lista deciden canal, consentimiento ni plantilla: lo resuelve el módulo 04. Si el paciente no tiene consentimiento o canal, el mensaje queda omitido con la razón.
6. Existe una plantilla de correo por defecto en varios idiomas; el centro puede sobrescribirla.
7. Si el paciente no se encuentra, se registra el error y no se encola nada.

### 4.11 Recordatorio de cita (parte de agenda y notificaciones)
1. Un proceso periódico (el original lo ejecuta cada pocos minutos) revisa, por centro con recordatorios activos y envío automático, las citas en estado **agendada** cuyo inicio cae entre ahora y ahora + N horas (por defecto 24).
2. Para cada una, si el paciente tiene al menos un medio de contacto, encola el recordatorio con contexto: nombre, fecha, hora, profesional, centro, teléfono y dirección del centro y un **enlace de check-in**.
3. Clave de no repetición por cita: las re-ejecuciones no duplican.
4. Las citas ya confirmadas, en curso, completadas o canceladas no reciben recordatorio (el original solo recordaba las "agendadas").
5. Hay envío manual de un recordatorio individual.
6. Una preferencia explícita del paciente (por tipo, por canal, "no contactar") **siempre prevalece**, incluso sobre el envío forzado; solo la configuración del centro puede saltarse con el envío manual.

### 4.12 Check-in del paciente
1. Staff genera un código QR / enlace firmado con vigencia corta (15 minutos); el paciente lo abre sin cuenta.
2. Los enlaces enviados en recordatorios son de otro origen: viven hasta el final del día de la cita en hora del centro y **exigen un toque deliberado** del paciente (para que un antivirus que "abre" el enlace no registre llegada).
3. El enlace escaneado en el mostrador se envía solo (se prueba presencia).
4. Solo se acepta dentro de una ventana: desde dos horas antes del inicio hasta una hora después del fin.
5. El token lleva únicamente identificadores opacos; la cita es la autoridad. La clave de firma debe ser propia del check-in y obligatoria en producción.
6. Límites de frecuencia por IP y por token.
7. El check-in usa la misma máquina de estados de la cita.

### 4.13 Disponibilidad y horarios
- **Horario semanal del centro:** turnos por día de la semana.
- **Horario semanal por profesional:** turnos propios.
- **Excepciones del centro:** cierre (festivos) u horario especial por rango de fechas.
- **Excepciones del profesional:** no disponible (vacaciones, incapacidad, capacitación) u horario especial por rango de fechas.
- **Resolución de disponibilidad** (de mayor a menor prioridad): profesional no disponible; horario especial del profesional; horario semanal del profesional (recorta); cierre del centro; horario especial del centro; horario semanal del centro. Las horas se interpretan en la zona horaria del centro y se devuelven como rangos abiertos, cerrados por el centro o fuera por el profesional, uniendo los adyacentes.
- **Huecos libres:** se obtienen restando las citas ya agendadas de las ventanas abiertas, devolviendo ventanas continuas con su duración real (no bloques fijos), filtrables por duración mínima, momento del día y ventana.
- **Ocupación:** minutos reservados frente a minutos disponibles por consultorio y rango (excluye canceladas); la recepción puede verla, la higienista no.
- Si el módulo de horarios no existe, la agenda cae a un horario genérico amplio.

## 5. Estados y transiciones

### Seguimiento
| Estado | Descripción | Salidas |
|---|---|---|
| Pendiente | Por contactar | sin respuesta, agendado, declinó, cancelado, requiere revisión, completado (manual), aplazado (sigue pendiente) |
| Contactado sin respuesta | Se intentó sin éxito | agendado, declinó, cancelado, completado, requiere revisión |
| Contactado y agendado | Tiene cita | completado (cita completada), pendiente (cita cancelada), cancelado, requiere revisión |
| Contactado y declinó | El paciente no quiere | cancelado, completado |
| Completado | Final | ninguna |
| Cancelado | Final | ninguna |
| Requiere revisión | Paciente archivado o no contactar | decisión humana |

Estados **abiertos** (admiten operaciones): todos excepto completado y cancelado. Estados **activos** (cuentan en lista y contadores): pendiente, sin respuesta, agendado.

### Cita
agendada → confirmada | en sala (check-in) | cancelada | no asistió; confirmada → en sala | cancelada | no asistió; en sala → en atención | cancelada; en atención → completada | cancelada; completada, cancelada y no asistió son finales. Toda transición pasa por un único punto que emite tanto el evento específico como el genérico de cambio de estado.

## 6. Reglas de negocio y validaciones

1. Todo se filtra por centro; paciente y profesional deben pertenecer al centro, o se rechaza con error de referencia.
2. Anti-duplicado por paciente + motivo activo.
3. Operaciones sobre seguimientos cerrados se rechazan con error identificable.
4. El mes objetivo siempre se almacena como primer día del mes.
5. Fechas y "este mes" siempre en la zona horaria del centro; las citas con hora sin zona se interpretan como hora de pared del centro.
6. Pacientes archivados o "no contactar" nunca reciben mensajes ni aparecen como trabajo activo.
7. La vinculación automática es conservadora (solo un candidato).
8. Las notas de aplazamiento y cancelación se acumulan, no sobrescriben.
9. Permisos: lectura y escritura para recepción, higiene, auxiliares, odontólogos y administrador; borrado solo administrador.
10. Al desinstalar el módulo se pierde el historial de seguimientos (el original lo advierte).

## 7. Datos de negocio

- Seguimiento: paciente, mes objetivo, fecha opcional, motivo, nota, prioridad, estado, quién recomendó, profesional responsable, número de intentos, fecha del último intento, cita vinculada, referencia informativa al tratamiento y su categoría, fecha de finalización.
- Intento de contacto: seguimiento, canal, resultado, nota, fecha, quién.
- Configuración del centro: intervalos por motivo, mapa de categorías, dos interruptores.
- Mensaje encolado: contexto, clave de no repetición, evento que lo originó.
- Horarios: semanas, turnos, excepciones de centro y profesional; zona horaria del centro.

## 8. Casos borde

- Dos seguimientos activos del mismo paciente → no se vincula solo.
- Paciente con seguimiento y luego archivado → "requiere revisión", no se pierde.
- Cita cancelada que estaba vinculada → vuelve a pendiente y se anota.
- Dos usuarios registrando intentos a la vez → se serializan; el segundo ve el estado resultante del primero o, si se cerró, recibe rechazo.
- Aplazar un seguimiento cerrado → rechazado.
- Recordatorio duplicado por reintento del evento → un solo mensaje.
- Transacción revertida tras crear el seguimiento → ningún mensaje.
- Paciente sin ningún medio de contacto → se omite el recordatorio.
- Visitas "fuera de ventana" en el check-in → rechazo.
- Previsualización de enlace por un escáner de correo → no cuenta como llegada.
- Excepción de centro y de profesional que se solapan → prevalece según la jerarquía del punto 4.13.
- Cambio de hora legal: no aplica en Colombia (sin horario de verano), pero deben usarse zonas con nombre, no desfases fijos.

## 9. Criterios de aceptación

1. Crear un seguimiento duplicado (mismo paciente y motivo activo) actualiza el existente y no emite evento de creación.
2. La lista excluye pacientes archivados y "no contactar" y ordena por prioridad y mes.
3. Registrar "sin respuesta" sobre un pendiente lo pasa a "contactado sin respuesta" y suma un intento.
4. Registrar "agendó" con cita pasa a "contactado y agendado" y vincula.
5. Intentar registrar sobre un seguimiento completado devuelve rechazo.
6. Con un solo candidato, al agendar se vincula solo; con dos, no.
7. Completar la cita vinculada completa el seguimiento; cancelarla lo devuelve a pendiente.
8. Aplazar 2 meses mueve el mes objetivo y deja constancia en las notas.
9. La tasa de conversión es 0 si no hay completados ni cancelados.
10. Crear un seguimiento encola un único mensaje con motivo y mes legible; repetir el evento no lo duplica; revertir la transacción lo elimina.
11. Un paciente que opta por no recibir recordatorios no recibe ninguno ni siquiera con envío forzado.
12. El proceso de recordatorios genera un mensaje por cita agendada dentro de la ventana y ninguno para el resto de estados.
13. El check-in desde un enlace de recordatorio requiere acción deliberada; fuera de la ventana es rechazado.
14. La disponibilidad respeta la jerarquía de excepciones y devuelve huecos con su duración real.
15. Exportar produce un CSV con los mismos filtros de la lista.

## 10. Adaptación a dent-view

### Contexto
El centro de radiología recibe pacientes **remitidos**; no suele hacer "controles de higiene" sino seguimientos como: repetir estudio de control (por ejemplo, tomografía postimplante o cefalometría de seguimiento ortodóncico), entregar resultados pendientes, completar una radiografía que no se pudo realizar, o recordar al remitente que el informe está listo.

### Qué conservar
- Lista de trabajo con estados, intentos de contacto, aplazar/cancelar/completar y exclusiones por "no contactar".
- Anti-duplicado y vinculación conservadora con la cita.
- Recordatorio de cita con enlace de llegada y reglas de prevalencia de las preferencias del paciente.
- Cadena de disponibilidad (centro, profesional/tecnólogo, excepciones) y huecos libres con duración real.
- Evento en la misma transacción y clave de no repetición.

### Qué adaptar
1. **Motivos propios de radiología:** control imagenológico programado, repetición por mala calidad técnica, estudio complementario solicitado por el radiólogo, entrega de resultados/CD o enlace pendiente, preparación previa (por ejemplo, indicaciones antes de una tomografía). Intervalos por tipo de estudio definidos por el centro.
2. **Seguimiento al remitente:** además del paciente, avisar al doctor remitente cuando el informe esté listo o cuando el paciente no asistió a su estudio (con la autorización correspondiente del módulo 02).
3. **Recordatorios de cita:** incluir indicaciones de preparación (ayuno no aplica en radiología dental, pero sí retirar objetos metálicos, avisar embarazo, traer la orden del remitente). Contenido propio, sin copiar plantillas.
4. **Estado de la cita:** añadir "orden recibida, sin agendar" antes de "agendada" para las remisiones que llegan sin cita.
5. **Canales y horarios de contacto:** respetar las reglas colombianas sobre horarios y canales de contacto con consumidores y las preferencias del titular (validar con jurídica la aplicación de la normativa de contacto al consumidor y la política de tratamiento de datos).
6. **Zona horaria:** única de Colombia; mantener el manejo por nombre de zona.
7. **Teléfono:** normalizar al formato internacional con indicativo del país.

### Qué descartar
- Motivos exclusivos de odontología general (higiene, revisión de implante, ortodoncia) como valores fijos.
- Mapa categoría de tratamiento → motivo si dent-view no maneja plan de tratamiento propio.
- Sugerencia desde el plan de tratamiento (no existe en un centro de radiología independiente).
- Plantilla de recordatorio del original y su redacción.
- Desinstalar módulo sin respaldo del historial: en dent-view el historial de seguimientos debe conservarse.
