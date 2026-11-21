# Especificación funcional 04 — Notificaciones multicanal (correo, SMS, WhatsApp)

## Procedencia

- **Fecha de elaboración:** 2026-11-19
- **Naturaleza:** descripción funcional independiente, elaborada a partir del análisis de comportamiento de un producto de terceros licenciado bajo Business Source License 1.1 (DentalPin).
- **Garantía de limpieza:** no contiene código, esquemas, nombres de tablas/campos/clases/funciones/rutas ni textos de interfaz o plantillas del producto analizado. Redacción propia; describe QUÉ, no CÓMO.
- **Elaborado por:** agente "sala sucia".
- **Alcance:** pasarela de notificaciones (plantillas, preferencias del paciente, configuración del centro, bandeja de salida con reintentos, registro de mensajes, conversación), y los tres conectores de canal: SMS, WhatsApp por proveedor y WhatsApp por webhook hacia automatizaciones del centro. También se describe el canal de notificaciones en el navegador (push) que existía en el producto.
- **Nota sobre cifras:** límites, reintentos y ventanas son valores del original o sugerencias a confirmar.

---

## 1. Objetivo

Enviar mensajes al paciente por el canal adecuado, **respetando su consentimiento y preferencias**, sin hacer llamadas de red dentro de la petición del usuario, con reintentos controlados, trazabilidad de cada intento y plantillas editables por centro. Otros módulos (citas, presupuestos, facturas, seguimientos, bienvenida) solo "piden" un mensaje; este módulo decide **si, cómo y por dónde** se envía.

## 2. Actores y roles

| Actor | Participación |
|---|---|
| Administrador | Configura canales, proveedor, límites, plantillas, SMTP; ve registros. |
| Recepcionista / personal con permiso de envío | Envía mensajes manuales, responde conversaciones. |
| Personal con permiso de lectura de registros | Consulta el historial y las conversaciones. |
| Paciente | Define preferencias, responde mensajes. |
| Sistema (eventos y procesos programados) | Encola mensajes automáticos. |
| Proveedores externos | Entregan el mensaje y devuelven estados y respuestas. |

Permisos del original (patrón): enviar; plantillas (leer/escribir); preferencias (leer/escribir); suscripciones push; configuración (leer/escribir); registros (leer). Las credenciales de proveedores solo las ve el administrador.

## 3. Historias de usuario

- Como **administrador** quiero elegir el canal preferido del centro y si, cuando falle, se prueba otro canal.
- Como **administrador** quiero editar el texto de cada tipo de mensaje por idioma y canal sin tocar código.
- Como **administrador** quiero limitar cuántos SMS por día puede enviar el centro para controlar costos.
- Como **paciente** quiero decidir por qué canales y de qué tipos de mensajes quiero recibir avisos.
- Como **recepcionista** quiero enviar manualmente un mensaje que no se envía solo (bienvenida, presupuesto) y ver si salió.
- Como **recepcionista** quiero ver la conversación con el paciente y responder dentro de la ventana permitida.
- Como **administrador** quiero conocer por qué un mensaje no salió (consentimiento, sin canal, límite, error del proveedor).
- Como **administrador** quiero conectar mi propia automatización (por ejemplo, un flujo en una herramienta de integración) como canal de WhatsApp sin contratar un proveedor.

## 4. Tipos de mensaje (vocabulario cerrado)

Confirmación de cita, recordatorio de cita, cita cancelada, presupuesto enviado, presupuesto aceptado, recordatorio de presupuesto, factura enviada, recordatorio de seguimiento y bienvenida. Todo mensaje encolado debe pertenecer a este conjunto; añadir uno nuevo implica registrarlo también en la configuración por defecto del centro y en las preferencias del paciente. Una clave ausente en las preferencias del paciente se interpreta como **consentimiento**; por eso la escritura de preferencias solo admite claves del vocabulario.

dent-view reemplaza este conjunto por el suyo (ver sección 12).

## 5. Flujos paso a paso

### 5.1 Encolar un mensaje (decisión previa al envío)
Entrada: centro, tipo de mensaje, contexto con variables, paciente opcional, dirección opcional, canales opcionales, indicador de envío forzado, tipo (plantilla o respuesta libre), texto opcional, evento y usuario de origen, clave de no repetición.

Orden de decisiones, y la primera que bloquea gana:
1. **No repetición:** si ya existe un mensaje con esa clave en el centro, no se hace nada (resultado vacío).
2. **No contactar:** si el paciente está marcado como no contactable, se registra un mensaje **omitido** con ese motivo. Bloqueo absoluto en todos los canales, incluso con envío forzado.
3. **Rechazo por tipo:** si el paciente rechazó ese tipo de mensaje, se registra omitido. También prevalece sobre el envío forzado.
4. **Configuración del centro** (solo si no es forzado): si el tipo está desactivado → omitido; si no está en envío automático y se esperaba automático → omitido "requiere envío manual".
5. **Idioma:** preferencia del paciente; si no, idioma de comunicación del centro; si no, español.
6. **Resolución de canal:** se recorre la lista ordenada de canales (preferido del centro y, si el respaldo está activo, los demás instalados y conectados) y se toma el **primer viable**; nunca se envía por varios a la vez. Si ninguno es viable → omitido "sin canal viable".
7. **Tope de SMS diario:** si el canal elegido es SMS y el centro ya alcanzó su tope del día, se prueba el resto de canales de la lista; si ninguno sirve → omitido "límite de SMS". Los omitidos no cuentan para el tope. Un tope de cero o menos bloquea siempre; el valor por defecto es 100 por día (día en UTC en el original; en dent-view usar el día del centro).
8. Se crea el mensaje con estado "en cola", el contexto (sin contraseñas ni tokens) y el idioma resuelto para renderizar después; la hora del primer intento es "ahora".
9. Se emite el evento "mensaje en cola". **No se confirma la transacción aquí**: quien llama decide cuándo existe de verdad (así, si una operación de negocio se revierte, no sale ningún mensaje).

### 5.2 Reglas de viabilidad por canal
- **Correo:** requiere dirección (del paciente o la indicada) y que el paciente no tenga el correo desactivado. Ausencia de preferencias no bloquea.
- **WhatsApp:** requiere teléfono del paciente. Si el conector exige opt-in registrado, requiere preferencia activa **y** fecha de aceptación. Para **respuesta libre**, exige además ventana abierta (el paciente escribió en las últimas 24 horas) y que el conector admita respuestas libres. Para **mensaje proactivo**, el conector puede requerir una **plantilla aprobada por el proveedor** (si no existe o no está aprobada, el canal no es viable). El conector puede normalizar el número o declararlo inválido.
- **SMS:** requiere teléfono (se asume formato internacional) y que el paciente no tenga SMS desactivado. Solo texto; no necesita plantilla aprobada ni ventana.
- **Notificación en el navegador (push):** viable si el paciente tiene al menos una suscripción activa y no la desactivó.
En todos, un rechazo explícito del paciente bloquea y la ausencia de registro de preferencias no.

### 5.3 Despacho (envío real)
1. Un proceso programado frecuente toma un lote (original: 50) de mensajes "en cola" o "fallidos" con intentos pendientes y hora de reintento vencida, ordenados por antigüedad, **bloqueándolos para que dos procesos no tomen el mismo**; el fallo de uno no afecta al resto.
2. Selecciona el conector del canal (el configurado explícitamente por el centro; si no, el registrado que declare soporte).
3. Sin conector → fallido "sin conector".
4. Si el conector exige consentimiento de WhatsApp, se **verifica de nuevo** justo antes de enviar; si ya no hay consentimiento vigente (preferencia activa, aceptación registrada, no "no contactar", tipo no rechazado) → omitido.
5. Pasa a "enviando", suma un intento, vuelve a verificar que la plantilla proactiva siga aprobada y **libera el bloqueo antes de la llamada externa**.
6. Se compone el mensaje (plantilla del centro, si no la del sistema, por canal e idioma; o el texto libre si es respuesta). Las variables internas de control no se mandan al proveedor.
7. Resultado del conector:
   - **Enviado:** estado enviado, fecha, proveedor, identificador del proveedor; se emite el evento de enviado.
   - **Diferido** (queda pendiente de entrega manual, por ejemplo un borrador a mano): estado "esperando entrega manual"; antes de publicarlo se revalida que no haya habido supresión de datos, "no contactar" ni retiro del consentimiento en el ínterin; si los hay, se omite.
   - **Omitido** (por ejemplo, correo deshabilitado globalmente): estado omitido, sin reintento ni evento de fallo.
   - **Fallido:** estado fallido, error truncado, evento de fallo.
8. **Reintentos:** hasta un máximo de intentos (original: 5) con espera exponencial: 1 min, 2, 4, 8… con tope de 1 hora.
9. Al recibir de un proveedor un acuse (entregado, leído) se actualiza el mensaje por su identificador externo, siempre dentro del centro.

### 5.4 Conversaciones
- Los mensajes entrantes del paciente se guardan como registros de entrada, **sin duplicarse** (idempotentes por identificador del proveedor), abren la **ventana de 24 horas** y emiten el evento de respuesta recibida.
- Se puede consultar la conversación de un paciente (entrantes y salientes, del más antiguo al más reciente), opcionalmente por canal.
- Responder en texto libre: encola un mensaje de tipo respuesta por el canal elegido con envío forzado (que no salta rechazos del paciente). Si la ventana está cerrada o el canal no está disponible, se responde con conflicto explicando que debe usarse una plantilla.

### 5.5 Mensajes manuales
Con permiso de envío: elegir tipo, paciente (del centro), canales opcionales y contexto personalizado. El sistema completa el contexto con nombre del paciente y datos del centro. Los tipos de cita exigen indicar la cita (del mismo centro). Sin canales indicados, el comportamiento histórico es solo correo y exige que el paciente tenga correo; con canales explícitos, la dirección se valida por canal (un paciente solo con teléfono puede recibir WhatsApp).

### 5.6 Disparadores por evento
Todos se ejecutan dentro de la transacción del evento, protegidos en un punto de guarda: **un error al encolar nunca debe fallar la operación de negocio**, pero sí debe deshacer limpiamente lo suyo.
- **Alta de paciente:** encola bienvenida (por defecto, envío manual).
- **Cita creada:** encola confirmación con paciente, fecha, hora, profesional, nombre/teléfono/dirección del centro. Se omite si el paciente no tiene correo ni teléfono.
- **Cita cancelada:** encola aviso con motivo de cancelación.
- **Presupuesto enviado / aceptado / recordatorio de presupuesto (hitos de días):** encolan con número, totales, vigencia, enlace público al presupuesto y listado de tratamientos (la construcción de ese listado vive en un único lugar compartido por el envío automático y el manual).
- **Factura enviada:** con número, fechas, ítems, totales, saldo y datos de facturación.
- **Seguimiento creado:** ver módulo 03.
- **Recordatorio de cita:** proceso programado del módulo 03.
- **Paciente actualizado a "no contactar":** cancela los borradores pendientes de WhatsApp en la misma transacción.
Los mensajes ya enviados no se retiran; la supresión de datos (módulo 02) vacía destinatario, asunto, cuerpo, contexto y texto de error de los mensajes del paciente del canal afectado, cancela los pendientes y deja la fila como constancia de envío.

### 5.6.1 Configuración por centro
- Canal preferido, respaldo activado o no, canales disponibles para envío manual, tope diario de SMS.
- Por tipo de mensaje: habilitado, envío automático, y para el recordatorio de cita, las **horas de antelación** (24 por defecto).
- Valores por defecto: confirmación, cancelación, aceptación y recordatorios (cita, presupuesto, seguimiento) automáticos; presupuesto enviado, factura y bienvenida manuales.
- La actualización **fusiona** la configuración por tipo, no la reemplaza.
- Idioma de comunicación del centro, con español por defecto.
- Los canales "disponibles" se calculan según los conectores instalados y conectados por el centro.

### 5.7 Plantillas
- Por canal, idioma y tipo de mensaje. Prioridad: plantilla del centro activa, luego la del sistema.
- Correo: asunto y cuerpo HTML con variables; asunto con variables también. Cuerpo de texto opcional.
- WhatsApp por proveedor: nombre de plantilla en el proveedor, estado de aprobación y lista ordenada de variables; se sincronizan desde el proveedor y se pueden mapear a tipos de mensaje. Las variables son **con nombre**, iguales a las del contexto (las posicionales requerirían mapeo).
- SMS: texto plano; el original incluía un conjunto de plantillas de sistema por tipo de mensaje e idioma.
- Plantilla del sistema no editable; el centro crea la suya para sobrescribir. Si no hay plantilla en base de datos, hay un archivo por defecto por idioma.
- El texto de los mensajes **nunca** va fijo en el código de los disparadores: siempre una plantilla.
- Los valores se escapan al renderizar para evitar inyección.

### 5.8 Preferencias del paciente
- Interruptores por canal (correo, WhatsApp, SMS, notificaciones del navegador) y por tipo de mensaje (todos activos al crear).
- Para WhatsApp: fecha de aceptación (opt-in) y fecha del último mensaje entrante.
- Idioma preferido (por defecto español).
- Desactivar WhatsApp o marcar "no contactar" cancela los borradores pendientes.
- La pantalla de la ficha solo muestra el control de consentimiento de WhatsApp si el centro usa un conector que lo exige.

### 5.9 Conectores
- **Contrato común:** cada conector declara a qué canal sirve, si está disponible para un centro (tiene configuración activa), cómo enviar y, opcionalmente, normalizar destinatarios, exigir opt-in, admitir respuestas libres, exigir plantilla de proveedor, o diferir a entrega manual. Un conector se registra al activarse el módulo y se retira al desinstalarlo.
- **Correo:** integrado. Proveedores: servidor SMTP propio del centro (host, puerto, usuario, contraseña cifrada, TLS/SSL, remitente y nombre), consola (desarrollo) o deshabilitado. En producción sin proveedor reportaría fallo, nunca éxito falso. Hay prueba de conexión y de envío.
- **SMS:** configuración por centro (proveedor, credenciales cifradas, número remitente, activo). Registro de proveedores intercambiable. El original solo traía un proveedor de **simulación que registra y dice haber enviado sin enviar nada**; cualquier otro daba error honesto de "no implementado". Provee una prueba en seco que no envía. **Requisito para dent-view:** un proveedor real y que la interfaz nunca sugiera envío real mientras sea simulación. Credenciales cifradas en reposo y enmascaradas al devolverlas; no hay herramientas de automatización en SMS.
- **WhatsApp por proveedor (API oficial a través de un intermediario):** configuración por centro con clave y secreto de webhook cifrados e identificador del número. Envía plantillas aprobadas o texto libre dentro de ventana. Recibe webhooks **públicos** firmados: identifica el centro por el número que aparece en el mensaje (**nunca confía en un identificador de centro enviado en el cuerpo**), verifica una firma HMAC sobre el cuerpo crudo con el secreto del centro, registra entrantes y acuses; es idempotente por identificador de mensaje. Sincroniza plantillas aprobadas y permite mapearlas a tipos de mensaje. Prueba de conexión.
- **WhatsApp por webhook propio (Zapier/Make/n8n):** el centro pega una URL; el sistema le envía cada mensaje como petición firmada (esquema de marca de tiempo + firma HMAC, que el receptor verifica sobre el cuerpo crudo). El contenido incluye tipo de evento, destinatario, nombre, identificadores, clave de plantilla, idioma, tipo de mensaje, texto, contexto y fecha. Respuesta 2xx = enviado; un identificador en la respuesta se toma como id del proveedor. Sin endpoint de entrada (fire-and-forget). El secreto se genera en el servidor, se muestra **una sola vez** y se rota a pedido. **Protección SSRF:** la URL debe ser https y resolver a IP pública, validada al guardar y **otra vez antes de cada envío**. El formato del contenido es un contrato público: cambiarlo es un cambio incompatible.
- Si hay dos conectores de WhatsApp, prevalece el **configurado** por el centro; el más recientemente registrado solo desempata.

### 5.10 Notificaciones en el navegador (push)
Conector integrado, activo solo si hay claves de identificación de servidor configuradas. Envía a todas las suscripciones del paciente; las que el servicio de push informe como inexistentes o expiradas se eliminan. Para suscribirse, el personal genera un enlace de un solo uso con vencimiento que el paciente abre (sin cuenta) y acepta. El destinatario registrado es un conteo, no una dirección.

## 6. Reglas de negocio y validaciones

1. Nada de red dentro de la petición: todo envío pasa por la bandeja y el proceso programado.
2. "No contactar", rechazo por tipo y rechazo por canal son **absolutos** (también con envío forzado). Solo la configuración del centro es evitable con envío forzado.
3. Se envía por un único canal por mensaje (primer viable), no por todos.
4. Toda decisión negativa deja un mensaje **omitido con motivo** legible, para auditoría.
5. La clave de no repetición garantiza idempotencia por mensaje lógico.
6. Todo se filtra por centro; los webhooks resuelven el centro por datos propios del proveedor, nunca por lo que diga el cuerpo.
7. Secretos cifrados en reposo, enmascarados en lecturas, no se registran.
8. Mínimos datos personales hacia proveedores; **nunca texto clínico libre** en mensajes.
9. Teléfono único como fuente para SMS y WhatsApp (formato internacional).
10. Los eventos legados de correo se publicaron en paralelo durante una transición (descartable en dent-view).
11. Cada tipo nuevo exige registro en vocabulario, configuración por defecto y preferencias.

## 7. Estados del mensaje

En cola → enviando → enviado → entregado → leído (acuses del proveedor).
En cola/enviando → fallido (con reintento hasta el máximo; sigue elegible mientras queden intentos).
En cola → omitido (decisión de consentimiento, canal, límite o configuración).
Enviando → esperando entrega manual → enviado (por declaración del personal) u omitido.
Entrada: recibido.
Terminales: enviado/entregado/leído, omitido, fallido sin intentos.

## 8. Datos de negocio

- Mensaje: centro, canal, dirección (de entrada o salida), destinatario o remitente, paciente, clave de plantilla, tipo (plantilla o libre), asunto, texto, estado, intentos, máximo de intentos, hora del próximo intento, proveedor, id externo, error, clave de no repetición, fechas de envío/entrega/lectura, evento y usuario de origen, contexto.
- Plantilla: centro (o sistema), canal, tipo, idioma, asunto, cuerpo HTML y texto, nombre/estado de plantilla del proveedor, variables, activa.
- Preferencias del paciente: interruptores por canal, aceptación de WhatsApp, último entrante, interruptores por tipo, idioma.
- Configuración del centro: canal preferido, respaldo, canales manuales, tope SMS, configuración por tipo.
- Configuración por canal: conector elegido, habilitado, verificado.
- Servidor de correo, SMS, WhatsApp proveedor y WhatsApp webhook: credenciales cifradas y datos no secretos de visualización.
- Suscripciones push y enlaces de suscripción.

## 9. Casos borde

- Paciente sin correo ni teléfono → se omite al encolar disparos automáticos.
- Canal preferido no instalado → se usa el siguiente de la lista o se omite "sin canal viable".
- Tope de SMS agotado con WhatsApp disponible → sale por WhatsApp.
- Plantilla de proveedor retirada o no aprobada entre el encolado y el envío → fallido con motivo.
- Consentimiento retirado entre el encolado y el envío → omitido.
- Supresión de datos mientras el conector trabaja → revalidación antes de dejar un borrador manual.
- Dos procesos de despacho simultáneos → nunca el mismo mensaje.
- Webhook duplicado del proveedor → se ignora.
- Firma inválida o centro desconocido → rechazo, sin efecto.
- URL del webhook propio apunta a red privada o a http → rechazo al guardar y antes de enviar.
- Correo sin proveedor en producción → fallido, no éxito.
- Plantilla ausente en la base de datos → plantilla por defecto del sistema; sin ninguna → fallo claro.
- Variables ausentes en el contexto → el render no debe romper; mostrar vacío.

## 10. Criterios de aceptación

1. Un paciente "no contactar" no recibe nada por ningún canal, ni con envío forzado; queda un registro omitido con motivo.
2. Un paciente que rechazó "recordatorio de cita" no lo recibe aunque el proceso programado fuerce el envío.
3. Dos solicitudes con la misma clave de no repetición generan un solo mensaje.
4. Si la operación de negocio se revierte, no queda mensaje en cola.
5. Con SMS y WhatsApp configurados y tope de SMS agotado, el mensaje sale por WhatsApp; sin otro canal queda omitido por límite.
6. Un mensaje proactivo de WhatsApp sin plantilla aprobada no se envía por ese canal.
7. Una respuesta libre solo sale dentro de las 24 horas posteriores al último mensaje del paciente.
8. Un fallo del proveedor reintenta con esperas crecientes hasta el máximo y luego queda fallido.
9. Un webhook de WhatsApp con firma inválida es rechazado y uno repetido no duplica registros.
10. La URL de la automatización propia solo acepta https con IP pública, validada al guardar y al enviar.
11. El secreto de la automatización propia se muestra una sola vez y puede rotarse.
12. Credenciales de proveedores nunca aparecen en respuestas.
13. Un centro puede sobrescribir una plantilla del sistema y el envío usa la del centro.
14. El idioma del mensaje sigue la preferencia del paciente, luego la del centro, luego español.
15. La conversación de un paciente muestra entrantes y salientes en orden cronológico.
16. Tras una supresión de datos, los mensajes del canal afectado quedan sin destinatario ni cuerpo y los pendientes se cancelan.
17. La interfaz nunca indica "enviado" cuando el proveedor de SMS es de simulación.

## 11. Relación con otros módulos

Cita, presupuesto, factura, paciente, seguimiento (03), protección de datos (02: supresión, autorizaciones), bitácora (eventos de mensaje), agenda (enlaces de check-in).

## 12. Adaptación a dent-view

### Contexto
Mensajes que importan a un centro de radiología con remitentes: confirmación y recordatorio de cita, indicaciones de preparación, **aviso de que el informe/imágenes están listos**, aviso al doctor remitente, seguimiento, cita cancelada o reprogramada, y bienvenida/autorización de datos.

### Qué conservar
- Arquitectura de pasarela: eventos → decisión (consentimiento, canal, límite) → bandeja → despacho con reintentos → registro.
- Preferencias por canal y por tipo; "no contactar" absoluto.
- Un solo canal por mensaje con respaldo.
- Idempotencia, omisión con motivo y confirmación transaccional.
- Plantillas por centro/idioma/canal con respaldo del sistema.
- WhatsApp con plantillas aprobadas y ventana de 24 horas; webhook propio con firma y protección SSRF.
- Conversación entrante/saliente.

### Qué adaptar
1. **Nuevos tipos de mensaje:** informe listo (para paciente y para remitente), orden recibida, preparación del estudio, estudio no realizado/inasistencia, entrega de resultados.
2. **Destinatario adicional: doctor remitente.** Debe poder recibir avisos por correo con enlace seguro al informe; sus preferencias y consentimiento son propios (no es el paciente).
3. **Enlaces seguros:** el informe se entrega por enlace temporal con control de acceso, no adjuntando datos clínicos en el cuerpo. Nunca texto clínico libre por SMS/WhatsApp (principio del original que debe conservarse y endurecerse: solo "su informe está listo" con enlace).
4. **Consentimiento de WhatsApp** conforme a la autorización de datos del módulo 02 (Ley 1581 de 2012) y a las condiciones del proveedor; registrar al proveedor como encargado del tratamiento (contrato).
5. **Proveedor de SMS real** para Colombia (el original solo tenía simulación); números con indicativo +57; costos y tope diario configurables.
6. **Horarios de envío:** no enviar mensajes automáticos fuera de franjas razonables (configurable) y revisar con jurídica las reglas colombianas de contacto con consumidores.
7. **Idioma:** español como único requerido; inglés opcional.
8. **Tope y costos:** el día del tope según la zona horaria del centro.

### Qué descartar
- Idiomas adicionales y plantillas de correo del original (redactar las propias).
- Mensajes de presupuesto, factura electrónica europea y recordatorios de presupuesto si dent-view no los maneja igual (adaptar a la facturación colombiana si aplica).
- Eventos legados duplicados de correo.
- Proveedor SMS de simulación como "solución".
- Conector de WhatsApp específico del intermediario del original: dent-view elegirá su propio proveedor; se conserva el contrato genérico de conector.
- Canal push si no se usará un portal de paciente.
