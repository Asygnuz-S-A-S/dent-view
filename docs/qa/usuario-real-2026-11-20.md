# QA como usuario real, dent-view, 20/11/2026

Para: dueño del producto. Método: navegador interno de Orca, escritorio 1366x850 y iPhone 15, usuarios `admin@radex.demo`, `doctor@pepito.demo`, `superadmin@dentview.demo`. No se modificó código. Capturas en `docs/qa/evidencias/usuario-real/` (referenciadas por número).

Nota de contexto: otro proceso de QA creó órdenes y pacientes ("Qa Paciente…") en el mismo centro mientras yo trabajaba, por eso aparecen órdenes #0005 a #0012 que no son mías. Mis datos: paciente Juliana Pérez, orden #0004, informe #0004, cuenta FC-0004.

## Veredicto general

El flujo de punta a punta funciona y es coherente: se pudo registrar, ordenar, agendar, marcar llegada, informar, cobrar, entregar al paciente, ver como doctor y como dueño. Los textos están en buen español y las validaciones básicas existen. Los problemas están en (1) enlaces rotos entre pasos (orden, estudio, cita, informe, cuenta de cobro no se conectan con un botón), (2) acciones irreversibles sin confirmación, (3) el visor en inglés y sin camino de regreso evidente, (4) tablas cortadas en pantallas pequeñas y (5) conceptos internos que un recepcionista no entiende ("Asignado", "Asignar", "OSS", "CT").

## Tarea 1. Recepcionista/admin, mañana típica

Completada: sí. Pasos: unos 40 clics en total (paciente 9, orden 10, cita 9, llegada 5, más navegación).

Resumen del recorrido:
- Pacientes, Nuevo paciente, llenar 4 campos, Guardar. Éxito con aviso "Paciente creado" y paso directo a la ficha (capturas 01, 02).
- Órdenes, Nueva orden: elegir paciente, doctor, 2 estudios del catálogo, Crear. Total calculado en vivo (captura 03, 04).
- Agenda, clic en franja de CS 9600 a las 10:00, escoger paciente y escoger la orden, Guardar (captura 05).
- Abrir la cita, cambiar estado a "Llegó", Guardar (captura 06). La orden pasó sola a "Agendada".

Fricciones:
1. **Los datos de la ficha en papel no caben.** La remisión trae "remitido por", motivo y entrega, pero el alta de paciente no los pide, así que hay que ir a otra pantalla (Órdenes) y volver a elegir al paciente de una lista. El paciente recién creado queda en la ficha sin botón "Crear orden" (la pestaña Órdenes dice solo "Este paciente no tiene órdenes."). Alta prioridad.
2. **La alergia al látex no se ve en la orden, ni en la cita, ni en la agenda.** Solo aparece en la ficha y como una columna escondida en la lista. En una clínica esto es seguridad del paciente. Alta.
3. **No hay "Agendar" desde la orden.** En el detalle de la orden dice "Sin citas agendadas" pero no hay botón. Hay que ir a Agenda, adivinar la hora y volver a elegir paciente y orden. En el diálogo de cita, "Orden" arranca en "Sin orden"; si se olvida, la orden queda sin cita y sin avanzar. Alta.
4. **Dos formas de lo mismo:** la orden tiene botón manual "Marcar como agendada" aunque la cita ya la mueve sola. Confunde (¿hago las dos?). Media.
5. **"Llegó" se marca editando la cita** en un formulario con 7 campos. La recepción necesita un botón "Llegó" en la tarjeta de la cita. La tarjeta tampoco muestra la alergia. Alta.
6. **Duración por defecto de 30 min** para tomografía + panorámica; sin sugerencia según el servicio. Baja.
7. La lista de la orden mezcla "Bimaxilar" (sin decir "Tomografía") con "Panorámica". Se lee como estudio 2D. En el informe y en el PDF también sale "Bimaxilar" a secas. Media (ambigüedad clínica).
8. En el detalle de la orden la cita sale como "2026-11-20 10:00" (formato técnico, no "viernes 20 nov., 10:00 a. m."), y en el doctor igual (captura 32). Baja.
9. La agenda dice "Haz clic en una franja"; en celular es "toca". Fecha: "Viernes, 20 De Noviembre De 2026" con "De" en mayúscula (captura 24). Baja.
10. "Senos paranasales" aparece dos veces en el catálogo (2D y 3D) sin diferenciar en el resumen. Media.
11. Placeholder "Buscar Paciente…" con P mayúscula. Baja.
12. Sin "deshacer": crear orden, crear cita y crear paciente no piden confirmación ni ofrecen deshacer. Cancelar orden sí existe. Media.
13. Nombres con mayúsculas inconsistentes en los datos (algunos pacientes en minúsculas o en MAYÚSCULAS, captura 22). Sugerir normalizar al guardar. Baja.

## Tarea 2. Especialista

Completada: sí, con rodeos. Unos 14 pasos para informar la orden #0004; el informe emitido #0001 ya existía.

Recorrido: Estudios, Abrir visor (captura 07, 08), Atrás del navegador a la app, Órdenes, orden #0004, "Marcar como tomada", "Redactar informe", llenar 3 campos, "Firmar y emitir" (capturas 12, 13), "Descargar PDF" (captura 14). El PDF es limpio y profesional (membrete del centro, firma, código de verificación).

Fricciones:
1. **No se llega al informe desde el estudio.** El estudio y la orden no están vinculados ("Estudios vinculados: Aún no hay estudios vinculados" incluso en una orden informada). El especialista abre el visor, mira, y luego tiene que ir a Órdenes a buscar al paciente a mano. Un botón "Informar este estudio" es lo que más esperaría. Alta.
2. **"Redactar informe" está escondido** hasta que se pulsa "Marcar como tomada" (sin confirmación). Si la orden está "Agendada", el especialista no ve cómo informar. Alta.
3. **El visor no tiene botón "Volver a la app"**; solo funciona el botón Atrás del navegador (captura 08). Alta.
4. **El visor está en inglés a medias**: "Patient", "Confirm and hide", "OHIF Viewer is for investigational use only", "Window Level", "Capture", "3D Rotate", mezclado con "Longitud", "Ampliar", "Mover", "Estudios". El aviso "uso investigacional" puede espantar o generar dudas legales. Alta.
5. Dentro del informe no se ve el visor ni las imágenes. Hay que abrir otra pestaña/pantalla para mirar mientras se escribe. Media.
6. **"Firmar y emitir" se emitió al primer clic sin confirmar**, pese a que el pie dice "el informe queda inmutable". Debería pedir confirmación ("¿Emitir? No se podrá editar, solo corregir con nueva versión"). Alta.
7. "Firmar y emitir" aparece deshabilitado sin decir qué falta (era necesario llenar Hallazgos e Impresión). Mostrar "Falta: hallazgos" o marcar los campos obligatorios. Media.
8. "Motivo de la remisión" hay que escribirlo otra vez; debería venir de la orden/ficha. Media.
9. "Guardar borrador" sin indicación de guardado automático; si se cierra la pestaña, ¿se pierde? Sin plantillas ni textos frecuentes. Media.
10. La columna de acciones en Estudios se corta a 1366 px: los botones "Abrir visor" y "Escaneo facial" quedan fuera de pantalla (captura 07). Alta.
11. Estado "Asignado" con botón "Asignar" al lado y pestaña "Por asignar (0)": no se entiende a quién ni para qué (captura 10). Siglas "CT" y "OSS" sin explicación (usar "Tomografía", "Escaneo de superficie"). "Publicar" tampoco se entiende (¿a quién?). Media.
12. Visor: "3D Rotate" y "Punto de mira" deshabilitados sin explicación (el estudio es una serie axial). Baja.

## Tarea 3. Administración, cobro

Completada: sí. Unos 14 pasos.

Recorrido: Facturación, Nueva cuenta de cobro, elegir la orden #0004 (items y precio se cargan solos, bien, captura 15), Crear (captura 16), Registrar abono, 180.000 en efectivo (captura 18), Cartera (captura 19). Todo cuadra: total 360.000, abonado 180.000, saldo 180.000, y Cartera suma bien por responsable y antigüedad.

Lo bueno: valida que el abono no supere el saldo con mensaje claro (captura 17); el abono se precarga con el saldo completo; aclara "no es factura electrónica DIAN".

Fricciones:
1. **No hay "Facturar" en la orden.** Hay que ir a Facturación y volver a buscar la orden. En la lista de órdenes del selector solo sale "#0004 · nombre", sin servicios ni total, y con 8 órdenes parecidas (de otros QA) es fácil equivocarse. Alta.
2. **Campo de valor sin separador de miles** ("360000", "3600000"): un cero de más es un error de millones. Mostrar formato `$ 180.000` mientras se escribe. Alta.
3. **Registrar abono no tiene botón "50 %"** ni recibo imprimible/enviable del pago. Imprimir solo existe para la cuenta. Media.
4. Después del primer abono desaparece "Anular" sin explicación, y no se ve cómo corregir un abono mal digitado. Alta (no hay "deshacer").
5. En Cartera no hay acción: no se puede abrir la cuenta desde la fila, ni "enviar recordatorio" por WhatsApp. En Colombia el cobro se hace por WhatsApp. Media.
6. "Responsable" arranca en "Paciente" aunque la orden traiga un doctor remitente. Si el doctor es quien paga, se escoge a mano. Media.
7. Las cuentas de ejemplo tienen fechas anteriores a sus órdenes (datos demo). Baja.

## Tarea 4. Doctor remitente

Completada: sí. Unos 8 pasos.

Entra y ve un menú reducido (Inicio, Órdenes, Estudios, Informes) y su resumen; el selector de centro lista "Radex 2 (demo)" y "Radex (demo)" (capturas 28, 29, 30, 31). Solo ve sus propios pacientes/órdenes; en Radex 2 ve "No hay órdenes para mostrar." Los informes que ve son solo los emitidos, con "Descargar PDF" (captura 33). El aislamiento por centro y por rol se comportó bien.

Fricciones:
1. Saludo "Este es el resumen de tu centro" (el doctor no es del centro). Media.
2. Los estados de la orden no se explican: "Solicitada", "Agendada", "Tomada", "Informada". Un doctor quiere "Esperando cita / Estudio tomado / Informe listo". En el detalle de una orden Informada **no hay enlace "Ver informe"** (hay que ir a Informes y buscar por número), y las dos pantallas muestran "Estudios vinculados: aún no hay". Alta.
3. El doctor ve precios y totales de la orden. Confirmar con el negocio si debe verlos. Media.
4. Cambiar de centro recarga en la pantalla de Inicio, sin avisar a cuál se cambió más que en la esquina; sería útil un aviso. Baja.
5. En Estudios aparece "Por asignar (0)" y estado "Asignado", conceptos que no son suyos (captura 34). Media.
6. No hay aviso/notificación cuando un informe queda listo. Media.

## Tarea 5. Dueño (superadmin)

Completada: sí. 4 pasos. Lista de centros con miembros, pacientes y estudios del mes (captura 42); "Entrar al centro" muestra un banner naranja claro "Estás dentro de Radex (demo) como superadmin" con "Volver a la plataforma" que regresa bien (captura 43). Es el mejor flujo de la app.

Fricciones: dentro del centro el saludo dice "Hola, Admin Radex" (parece que fuera otra persona). El botón "Entrar al centro" se repite con el mismo texto en cada fila (para lector de pantalla la etiqueta sí trae el nombre). La lista no muestra estado de salud ni último acceso del centro. Baja a media.

## Entregar resultados (flujo nuevo) y paciente

Completada: sí. 5 pasos para el centro, 3 para el paciente.

Informe emitido, "Entregar resultados": diálogo con destinatario, correo y vencimiento (30 días). Sin correo, genera enlace y código de 6 dígitos para entregar en persona (capturas 36, 37). El paciente abre `/resultados/<token>`, escribe el código, y ve su informe, descarga el PDF y puede compartir con su doctor (captura 41). Código erróneo: "El enlace o el código no son válidos, o ya vencieron." (captura 40). Muy limpio en celular.

Fricciones:
1. El texto del diálogo dice "Se envía un enlace y, en un correo aparte, un código", pero si se deja el correo vacío no se envía nada; el mensaje cambia solo después de pulsar "Generar y enviar". El botón debería decir "Generar" cuando no hay correo. Media.
2. **No hay enviar por WhatsApp**, que es como se entregan resultados en Manizales (botón "Copiar mensaje" con enlace + código listo para pegar). Alta.
3. El enlace queda truncado en el campo; el código "se muestra una sola vez". Si la recepcionista cierra por error, tiene que regenerar. Pedir confirmación al pulsar "Listo" y ofrecer imprimir una hoja con QR + código. Media.
4. El correo del paciente se escribe de nuevo aunque ya estuviera en la ficha (aquí no se había guardado). Precargarlo. Baja.
5. Página del paciente: "Imágenes: 0 estudios" porque el estudio no está vinculado a la orden. El paciente ve vacío. Alta (consecuencia de la desvinculación). Dice "Le enviamos a su doctor…" en presente antes de compartir. Baja.
6. La página pública solo muestra "Radex (demo)" pequeño después de ingresar el código; antes del código no hay marca del centro, y el paciente no sabe de quién es el enlace. Media.

## Tarea 6. Móvil (iPhone 15)

Se puede consultar desde el celular, pero **no es cómodo para trabajar**.

Funciona: Inicio (tarjetas apiladas, captura 20), menú lateral (captura 21), formulario "Nuevo paciente" (captura 23), agenda con scroll horizontal por sala (captura 24), página del paciente (captura 41, excelente).

Fricciones:
1. **Tablas cortadas sin pista de que se puede deslizar**: en Pacientes se pierden Celular, Alertas (la alergia) y Último estudio (captura 22); en Estudios los botones "Abrir visor" quedan fuera de pantalla (captura 26). Usar tarjetas en lugar de tabla en móvil. Alta.
2. En agenda solo se ven 2 salas a la vez; falta una vista por lista del día ("Hoy: 10:00 Juliana Pérez"). Media.
3. Botón del menú y de "Nuevo paciente": al hacer clic con la herramienta de automatización no abrían (sí con un clic por código). No pude confirmar si es un fallo real de toque o del emulador; vale la pena probar en un teléfono real. Sin confirmar.
4. "Guardar" del formulario de paciente queda debajo del pliegue; el cuadro no tiene botón fijo. Baja.
5. Visor en móvil: la interfaz de OHIF se ve, pero los botones son pequeños y sigue en inglés. Media.

## Bugs

| # | Qué | Pasos | Esperado | Pasó | Captura |
|---|-----|-------|----------|------|---------|
| B1 | Acciones de Estudios cortadas a 1366 px | Admin, Estudios | Ver los 3-4 botones | "Abrir visor", "Escaneo facial" fuera de pantalla | 07 |
| B2 | Orden y estudio no vinculados | Orden informada, "Estudios vinculados" | Estudio de la cita enlazado | "Aún no hay estudios vinculados"; el paciente ve "0 estudios" | 38-41 |
| B3 | "Firmar y emitir" sin confirmar | Informe, Firmar y emitir | Confirmación (acción irreversible) | Emite al primer clic | 13 |
| B4 | Visor sin retorno y mezclado en inglés | Estudios, Abrir visor | Botón "Volver", todo en español | Solo Atrás del navegador, textos en inglés | 08 |
| B5 | Campo de abono sin formato de miles | Registrar abono | "$ 180.000" | "360000" | 17 |
| B6 | Fecha de cita con formato técnico y "De" en mayúscula | Detalle de orden, Agenda | "viernes 20 de nov., 10:00 a. m." | "2026-11-20 10:00"; "20 De Noviembre De 2026" | 11, 24 |
| B7 | Doctor sin enlace a informe en orden informada | Doctor, orden #0004 | "Ver informe" | No existe | 32 |
| B8 | Tablas de Pacientes/Estudios ocultan alergias en móvil | iPhone 15, Pacientes | Ver alerta | Columna fuera de pantalla | 22, 26 |

No encontré errores 500 ni datos de un centro filtrándose a otro.

## Top 10 mejoras de UX (impacto en una clínica real)

1. Vincular orden, cita, estudio e informe, con botones directos: "Agendar" y "Facturar" en la orden, "Informar este estudio" en el estudio, "Ver informe" para el doctor. (Alta)
2. Mostrar la alerta (alergia látex, embarazo) en la orden, la cita, la agenda y el informe, y también en móvil. (Alta)
3. Confirmación antes de acciones irreversibles ("Firmar y emitir", "Marcar como tomada", cerrar el código de entrega), y opción de deshacer o anular abono. (Alta)
4. Botón "Llegó" y estados rápidos directamente en la tarjeta de la cita; quitar los botones manuales redundantes de la orden. (Alta)
5. Visor 100 % en español, con "Volver a la app" y sin el aviso "investigational use only" confuso. (Alta)
6. Entregar resultados por WhatsApp (mensaje listo con enlace y código) y hoja imprimible con QR. (Alta)
7. En móvil, tarjetas en lugar de tablas anchas, y vista de lista para la agenda del día. (Alta)
8. Capturar en el alta del paciente o de la orden los datos de la remisión en papel (remitido por, motivo, entrega) y pasarlos al informe; precargar correo y motivo. (Media)
9. Dinero y fechas legibles: miles con punto al escribir, botón "50 %" en abonos, fechas en palabras, recibo de pago. (Media)
10. Lenguaje de negocio en vez de interno: "Asignado/Asignar/Publicar/CT/OSS" y los estados de la orden explicados al doctor; "Tomografía" en el nombre de Bimaxilar y Senos. (Media)

## Qué no pude verificar

No emití un informe de tomografía con imágenes ni probé el visor 3D (la serie es axial). El comportamiento táctil real en un teléfono no se confirmó (solo emulación). El correo de entrega al paciente no se envió (no puse correo).

---

# Oleada 3 (repetición tras las correcciones)

Misma metodología: Orca, escritorio 1366x850 y iPhone 15, los tres usuarios. Datos nuevos: paciente Mariana Soto (CC 1053999777, alérgica al látex), orden #0018, informe #0018, cuenta FC-0012. Capturas 50 a 91 en `docs/qa/evidencias/usuario-real/`.

## Recorrido repetido

| Tarea | Resultado | Pasos aprox. (antes) |
|-------|-----------|----------------------|
| 1. Recepción: paciente, orden con convenio, cita, llegada | Completada | 28 (40) |
| 2. Especialista: estudio, visor, volver, informe, PDF, entrega | Completada | 12 (14) |
| 3. Administración: cobrar, abono 50 %, cartera | Completada | 9 (14) |
| 4. Doctor, cambio de centro | Completada | 7 |
| 5. Dueño | Completada | 4 |
| 6. Móvil | Mejoró mucho, falta Estudios | |
| Paciente con enlace y código (entrega impresa) | Completada | 3 |

Lo nuevo que probé: crear la orden con convenio y tarifa del doctor (capturas 54 a 56), "Agendar" desde la orden con paciente, alerta y orden precargados (57), tarjeta de cita con alerta y botón "Llegó" (58, 59; un solo clic), búsqueda global Ctrl+K (62), confirmación al emitir (66), "Imprimir hoja" con QR (68, 69), enlace del paciente en móvil (70), abono con formato (72, 73), cartera con enlaces (75), modo oscuro y perfil (77, 78).

## Bugs anteriores: estado

| Bug | Resuelto | Evidencia |
|-----|----------|-----------|
| B1 acciones de Estudios cortadas a 1366 px | Sí | 60: los botones se acomodan en dos filas |
| B2 orden y estudio sin vínculo | Parcial | 60: existe "Vincular orden" e "Informar este estudio" por estudio. Mi orden nueva no tenía estudio (no hay equipo real conectado), así que no pude ver el vínculo automático; el detalle de la orden sigue diciendo "Aún no hay estudios vinculados" (63, 90) |
| B3 emitir sin confirmar | Sí | 66: diálogo con resumen, "Seguir editando" / "Firmar y emitir" |
| B4 visor sin retorno y en inglés | Mayormente | 61: barra "dent-view ← Volver" (funciona, regresa a /estudios) y desapareció el aviso "investigational use only". Sigue "Patient" y "Window Level/Capture/3D Rotate" en inglés |
| B5 abono sin miles | Sí | 72, 73: "$ 400.000" y "200.000" al escribir |
| B6 fechas técnicas | Parcial | La agenda ya dice "Viernes 20 de noviembre de 2026" y "Toca una franja libre". En el detalle de la orden la cita sigue como "2026-11-20 09:00" (63, 90) |
| B7 doctor sin enlace al informe | Sí | 90: botón "Ver informe (v1)" |
| B8 tablas cortadas en móvil | Parcial | 80: Pacientes pasa a tarjetas con alerta y celular, muy bien; 82: la Agenda tiene selector de sala. Estudios en móvil sigue con tabla y filas altas con botones fuera de pantalla (81) |

Mejoras de la oleada 2 verificadas como resueltas: botón "Agendar" y "Facturar" en la orden (56), alerta de alergia en el diálogo de cita y en la tarjeta de la agenda (57, 58), botón "Llegó" en la tarjeta (59), cartera con enlace a cada cuenta (75), modo oscuro legible (77), búsqueda global (62), perfil con cambio de contraseña (78), entrega impresa con QR y código (69, hoja limpia y sin el resto de la pantalla), el aislamiento por rol sigue correcto.

## Bugs nuevos

1. **"Tarifa Dr. Dr. Pepito"** (captura 55): el resumen de la orden repite el "Dr." porque el nombre ya lo trae. Baja, es un error de texto fácil.
2. **El convenio no deja rastro en la orden.** Elegí "Ortodoncia Integral Manizales" (con 3 tarifas) y el doctor Pepito; el resumen solo marcó la tarifa del doctor en Panorámica ($ 35.000 en vez de $ 40.000). No dice qué tarifa pegó el convenio, ni el nombre del convenio queda en el detalle de la orden, la cuenta de cobro ni el informe (56, 71). Para el centro es imposible auditar por qué cobró eso. Media/Alta.
3. **El botón "Agendar" de la orden sigue visible aunque ya tiene cita** (63, 64) y "Marcar como agendada" convive con él. Debería decir "Ver cita" o desaparecer. Media.
4. **"Imprimir hoja" usa la impresión del navegador** (en Orca quedó bloqueada; la hoja en sí sale bien con `pdf`). Si el navegador bloquea ventanas, la recepcionista no tiene alternativa; ofrecer también "Descargar hoja PDF". Baja/Media.
5. **Estudios en móvil** sigue cortado (81), ahora con filas más altas por los 5 botones. Media.
6. **Nombres en minúscula en etiquetas accesibles** ("mariana soto", "#0018 · mariana soto" en el selector de órdenes) aunque la pantalla muestra "Mariana Soto". Los lectores de pantalla y los selectores lo muestran en minúscula. Baja.

## Fricciones que quedan

- La ficha del paciente nuevo sigue sin botón "Crear orden" (53); la pestaña Órdenes solo dice "Este paciente no tiene órdenes". Hay que ir a Órdenes y elegir al paciente de nuevo. Alta.
- La alergia no aparece en la orden ni en el informe (sí en la ficha, la lista, el diálogo de cita y la agenda). Media/Alta.
- "Redactar informe" sigue apareciendo solo tras "Marcar como tomada" (sin confirmación ni explicación) (63, 64). En un flujo real el especialista quiere informar desde el estudio; "Informar este estudio" existe, pero requiere un estudio entrante. Media.
- Estudios: cinco botones por fila (Asignar, Publicar, Vincular orden, Informar, Abrir visor) abruman; "Asignado/Asignar/Publicar" y "CT/OSS" siguen sin traducirse a lenguaje de clínica (60). Media.
- Entrega de resultados: el diálogo sigue prometiendo "se envía un correo" y solo después dice "No se envió correo"; el botón sigue diciendo "Generar y enviar" aunque no haya correo; falta enviar por WhatsApp. En la página del paciente "Imágenes: 0 estudios" y "Le enviamos a su doctor…" antes de compartir (70). Media.
- Abono: no hay botón "50 %" ni recibo del pago. Baja.
- El saludo "tu centro" sigue para el doctor y para el superadmin dentro de un centro (aparece "Hola, Admin Radex"). Baja.
- El visor aún muestra "Patient" y varios botones en inglés. Baja/Media.
- Persisten datos demo ruidosos ("Qa Paciente…") que ensucian la Cartera (77); no es un fallo del producto pero ocultan la señal en las demos.

## Calificación como MVP para una clínica dental real: 7 de 10

Justificación:
- **Puntos a favor (por qué no es 5):** el ciclo completo funciona sin errores graves y en menos pasos: paciente, orden con precio por convenio/doctor, cita con alerta, llegada, informe con confirmación y PDF profesional, entrega al paciente con QR y código, cobro con abono validado, cartera con enlaces. Hay buenas prácticas poco comunes en un MVP: aislamiento por centro y rol, banner de superadmin, validaciones con mensajes claros, búsqueda global, modo oscuro, páginas del paciente limpias y móvil usable para Pacientes y Agenda. Los 8 bugs del primer reporte pasaron a resueltos o parcialmente resueltos; ningún error 500 ni fuga entre centros.
- **Por qué no es 9:** (1) el vínculo orden-estudio-informe, que es el corazón de un centro de radiología, no pude verlo funcionar con un estudio real recién tomado: depende de que entre un estudio del equipo, y sin eso el flujo de "informar" se hace con pasos manuales. (2) La trazabilidad del precio por convenio es opaca, y en cobro eso genera conflictos. (3) Faltan canales reales de entrega (WhatsApp, impresión de respaldo) y recibos. (4) Estudios en móvil sigue sin resolverse y hay jerga técnica ("Asignado", "Publicar", "CT", "OSS") que una recepcionista no entiende. (5) Falta crear la orden desde la ficha del paciente y ver la alergia en la orden e informe.
- Con esas cinco cosas resueltas y probada la llegada real de un estudio, lo subiría a 8,5/9 para un piloto con una clínica.
