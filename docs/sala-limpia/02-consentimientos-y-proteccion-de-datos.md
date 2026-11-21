# Especificación funcional 02 — Consentimientos, derechos del titular, retención y bitácora de accesos

## Procedencia

- **Fecha de elaboración:** 2026-11-19
- **Naturaleza:** descripción funcional independiente, elaborada a partir del análisis de comportamiento de un producto de terceros licenciado bajo Business Source License 1.1 (DentalPin).
- **Garantía de limpieza:** no contiene código, esquemas, nombres de tablas/campos/clases/funciones/rutas ni textos de interfaz o plantillas del producto analizado. Redacción propia; describe QUÉ, no CÓMO.
- **Elaborado por:** agente "sala sucia".
- **Alcance:** cubre dos módulos del original: protección de datos (consentimientos, solicitudes de titulares, retención, supresión parcial, incidentes, exportación) y bitácora de actividad del personal.
- **Importante sobre el marco legal:** el original se diseñó para el Reglamento General de Protección de Datos de la Unión Europea. Cada sección separa lo que es **concepto general** (transferible) de lo **específico de la UE** (a reemplazar o descartar), y propone la adaptación a la Ley 1581 de 2012 de Colombia. Las referencias normativas colombianas son orientativas y **deben validarse con asesoría jurídica** antes de implementarse.
- **Nota sobre cifras:** plazos y límites marcados como "sugerido" son decisiones a confirmar.

---

## 1. Objetivo

1. Registrar, de forma probatoria e inmutable, las **autorizaciones** que el titular otorga o revoca para cada finalidad de tratamiento.
2. Gestionar las **solicitudes del titular** (consultas y reclamos) con fecha límite y trazabilidad.
3. Definir **políticas de retención** que determinen cuándo se pueden suprimir datos de contacto o identidad.
4. Ejecutar **supresión parcial** respetando obligaciones de conservación, con constancia auditable.
5. Llevar un **registro de incidentes de seguridad** con su estado y notificaciones.
6. Permitir **exportar** los datos de un titular en formato legible por máquina.
7. Mantener una **bitácora inmutable de actividad del personal** (quién hizo qué, sobre qué paciente y cuándo).

## 2. Actores y roles

| Actor | Participación |
|---|---|
| Administrador / oficial de protección de datos | Todo: políticas, supresión, incidentes, auditoría, bitácora. |
| Recepcionista | Registra y avanza solicitudes del titular; registra autorizaciones; consulta incidentes (solo lectura). |
| Odontólogo / radiólogo | Consulta solicitudes, autorizaciones, políticas y auditoría (solo lectura). |
| Tecnólogo / auxiliar | Consulta solicitudes y autorizaciones. |
| Titular (paciente o su representante) | Origen de solicitudes y autorizaciones. |

La bitácora de actividad, en el original, solo la ve el administrador (registra qué empleado hizo qué); el centro puede ampliar ese permiso.

## 3. Historias de usuario

- Como **recepcionista** quiero registrar que el paciente autorizó el tratamiento de sus datos para una finalidad concreta, guardando el texto exacto que se le mostró, para tener prueba de la autorización.
- Como **recepcionista** quiero registrar que un paciente revocó su autorización de contacto comercial sin perder el historial anterior.
- Como **recepcionista** quiero registrar una solicitud de un titular (consulta, actualización/rectificación, supresión, portabilidad o limitación) y ver cuántos días le quedan.
- Como **administrador** quiero definir por categoría de dato cuántos años se retiene y si hay una retención legal vigente.
- Como **administrador** quiero ejecutar una supresión parcial de contacto/identidad cuando la política lo permita, y que quede constancia.
- Como **administrador** quiero registrar un incidente de seguridad, evaluarlo, notificarlo a la autoridad y a los afectados y cerrarlo.
- Como **administrador** quiero exportar los datos de un paciente en formato estructurado.
- Como **administrador** quiero revisar la bitácora filtrando por tipo de evento, paciente, usuario y rango de fechas.

## 4. Flujos paso a paso

### 4.1 Registrar una autorización o su revocación
1. El usuario elige paciente y **finalidad** (texto corto, vocabulario abierto: cada centro puede definir las suyas, por ejemplo tratamiento clínico, contacto por WhatsApp, comunicaciones informativas, uso de imágenes para docencia).
2. Indica si la finalidad se **otorga** o se **revoca**.
3. Si se otorga, es obligatorio guardar el **texto exacto presentado** al titular; sin texto, se rechaza (no hay prueba de qué se aceptó).
4. El sistema normaliza la finalidad (quita espacios y unifica mayúsculas/minúsculas) para que variantes de escritura sean la misma finalidad.
5. Un paciente inexistente o de otro centro produce "no encontrado" antes de escribir nada.
6. Se **agrega** un nuevo registro con fecha de otorgamiento o de revocación. **Nunca se modifica ni se borra un registro previo.**
7. Se emite un evento de autorización otorgada o revocada con la finalidad ya normalizada.

### 4.2 Consultar el estado actual
Para un par paciente + finalidad, el estado vigente es el **registro más reciente** (orden por fecha de creación y, en empate, por orden estable). El listado histórico y la consulta del estado vigente deben usar el mismo orden para no contradecirse. Otorgar, revocar y volver a otorgar deja tres registros.

### 4.3 Solicitudes del titular
1. Se registra: nombre y correo del solicitante, tipo de solicitud y notas; paciente asociado es opcional (puede ser un prospecto sin historia).
2. Tipos: acceso/consulta, rectificación/actualización, supresión, portabilidad, limitación. (Falta, en el original, la oposición.)
3. Si se indica paciente, debe existir en el centro; si no, "no encontrado".
4. Estado inicial: recibida; fecha límite = fecha de recepción + plazo (el original usaba 30 días corridos; ver adaptación).
5. Estados: recibida, en trámite, completada, rechazada. Al pasar a completada o rechazada se sella la fecha de resolución; si vuelve a recibida, se limpia esa fecha.
6. Cada cambio de estado emite un evento con estado anterior, nuevo y quién lo cambió.
7. **Las solicitudes no se borran** (son registros de rendición de cuentas); solo cambian de estado.

### 4.4 Políticas de retención
1. El administrador crea una política por **categoría de dato** con años de retención (0 = sin retención por antigüedad) y una fecha opcional de "retención legal hasta".
2. Crear una política para una categoría que ya tiene una activa **sustituye** la anterior (solo una activa por categoría; no se reactivan antiguas). Dos creaciones simultáneas: una gana y la otra recibe conflicto.
3. Pueden actualizarse y eliminarse.

### 4.5 Supresión parcial
1. Se solicita sobre un paciente y un conjunto de categorías de un vocabulario **cerrado** (correo, teléfono, identidad). Cualquier otra categoría se rechaza.
2. Paciente inexistente o de otro centro: error antes de escribir nada.
3. Una categoría es **suprimible** únicamente si: existe política activa para ella, la retención legal ya venció y la ventana de años desde la última actualización del paciente ya transcurrió. Si no hay política, o la categoría no tiene campos asociados, se **retiene**.
4. Para las categorías suprimibles se **vacían** los datos personales correspondientes (correo y correo de facturación; teléfono; documento de identidad). **La ficha del paciente jamás se borra físicamente.**
5. Se escribe siempre un registro de auditoría inmutable (categorías suprimidas, campos vaciados, justificación, quién y cuándo).
6. Otros módulos participan: cada uno limpia sus propias copias del dato (por ejemplo, mensajes enviados, notas de contactos de seguimiento) y **informa su cobertura** (qué suprimió y qué retuvo y por qué). Si alguno falla, **toda la operación se revierte**. El resultado final es una lista de cobertura por ámbito. Un módulo no instalado no figura como cubierto.
7. Tras confirmar, se anuncia un evento de supresión ejecutada (solo informativo).
8. Los documentos clínicos emitidos y las notas clínicas se **retienen** por obligación legal y así se declara en la cobertura.

### 4.6 Incidentes de seguridad
1. Registro con descripción, datos involucrados (obligatorio), número de afectados (opcional) y fecha de ocurrencia.
2. Estados y transiciones permitidas:
   - en evaluación → reportado | no reportable
   - reportado → resuelto | no reportable
   - no reportable → en evaluación (para reevaluar)
   - resuelto → (final)
3. No se puede retroceder de reportado a en evaluación. Un error se corrige editando los campos, no rebobinando el estado.
4. La fecha de notificación a la autoridad **solo se sella al pasar a reportado**; no puede escribirse a mano (evita fechas falsas o retroactivas).
5. Existen campos para la **notificación a los afectados** (fecha y cantidad), explícitos y sin sellado automático.
6. Pasar de reportado a no reportable (la autoridad lo considera por debajo del umbral) **conserva** las marcas de notificación, porque ocurrió.
7. Valores nulos explícitos en campos obligatorios se ignoran.
8. Se emite evento de incidente reportado.

### 4.7 Exportación (portabilidad)
Dado un paciente, devuelve una instantánea estructurada con identidad (nombres, teléfono, correo, fecha de nacimiento, sexo, documento, dirección), historial de autorizaciones (finalidad, otorgada, fechas) y solicitudes (tipo, estado, fechas). El original no incluía la historia clínica ni imágenes; dent-view debe decidir el alcance (ver adaptación).

### 4.8 Bitácora de actividad
1. Es un **oyente** de eventos del sistema: por cada evento relevante crea un registro inmutable con: centro, tipo de evento, actor (si se identifica), paciente, entidad de origen, contenido completo del evento y fecha en que ocurrió.
2. El registro se escribe **dentro de la misma transacción** de la operación original: si la operación se revierte, no queda bitácora; si la bitácora falla, la operación falla (no se pierde auditoría en silencio).
3. Si el evento no trae centro válido, se omite y se avisa en el registro técnico, en vez de romper la operación.
4. El actor se deduce de varios campos posibles del evento (el primero que sea un identificador de usuario válido).
5. La entidad de origen es el primer identificador del evento distinto de centro, paciente y actor; si el evento es solo del paciente, la entidad es el propio paciente.
6. Identificadores mal formados se degradan a vacío sin romper la operación.
7. Solo se suscribe a eventos publicados dentro de transacción; los emitidos desde procesos en segundo plano o integraciones se excluyen para no provocar fallos.
8. Eventos cubiertos por el original: ciclo de vida de citas, presupuestos, facturas y pagos, alta/archivo de pacientes, creación de recordatorios de seguimiento, tratamientos realizados, órdenes de laboratorio, plan de tratamiento, documentos emitidos, recetas, asistencia del personal y movimientos de tesorería.
9. **No existe** alta, modificación ni borrado por interfaz: solo lectura.
10. Consulta: filtros por tipo de evento, usuario, paciente y rango de fechas (el rango abarca días completos), paginada, de más reciente a más antiguo, con desempate estable. Detalle individual por identificador.
11. Interfaz: tabla con filtros de tipo y fechas y visor del contenido completo del evento.

## 5. Reglas de negocio y validaciones

1. Todo se filtra por centro; solicitudes, autorizaciones, políticas, auditoría e incidentes de otro centro responden "no encontrado".
2. Autorizaciones: append-only; finalidad no vacía tras normalizar; texto presentado obligatorio al otorgar.
3. Los filtros de estado y tipo son vocabularios cerrados: un valor desconocido es error de validación, no una lista vacía.
4. Los listados se paginan con tope y orden estable.
5. Los plazos de retención se miden en la **zona horaria del centro**, no del servidor.
6. Retención por antigüedad: se mide desde la última actualización del paciente (ancla provisional del original; dent-view debería anclarla a la **última atención**).
7. Una supresión nunca elimina físicamente al paciente.
8. Las políticas no pueden reactivarse; se crean nuevas.
9. Las operaciones de supresión son atómicas con todas las contribuciones de módulos.
10. Las herramientas de automatización (agente) nunca se saltan estas reglas.

## 6. Datos de negocio

- Autorización: paciente, finalidad normalizada, otorgada sí/no, texto mostrado, fecha de otorgamiento, fecha de revocación.
- Solicitud del titular: solicitante (nombre, correo), paciente (opcional), tipo, estado, recepción, fecha límite, resolución, notas.
- Política de retención: categoría, años, retención legal hasta, activa.
- Registro de supresión: paciente, categorías suprimidas y retenidas, campos vaciados, justificación, ejecutor, fecha.
- Incidente: descripción, datos involucrados, afectados, ocurrencia, estado, notificación a la autoridad, notificación a afectados (fecha y cantidad).
- Bitácora: tipo de evento, actor, paciente, entidad de origen, contenido, fecha.

## 7. Casos borde

- Mayúsculas, espacios y variantes de la misma finalidad: se unifican; una finalidad en blanco se rechaza.
- Revocación guardada antes de unificar nombres: debe alcanzarse con la misma clave de un otorgamiento posterior.
- Solicitud sin paciente: aceptada; con paciente ajeno: rechazada.
- Supresión de categoría sin política: se retiene y se informa.
- Retención legal vigente o ventana de años no cumplida: se retiene.
- Un módulo que contribuye a la supresión lanza error: se revierte todo.
- Dos incidentes con el mismo segundo de ocurrencia: orden estable en la paginación.
- Evento con identificadores no válidos: la bitácora no rompe la operación.
- Retroceso de estado de un incidente: error de validación.

## 8. Criterios de aceptación

1. Otorgar, revocar y otorgar de nuevo deja tres registros; el estado vigente es "otorgada".
2. Otorgar sin texto mostrado es rechazado.
3. Las finalidades "SMS" y "sms " son la misma.
4. Una solicitud nueva queda recibida con fecha límite calculada; al completarse se sella resolución.
5. No existe forma de borrar una solicitud.
6. Una política nueva en la misma categoría desactiva la anterior.
7. La supresión de teléfono con política vencida vacía el teléfono, escribe auditoría y devuelve cobertura por ámbito; la ficha del paciente sigue existiendo.
8. La supresión con retención legal vigente conserva el dato y lo declara.
9. Un fallo de un módulo participante revierte toda la supresión.
10. Un incidente no puede ir de reportado a en evaluación; la fecha de notificación a la autoridad solo aparece tras reportar.
11. La exportación devuelve identidad, autorizaciones y solicitudes del paciente.
12. Toda operación auditada deja una fila de bitácora en la misma transacción, que desaparece si la operación se revierte.
13. La bitácora no ofrece ninguna operación de modificación ni borrado.
14. Un usuario no administrador no accede a la bitácora salvo que se le conceda.

## 9. Adaptación a dent-view (Colombia, Ley 1581 de 2012)

### 9.1 Qué es concepto general (transferible tal cual)
- Autorización previa, expresa e informada **por finalidad**, con prueba del texto presentado y de la fecha; revocación sin borrar historia.
- Registro de solicitudes del titular con plazo y trazabilidad.
- Retención limitada por finalidad y conservación obligatoria cuando hay deber legal.
- Supresión parcial auditada, sin destrucción de la historia clínica.
- Registro de incidentes con notificaciones.
- Exportación de datos del titular.
- Bitácora de acceso y actividad inmutable.

### 9.2 Qué era específico de la UE (reemplazar o descartar)
- Todas las referencias a artículos del reglamento europeo, al "derecho al olvido" amplio y al plazo de un mes (30 días corridos).
- Notificación de brechas en 72 horas a la autoridad europea.
- Oficial de protección de datos obligatorio por reglamento europeo, evaluaciones de impacto, transferencias internacionales con cláusulas europeas.
- Derecho de portabilidad y de oposición **tal como los define el reglamento europeo**: en Colombia no existe un derecho de portabilidad equivalente; la exportación se mantiene como funcionalidad de acceso/consulta.

### 9.3 Mapa conceptual hacia la normativa colombiana (validar con jurídica)
| Concepto del módulo | Equivalente colombiano orientativo |
|---|---|
| Autorización por finalidad | Autorización previa, expresa e informada del titular; la salud es **dato sensible**: autorización explícita, informando que no está obligado a darla y cuáles datos son sensibles. |
| Derechos del titular | Conocer, actualizar, rectificar, suprimir, revocar la autorización, ser informado del uso, presentar quejas ante la autoridad (Superintendencia de Industria y Comercio), acceder gratuitamente. |
| Solicitud con plazo | Consultas: respuesta en un plazo corto en días hábiles, prorrogable una vez con aviso; reclamos: plazo mayor en días hábiles, prorrogable, con una leyenda de "reclamo en trámite" mientras se resuelve. Cifras exactas por confirmar en la norma vigente. |
| Retención | Historia clínica: conservación mínima prolongada desde la última atención y carácter reservado según la normativa de historia clínica; el centro de radiología debe definir cuánto conserva imágenes e informes. **La supresión no aplica mientras exista deber legal de conservar.** |
| Incidente | Reporte de incidentes de seguridad a la autoridad en el plazo definido por su regulación; registro interno. |
| Registro de bases de datos | Inscripción de las bases de datos en el registro nacional que administra la autoridad (tarea administrativa, no del software, pero el sistema puede guardar fecha y datos de inscripción). |
| Política de tratamiento y aviso de privacidad | El sistema debe permitir publicar/mostrar la política y el aviso y asociarlos a la autorización. |
| Responsable / Encargado | El centro es responsable; los proveedores tecnológicos son encargados: registrar su contrato/acuerdo (en el original aparece como nota sobre proveedores de mensajería). |
| Menores de edad | Tratamiento de datos de niños y adolescentes con autorización del representante y atendiendo su interés superior; el módulo de historia clínica (05) maneja al representante legal. |

### 9.4 Particularidades para radiología
- Autorizaciones típicas: tratamiento de datos sensibles de salud; **uso/envío de imágenes e informes al doctor remitente** (finalidad clave del centro); contacto por canales de mensajería; uso de imágenes con fines de docencia o investigación (anonimizadas).
- Consentimiento informado del **procedimiento** (exposición a radiación, embarazo, tomografía) es distinto de la autorización de datos; el sistema debería poder guardar ambos y firmarlos (firma manuscrita digitalizada o electrónica).
- La **compartición con el remitente** debe quedar registrada como acceso/entrega (quién, qué, cuándo, por qué canal).
- La bitácora debe incluir además **accesos de lectura** a historias e imágenes (el original solo audita acciones de negocio, no lecturas): requisito adicional recomendado.

### 9.5 Qué descartar o aplazar
- Texto y vocabulario del reglamento europeo y referencias a sus artículos.
- Portabilidad como derecho independiente.
- Plazos de 30 días corridos y de 72 horas.
- La ausencia de interfaz del original para estas funciones: dent-view sí necesita pantallas para autorizaciones, solicitudes e incidentes.
- Bitácora limitada a administrador: dent-view puede añadir un rol de oficial de protección de datos.
