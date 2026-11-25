# Entorno de demostración comercial

Datos 100 % ficticios en cuatro centros. Todo se genera con semilla fija (mismo resultado cada vez, salvo las fechas, que son relativas a `FECHA_BASE`).

```
cd apps/web
npx tsx scripts/demo/index.ts --reset                 # borra todo (menos el superadmin) y crea la demo
npx tsx scripts/demo/index.ts --solo-datos            # no borra; si el centro ya tiene datos solo actualiza centro/usuarios/miembros
npx tsx scripts/demo/verificar.ts                     # conteos e invariantes (código 1 si algo falla)
```
Si se pasan los dos flags gana `--solo-datos` (no se borra nada). Sin `--reset` el script se niega a correr si hay más de 5 usuarios que no sean demo (`*ejemplo.invalid`) ni el superadmin.

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
| Orion Laboratorio Dental (`orion-laboratorio`, Medellín) | admin@, tecnico1@, tecnico2@ `orion-laboratorio.ejemplo.invalid` | admin_tenant / recepcion | Tablero de laboratorio, facturación y cartera por cliente |
| | monica.valencia, rodrigo.mesa, lorena.zapata, ivan.correa, paula.agudelo, samuel.henao `@orion-laboratorio.ejemplo.invalid` | doctor_remitente (odontólogos clientes) | Clientes con convenio por volumen |
| Todos | `ADMIN_EMAIL` | superadmin + admin_tenant en los 4 centros | Cambiar de centro con el selector |

## Guion de demo (15 minutos)
1. **(2 min) Lumia, admin**: Inicio (citas de hoy en 3 salas, estudios, informes en borrador) y Reportes (producción, cobros, cartera, top doctores, estudios por modalidad).
2. **(2 min) Agenda y órdenes** (recepción): agenda de hoy con estados Programada/Llegó/En atención/Atendida y las próximas dos semanas; abrir una orden con convenio y ver el precio resuelto.
3. **(3 min) Estudios y visor**: lista de estudios (panorámica, cefalométrica, periapical, bite wing, CBCT, escaneo facial 3D); abrir un CBCT en el visor y la malla facial.
4. **(2 min) Informes** (radiólogo): borradores por firmar, un informe emitido con PDF de marca y código de verificación; entregas con enlace (vistas/vencidas).
5. **(2 min) Cartera y caja** (admin): tramos 0-30/31-60/61-90/>90, cuentas a cargo del doctor y de convenios, anticipos, notas crédito, cierres de caja.
6. **(1 min) Seguimiento de doctores**: semáforo Activo/En riesgo/Inactivo/Crítico/Nuevo con gestiones y próximos contactos; la vista de un doctor remitente.
7. **(2 min) Alejandro**: ficha de paciente con foto y odontograma, agenda de la semana, valoración virtual recibida (4 fotos) y completada, CRM con 30 leads, secuencias instaladas e inactivas, laboratorio.
8. **(1 min) Orion**: laboratorio (todas las etapas y trabajos atrasados), cartera por odontólogo cliente y reportes.

## Notas de diseño
- Nada puede enviar mensajes: pacientes y leads sin correo, ningún mensaje `EN_COLA`, secuencias/fidelización/agenda pública/webhooks/integraciones inactivos, sin pasarelas.
- Estudios DICOM sintéticos (figuras con la marca DEMO) con etiqueta `tenant-<organizationId>` y filas `Estudio` creadas antes de subir (el worker solo actualiza datos técnicos). El id de Orthanc se calcula (SHA-1 de `PatientID|StudyUID`) y se comprueba al subir. Los pacientes con estudio usan `CC` y `PatientID` = documento, como espera el worker.
- Solo los estudios DICOM (Lumia ~16, Radia ~7, Alejandro 3) tienen imagen; las demás órdenes tomadas no tienen fila `Estudio` (los tableros que cuentan estudios reflejan solo esos).
- `EstadoLab` solo tiene 5 valores: en Orion la etapa fina (diseño, proceso, prueba, repetir) va en `notas` y en el estado de la orden.
- Convenios de Orion existen en BD pero el tipo de centro oculta ese módulo en la interfaz. No se siembran evolutivos clínicos firmados, bodega, pasarelas ni reservas públicas.
