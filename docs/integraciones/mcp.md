# Servidor MCP de dent-view

Permite que un asistente de IA (Claude, etc.) **consulte** datos del centro. Es de **solo lectura**: ninguna herramienta escribe.

- Endpoint: `POST /api/mcp` (Streamable HTTP, sin estado, un servidor por petición, respuestas JSON). `GET`/`DELETE` devuelven 405.
- Autenticación: `Authorization: Bearer dvk_…` con **los mismos tokens de la API** (se crean en Integraciones > API y tokens). El centro sale del token; el cliente no puede elegirlo. Sin token, inválido, vencido o revocado: 401 uniforme.
- Las herramientas visibles dependen de los permisos del token (`tools/list` solo muestra las permitidas).
- Límite: 60 peticiones por minuto por token (429 con `Retry-After`) y 64 KB por cuerpo. Resultados: máximo 25 por consulta y 40 000 caracteres por respuesta (se marca `truncado`).

## Conectar un cliente

```bash
claude mcp add --transport http dent-view https://<host>/api/mcp --header "Authorization: Bearer dvk_…"
```

(sintaxis verificada con `claude mcp add --help`). Cualquier cliente MCP con transporte HTTP y cabeceras personalizadas sirve.

## Herramientas

| Herramienta | Permiso | Qué devuelve |
|---|---|---|
| `buscar_pacientes` | `pacientes:leer` | Pacientes por nombre o documento |
| `ver_paciente` | `pacientes:leer` | Identificación, edad y conteos de órdenes/citas/estudios |
| `listar_ordenes` | `ordenes:leer` | Órdenes, filtro por estado y fechas |
| `ver_orden` | `ordenes:leer` | Orden por número: estado, servicios y precios |
| `listar_estudios` | `estudios:leer` | Estudios con estado y modalidad (**sin DICOM**) |
| `estado_estudio` | `estudios:leer` | Estado de un estudio |
| `listar_citas` | `citas:leer` | Citas de un día, opcionalmente de una sala |
| `ver_catalogo` | `catalogo:leer` | Servicios activos con precios COP |
| `listar_doctores` | `doctores:leer` | Doctores remitentes y especialidad |

Todas validan sus entradas con esquemas estrictos (propiedades extra, ids con caracteres raros o `limite` > 25 se rechazan).

## Privacidad (Ley 1581)

Por defecto:

- Nombres como **iniciales** por palabra (`L. V. G. R.`).
- Documentos **enmascarados** (`****0101`).
- **Nunca** se devuelve: correo, celular, dirección, alertas, notas del paciente, notas clínicas, historia clínica, hallazgos, observaciones de órdenes, opciones de ítems, notas de citas, descripciones de estudios, UIDs DICOM, ni texto libre escrito por usuarios.

Con el permiso `pii` en el token se devuelven nombre y documento completos (pacientes y doctores), pero **igualmente sin contacto ni contenido clínico**. Asigna `pii` solo a quien lo necesite.

### Texto de la base = datos, no instrucciones

Los textos (nombres, servicios, salas) vienen de la base y pueden contener frases como «ignora lo anterior…». El servidor los limpia (sin caracteres de control, longitud acotada) y cada respuesta lleva un campo `aviso` que lo recuerda, pero **ninguna herramienta puede escribir ni ejecutar nada**, así que un texto así no puede cambiar datos. El cliente debe tratar los resultados como datos y no darles autoridad.

## Auditoría y errores

Cada llamada a una herramienta crea un `Evento` `mcp.llamada` con la herramienta y el prefijo del token (nunca los argumentos, que pueden tener datos personales). Los errores hacia el cliente son genéricos («No se pudo completar la consulta»); el detalle queda en el log del servidor.

## Datos de prueba

```bash
DATABASE_URL=… npx tsx scripts/seed-mcp.ts       # token de lectura para radex-demo (se imprime una vez)
DATABASE_URL=… npx tsx scripts/seed-mcp.ts pii   # token con permiso pii
```

## Limitación conocida

El límite de peticiones vive en memoria del proceso: con varias réplicas de la web cada una cuenta aparte (ver `src/lib/mcp/autenticacion.ts`).
