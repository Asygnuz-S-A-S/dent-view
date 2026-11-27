# Entorno de demostración comercial

Datos 100 % ficticios en cuatro centros (Lumia y Radia vinculados entre sí, Alejandro y Orion). Todo se genera con semilla fija (mismo resultado cada vez, salvo las fechas, que son relativas a `FECHA_BASE`).

```
cd apps/web
npx tsx scripts/demo/index.ts --reset                 # borra todo (menos el superadmin) y crea la demo
npx tsx scripts/demo/index.ts --solo-datos            # no borra; si el centro ya tiene datos solo actualiza centro/usuarios/miembros
npx tsx scripts/demo/verificar.ts                     # conteos e invariantes (código 1 si algo falla)
```
Si se pasan los dos flags gana `--solo-datos` (no se borra nada). Sin `--reset` el script se niega a correr si hay más de 5 usuarios que no sean demo (`*ejemplo.invalid`) ni el superadmin.

## Verificación en producción
`apps/web/tests/produccion/remision-produccion.spec.ts` (solo lectura; `CLAVE_DEMO` y `BASE_URL` por entorno): `CLAVE_DEMO=… BASE_URL=https://dentview.asygnuz.com npx playwright test -c playwright.produccion.config.ts --project=remision`.

## Entorno
`DATABASE_URL` (dueño de la BD), `ORTHANC_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_ESTUDIOS`, `S3_BUCKET_ORTHANC`, `BETTER_AUTH_SECRET`, `CIFRADO_SECRETO`, `ADMIN_EMAIL`, `ADMIN_NOMBRE`, `ADMIN_HASH` (hash scrypt de Better Auth), `DEMO_CLAVE` (>= 10 caracteres), `FECHA_BASE` opcional (AAAA-MM-DD).

Requisitos: Node con `tsx`; Python 3 con `pydicom` y `numpy` en `scripts/demo/.venv` (`python3 -m venv .venv && .venv/bin/pip install pydicom numpy`) o en el `python3` del PATH (variable `PYTHON`). Las fuentes de las imágenes SVG usan DejaVu/Helvetica/Arial (cualquier Linux con fuentes básicas sirve).

**Importante para la app:** los `admin_tenant` exigen 2FA. Para que la demo no lo pida, la app debe arrancar con
`MFA_EXENTOS=admin@lumia.ejemplo.invalid,admin@radia.ejemplo.invalid,admin@alejandro-restrepo.ejemplo.invalid,admin@orion-laboratorio.ejemplo.invalid`.
El superadmin (`ADMIN_EMAIL`) siempre necesita su 2FA (si no lo tiene, la app lo manda a /perfil a activarlo).

## Qué hace `--reset`
1. Imprime conteos de lo que va a borrar. 2. `TRUNCATE ... RESTART IDENTITY CASCADE` de todas las tablas públicas salvo `_prisma_migrations`, `User`, `Account`, `Session`, `TwoFactor`, `PerfilDoctor`, `Verification`, en una transacción; borra los usuarios distintos de `ADMIN_EMAIL` (cascada a cuentas/sesiones/2FA) y limpia `activeOrganizationId` de sesiones. 3. `DELETE` de todos los estudios de Orthanc por REST. 4. Borra los objetos `tenants/` del bucket de estudios. Luego crea/actualiza el superadmin (role `admin`, cuenta credential con `ADMIN_HASH`, 2FA intacto) y lo agrega como `admin_tenant` en los 4 centros.

## Usuarios (clave: `DEMO_CLAVE`, la misma para todos)
| Centro | Correo | Rol | Para qué escena |
|---|---|---|---|
| Lumia Imágenes Dentales (`lumia`, radiológico, Manizales) | admin@lumia.ejemplo.invalid | admin_tenant | Inicio, reportes, cartera, caja, convenios, seguimiento de doctores, ajustes |
| | recepcion@, tecnico1@, tecnico2@ `lumia.ejemplo.invalid` | recepcion | Agenda del día, órdenes, ingreso de pacientes, facturación y pagos |
| | radiologo1@, radiologo2@ `lumia.ejemplo.invalid` | especialista | Informes (borradores y emitidos), visor de estudios |
| | marcela.rios, ricardo.salazar, juliana.pineda, felipe.aguirre, catalina.duque, mauricio.toro, tatiana.bedoya, alvaro.escobar, veronica.osorio, cristian.londono `@lumia.ejemplo.invalid` | doctor_remitente | Vista del remitente: solo sus órdenes, estudios e informes |
| Radia Centro Radiológico (`radia`, Bogotá) | admin@, recepcion@, recepcion2@, radiologo@, gustavo.rojas, lucia.mora, hector.cano, karen.cifuentes, simon.bermudez `@radia.ejemplo.invalid` | admin_tenant / recepcion / especialista / doctor_remitente | Centro mediano y joven, mismas piezas en menor volumen |
| Alejandro Restrepo Odontología (`alejandro-restrepo`, consultorio) | admin@alejandro-restrepo.ejemplo.invalid | admin_tenant + odontólogo | Pacientes con foto, odontograma, plan, agenda, valoraciones, CRM, laboratorio |
| | recepcion@alejandro-restrepo.ejemplo.invalid | recepcion (sin 2FA) | Valoraciones sin contenido clínico (M5): ve etapa, contacto y conteos, nunca motivo, fotos, comentarios ni notas |
| Orion Laboratorio Dental (`orion-laboratorio`, Medellín, tipo `LABORATORIO_DENTAL`) | admin@, tecnico1@, tecnico2@ `orion-laboratorio.ejemplo.invalid` | admin_tenant / recepcion | Tablero de laboratorio (paginado), facturación, cartera y convenios por volumen. Sin Agenda, Estudios ni Informes |
| | monica.valencia, rodrigo.mesa, lorena.zapata, ivan.correa, paula.agudelo, samuel.henao `@orion-laboratorio.ejemplo.invalid` | doctor_remitente (odontólogos clientes) | Clientes con convenio por volumen |
| Todos | `ADMIN_EMAIL` | superadmin + admin_tenant en los 4 centros | Cambiar de centro con el selector |

## Guion de demo (20 minutos)
1. **(2 min) Lumia, admin**: Inicio (citas de hoy en 3 salas, estudios, informes en borrador) y Reportes (producción, cobros, cartera, top doctores, estudios por modalidad).
2. **(2 min) Agenda y órdenes** (recepción): agenda de hoy con estados Programada/Llegó/En atención/Atendida y las próximas dos semanas; abrir una orden con convenio y ver el precio resuelto.
3. **(3 min) Estudios y visor**: lista de estudios (panorámica, cefalométrica, periapical, bite wing, CBCT, escaneo facial 3D); abrir un CBCT en el visor y la malla facial.
4. **(2 min) Informes** (radiólogo): borradores por firmar, un informe emitido con PDF de marca y código de verificación; entregas con enlace (vistas/vencidas).
5. **(2 min) Cartera y caja** (admin): tramos 0-30/31-60/61-90/>90, cuentas a cargo del doctor y de convenios, anticipos, notas crédito, cierres de caja.
6. **(1 min) Seguimiento de doctores**: semáforo Activo/En riesgo/Inactivo/Crítico/Nuevo con gestiones y próximos contactos; la vista de un doctor remitente.
7. **(2 min) Alejandro**: ficha de paciente con foto y odontograma, agenda de la semana, CRM con 30 leads, secuencias instaladas e inactivas, laboratorio y **valoraciones virtuales** (ver abajo).
   - `/valoraciones` trae 16 solicitudes, una o más en cada etapa: Enviada (2), Abierta (2, con 2 de 7 tomas; una con 1 recordatorio), Material recibido (2, una con dolor 8/10 y video), En revisión (2, con notas internas y comentarios por foto), Esperando otra toma (2; una pide repetir una toma ya subida), Respondida (2; una sin enviar y otra que recomienda cita presencial), Cotizada (2, con su cotización Enviada y Aceptada), Vencida (1, con 2 recordatorios) y Cancelada (1). Las solicitudes sin paciente tienen su lead `VALORACION_VIRTUAL` en el CRM.
   - En el detalle de una en revisión: abre una foto, escribe un comentario, usa «Comparar», «Pedir otra toma» o «Guardar en la ficha» (pide confirmación; solo funciona en las que ya tienen paciente: las Respondidas y las Cotizadas).
   - Entra como `recepcion@alejandro-restrepo.ejemplo.invalid` para mostrar que recepción ve el estado y los conteos pero no el motivo, las fotos, los comentarios ni las notas.
   - **Lado paciente en vivo:** los enlaces `/valoracion/<token>` sembrados NO se abren (en la base solo hay hashes ficticios, a propósito). Para mostrarlo, crea una solicitud nueva con solo teléfono (sin correo: así no se envía nada), copia el enlace y el código del diálogo y ábrelos en el celular.
8. **(1 min) Orion**: laboratorio (todas las etapas, trabajos atrasados y tabla paginada), cartera por odontólogo cliente y reportes. El menú no trae Agenda, Estudios ni Informes.
9. **(2 min) Remisiones (Lumia -> Radia)**: `/remisiones` con una remisión en cada estado; abrir la `DEVUELTA` (descargar el informe PDF y abrir el estudio en el visor, solo lectura) y la `RECHAZADA` (motivo); en Radia, `Recibidas` y la orden creada desde la remisión.
10. **(1 min) RIPS y evolutivos**: una orden de Lumia o de Alejandro, pestaña RIPS (datos, lista de verificación, descarga del JSON) y, en Alejandro, la pestaña Evolución de un paciente (folios, firma, adendas).

## Qué trae de nuevo (módulos RIPS, evolutivos, FEV, presupuestos y remisiones)

- **Remisiones Lumia <-> Radia** (`remisiones.ts`, se corre una vez tras construir los dos centros): vínculo `ACTIVO` en los dos sentidos y siete remisiones con las mismas reglas de la app (`copiaMinima`, `Autorizacion` de consentimiento versión `2026-11`, un `RemisionEvento` por transición, paciente y orden del destino propios). Lumia->Radia: `ENVIADA`, `RECIBIDA`, `EN_PROCESO` (orden en Radia), `DEVUELTA` (orden `INFORMADA`, cita atendida, estudio DICOM `PUBLICADO` en Orthanc con la etiqueta de Radia, informe `EMITIDO` con PDF y cuenta de cobro pagada), `RECHAZADA` (con motivo) y `CANCELADA`; Radia->Lumia: una `ENVIADA`. El paciente del destino solo tiene lo autorizado (nunca correo, dirección, alertas, foto ni datos RIPS).
- **RIPS** (Lumia, Radia, Alejandro): `ConfigFacturacion` (NIT con DV, código de prestador `DEMO…`, modalidad, grupo), CUPS y tipo RIPS en servicios y en los ítems de cada orden (solo códigos del catálogo embebido: los servicios sin equivalente quedan sin CUPS y su orden sale "incompleta" a propósito), diagnóstico CIE-10, finalidad, vía de ingreso, tipo de usuario y profesional en las órdenes, sexo/municipio/zona en los pacientes. ~10 % de las órdenes de radiología sin diagnóstico (lista "Incompletas"); Alejandro tiene 60 órdenes completas. Se generan ya 8 RIPS por radiología y 6 en Alejandro con el mismo código de la app (JSON en S3 + `EnvioRips`).
- **Evolutivos** (Alejandro, `evolutivos.ts`): 7 plantillas base, 60 evolutivos firmados de 28 pacientes ligados a su orden y cita (folio consecutivo por paciente, hash de contenido idéntico al de la app, método `CLAVE`) y 6 adendas. Lumia y Radia llevan `RegistroToma` por cada estudio atendido.
- **Presupuestos virtuales** (Alejandro): 14 en todos los estados visibles (Borrador, Enviada, Vista, Aceptada, Rechazada, Vencida, Anulada, Convertida) con ítems, fases, vigencia y, los enviados, hash de token y de código (los tokens en claro no se guardan ni se imprimen: los enlaces `/presupuesto/<token>` no se pueden abrir, a propósito).
- **Facturación electrónica: decisión.** El proveedor `SIMULADO` solo existe en localhost (`FEV_SIMULADO`), nunca en producción, así que la demo NO crea `ConexionFE` ni `DocumentoElectronico`. Lumia deja `emiteFev = true` (se ve la columna FEV en Facturación, con todas las cuentas "—" = no enviadas, y los ajustes en Integraciones > Facturación electrónica sin proveedor conectado); Radia y Alejandro `emiteFev = false`. `verificar.ts` exige 0 conexiones y 0 documentos.
- **Pantallas de la demo corregidas:** historia previa de 6+ meses con volumen parejo (Lumia 720 órdenes en 12 meses, Radia 322 en 6, Orion 440 trabajos en 7) para que Reportes no muestre porcentajes absurdos (`verificar.ts` compara periodos de 30 días y el mes en curso); más estudios DICOM repartidos en toda la historia (Lumia 40, Radia 25 con el devuelto, Alejandro 8); ninguna fecha "ocurrida" en el futuro (`Acum.volcar` recorta, p. ej. el "Recibido" del laboratorio); segundo nombre del mismo género que el primero; nombres de paciente en mayúscula inicial en las listas de Órdenes, Facturación y Cartera; texto del escaneo facial sin "Arrastra Para Girar".

Las órdenes y evolutivos nuevos solo aparecen con `--reset` (con `--solo-datos` un centro ya poblado no se regenera).

## Notas de diseño
- Nada puede enviar mensajes: pacientes, leads y valoraciones sin correo (el cron de recordatorios de valoración exige correo, así que nunca envía en la demo), ningún mensaje `EN_COLA`, secuencias/fidelización/agenda pública/webhooks/integraciones inactivos, sin pasarelas.
- Estudios DICOM sintéticos (figuras con la marca DEMO) con etiqueta `tenant-<organizationId>` y filas `Estudio` creadas antes de subir (el worker solo actualiza datos técnicos). El id de Orthanc se calcula (SHA-1 de `PatientID|StudyUID`) y se comprueba al subir. Los pacientes con estudio usan `CC` y `PatientID` = documento, como espera el worker.
- Solo los estudios DICOM (Lumia ~16, Radia ~7, Alejandro 3) tienen imagen; las demás órdenes tomadas no tienen fila `Estudio` (los tableros que cuentan estudios reflejan solo esos).
- `EstadoLab` solo tiene 5 valores: en Orion la etapa fina (diseño, proceso, prueba, repetir) va en `notas` y en el estado de la orden.
- Orion es de tipo `LABORATORIO_DENTAL` (migración `20261126100000_tipo_laboratorio_dental`, módulos en `lib/tipo-centro.ts`): conserva laboratorio, órdenes, convenios por volumen, facturación y cartera y oculta Agenda, Estudios, Informes, CRM y Remisiones; sus convenios de volumen ahora sí se ven. No se siembran bodega, pasarelas ni reservas públicas.

## Valoraciones virtuales (`valoraciones.ts`)
- Reemplaza las 4 valoraciones antiguas de `odontologo.ts`. Cuestionarios validados con el esquema de la app al sembrar y otra vez en `verificar.ts` (≥ 15 valoraciones, una por etapa del tablero, ≥ 2 cotizadas, lead por cada solicitud sin paciente, objetos S3 presentes).
- Fotos: `fotoValoracionJpeg(angulo, variante)` en `imagenes.ts` (dibujos con la marca «DEMO · imagen sintética»; ninguna foto real). Original, copia web y miniatura en `tenants/<centro>/valoraciones/<id>/<medio>/` con las claves de la app.
- Video: `assets/valoracion-apertura-demo.mp4` (14 s, ~118 KB, sintético, versionado en el repo). Se regeneró con
  `ffmpeg -f lavfi -i "testsrc=duration=14:size=480x360:rate=24" -pix_fmt yuv420p -c:v libx264 -preset slow -crf 16 -an -movflags +faststart assets/valoracion-apertura-demo.mp4`.
  Si el archivo no existe, la demo se siembra sin video y lo avisa en el log.
- Las 4 completadas tienen un tiempo recibida→completada de 4, 8, 5 y 7 h (media 6 h); los eventos `valoracion.*` coinciden con `recibidaEn`/`completadaEn`.
- El reinicio de la demo en producción corre `index.ts --reset` desde el repo, así que todo lo de valoraciones (código, imágenes y video) vive en `scripts/demo`.
