// Especificación OpenAPI 3.1 de /api/v1, escrita a mano. Se sirve en GET /api/v1/openapi.json (sin credenciales).
type Obj = Record<string, unknown>;
const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const str = (extra: Obj = {}) => ({ type: "string", ...extra });
const nstr = (extra: Obj = {}) => ({ type: ["string", "null"], ...extra });
const fecha = { type: "string", format: "date-time" };
const obj = (properties: Obj, required?: string[]) => ({ type: "object", properties, ...(required ? { required } : {}) });
const lista = (n: string) => ({ ...obj({ datos: { type: "array", items: ref(n) }, siguienteCursor: nstr({ description: "Pásalo como ?cursor= para la página siguiente; null si no hay más." }) }, ["datos", "siguienteCursor"]) });
const un = (clave: string, n: string, extra: Obj = {}) => obj({ [clave]: ref(n), ...extra }, [clave]);

const paramsLista = [
  { $ref: "#/components/parameters/limite" },
  { $ref: "#/components/parameters/cursor" },
  { $ref: "#/components/parameters/actualizadoDesde" },
];
const q = (name: string, description: string, schema: Obj = { type: "string" }) => ({ name, in: "query", description, schema });
const idPath = { name: "id", in: "path", required: true, schema: { type: "string" } };
const resp = (description: string, schema: Obj) => ({ description, content: { "application/json": { schema } } });
const err = (c: string) => ({ $ref: `#/components/responses/${c}` });
const comunes = { "401": err("NoAutenticado"), "403": err("SinPermiso"), "429": err("Limite") };
const seg = [{ bearer: [] }];

const get = (summary: string, permiso: string, parameters: Obj[], ok: Obj, extra: Obj = {}) => ({
  get: { summary, "x-permiso": permiso, security: seg, parameters, responses: { "200": ok, "400": err("Invalida"), ...comunes, ...extra } },
});
const idem = { name: "Idempotency-Key", in: "header", description: "Hasta 80 caracteres. Mismo valor + misma petición devuelve la respuesta guardada (24 h); con otro cuerpo responde 422.", schema: { type: "string", maxLength: 80 } };
const cuerpo = (n: string) => ({ required: true, content: { "application/json": { schema: ref(n) } } });

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "API pública de dent-view",
    version: "1.0.0",
    description: "Acceso por centro con tokens `dvk_…`. Cada token pertenece a un solo centro y solo ve sus datos. Fechas ISO 8601 en UTC; montos en pesos colombianos (COP) enteros.",
  },
  servers: [{ url: "/api/v1" }],
  security: seg,
  paths: {
    "/pacientes": {
      ...get("Listar pacientes", "pacientes:leer", [...paramsLista, q("documento", "Número de documento exacto"), q("q", "Texto en nombre o inicio de documento")], resp("Página de pacientes", lista("Paciente"))),
      post: {
        summary: "Crear paciente (o devolver el existente si el documento ya está en el centro)", "x-permiso": "pacientes:escribir", security: seg, parameters: [idem], requestBody: cuerpo("PacienteNuevo"),
        responses: { "200": resp("El documento ya existía en el centro", un("paciente", "Paciente", { creado: { const: false } })), "201": resp("Creado", un("paciente", "Paciente", { creado: { const: true } })), "422": err("Validacion"), ...comunes },
      },
    },
    "/pacientes/{id}": {
      ...get("Obtener paciente", "pacientes:leer", [idPath], resp("Paciente", un("paciente", "Paciente")), { "404": err("NoEncontrado") }),
      patch: { summary: "Actualizar datos de contacto (nunca el documento)", "x-permiso": "pacientes:escribir", security: seg, parameters: [idPath], requestBody: cuerpo("PacienteContacto"), responses: { "200": resp("Paciente", un("paciente", "Paciente")), "404": err("NoEncontrado"), "422": err("Validacion"), ...comunes } },
    },
    "/ordenes": {
      ...get("Listar órdenes", "ordenes:leer", [...paramsLista, q("estado", "Estado de la orden"), q("pacienteId", "Filtra por paciente")], resp("Página de órdenes", lista("Orden"))),
      post: { summary: "Crear orden (el servidor calcula los precios)", "x-permiso": "ordenes:escribir", security: seg, parameters: [idem], requestBody: cuerpo("OrdenNueva"), responses: { "201": resp("Creada", un("orden", "Orden")), "422": err("Validacion"), ...comunes } },
    },
    "/ordenes/{id}": get("Obtener orden con ítems y precios congelados", "ordenes:leer", [idPath], resp("Orden", un("orden", "Orden")), { "404": err("NoEncontrado") }),
    "/citas": {
      ...get("Listar citas", "citas:leer", [...paramsLista, q("salaId", "Sala"), q("pacienteId", "Paciente"), q("estado", "Estado"), q("desde", "Inicio >= (ISO 8601)"), q("hasta", "Inicio < (ISO 8601)")], resp("Página de citas", lista("Cita"))),
      post: { summary: "Crear cita (valida cruce de sala y horario como la app)", "x-permiso": "citas:escribir", security: seg, parameters: [idem], requestBody: cuerpo("CitaNueva"), responses: { "201": resp("Creada", un("cita", "Cita")), "409": err("Cruce"), "422": err("Validacion"), ...comunes } },
    },
    "/estudios": get("Listar estudios (solo metadatos)", "estudios:leer", [...paramsLista, q("estado", "POR_ASIGNAR | ASIGNADO | PUBLICADO"), q("pacienteId", "Paciente"), q("ordenId", "Orden")], resp("Página de estudios", lista("Estudio"))),
    "/estudios/{id}": get("Obtener estudio", "estudios:leer", [idPath], resp("Estudio", un("estudio", "Estudio")), { "404": err("NoEncontrado") }),
    "/informes": get("Listar informes emitidos y vigentes", "informes:leer", [...paramsLista, q("pacienteId", "Paciente"), q("ordenId", "Orden")], resp("Página de informes", lista("Informe"))),
    "/informes/{id}/pdf": {
      get: { summary: "Descargar el PDF emitido", "x-permiso": "informes:leer", security: seg, parameters: [idPath], responses: { "200": { description: "PDF", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } }, "404": err("NoEncontrado"), ...comunes } },
    },
    "/doctores": get("Listar doctores remitentes", "doctores:leer", paramsLista, resp("Página de doctores", lista("Doctor"))),
    "/catalogo": get("Listar servicios activos y precios", "catalogo:leer", paramsLista, resp("Página de servicios", lista("Servicio"))),
    "/salas": get("Listar salas", "citas:leer", [paramsLista[0]!, paramsLista[1]!], resp("Página de salas", lista("Sala"))),
  },
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Token `dvk_…` creado en Integraciones > API y tokens." } },
    parameters: {
      limite: { name: "limite", in: "query", description: "1 a 100 (50 por defecto)", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
      cursor: { name: "cursor", in: "query", description: "Cursor opaco de `siguienteCursor`", schema: { type: "string" } },
      actualizadoDesde: { name: "actualizadoDesde", in: "query", description: "Solo registros modificados desde esta fecha (ISO 8601). Donde el recurso no guarda fecha de actualización, filtra por fecha de creación.", schema: fecha },
    },
    responses: {
      NoAutenticado: resp("Token ausente, inválido, vencido o revocado (mismo mensaje en todos los casos)", ref("Error")),
      SinPermiso: resp("El token no tiene el permiso requerido", ref("Error")),
      NoEncontrado: resp("No existe en este centro", ref("Error")),
      Invalida: resp("Parámetro de consulta inválido", ref("Error")),
      Validacion: resp("Cuerpo inválido, campo desconocido o Idempotency-Key reutilizada con otro cuerpo", ref("Error")),
      Cruce: resp("Ya hay una cita en esa sala a esa hora", ref("Error")),
      Limite: { description: "Límite de peticiones por token (120/min). Reintenta tras `Retry-After` segundos.", headers: { "Retry-After": { schema: { type: "integer" } } }, content: { "application/json": { schema: ref("Error") } } },
    },
    schemas: {
      Error: obj({ error: obj({ codigo: str(), mensaje: str(), detalles: { type: "array", items: obj({ campo: str(), mensaje: str() }) } }, ["codigo", "mensaje"]) }, ["error"]),
      Paciente: obj({ id: str(), tipoDocumento: str({ enum: ["CC", "TI", "CE", "PA", "RC"] }), numeroDocumento: str(), nombre: str(), fechaNacimiento: nstr({ format: "date" }), celular: nstr(), correo: nstr(), direccion: nstr(), creadoEn: fecha }),
      PacienteNuevo: { ...obj({ tipoDocumento: str({ enum: ["CC", "TI", "CE", "PA", "RC"] }), numeroDocumento: str(), nombre: str(), fechaNacimiento: str({ format: "date" }), celular: str(), correo: str({ format: "email" }), direccion: str() }, ["tipoDocumento", "numeroDocumento", "nombre"]), additionalProperties: false },
      PacienteContacto: { ...obj({ celular: nstr(), correo: nstr({ format: "email" }), direccion: nstr() }), minProperties: 1, additionalProperties: false },
      Orden: obj({
        id: str(), numero: { type: "integer" }, estado: str({ enum: ["SOLICITADA", "AGENDADA", "TOMADA", "INFORMADA", "ENTREGADA", "CANCELADA"] }), entrega: str({ enum: ["IMPRESA", "DIGITAL"] }),
        pacienteId: str(), doctorId: nstr(), convenioId: nstr(), embarazo: { type: "boolean" }, observaciones: nstr(),
        items: { type: "array", items: obj({ id: str(), servicioId: nstr(), nombre: str(), opciones: nstr(), precio: { type: "integer", description: "COP, congelado al crear" }, descuento: { type: "integer" } }) },
        total: { type: "integer", description: "COP" }, creadoEn: fecha, actualizadoEn: fecha,
      }),
      OrdenNueva: { ...obj({
        pacienteId: str(), doctorId: str(), doctorCorreo: str({ format: "email", description: "Alternativa a doctorId" }), entrega: str({ enum: ["IMPRESA", "DIGITAL"], default: "DIGITAL" }), observaciones: str(),
        servicios: { type: "array", minItems: 1, items: { ...obj({ servicioId: str({ description: "Id del catálogo" }), opciones: str() }, ["servicioId"]), additionalProperties: false } },
      }, ["pacienteId", "servicios"]), additionalProperties: false, description: "No acepta precios: el servidor los calcula." },
      Cita: obj({ id: str(), salaId: str(), pacienteId: nstr(), ordenId: nstr(), inicio: fecha, fin: fecha, estado: str(), notas: nstr(), creadoEn: fecha }),
      CitaNueva: { ...obj({ salaId: str(), pacienteId: str(), ordenId: str(), inicio: str({ format: "date-time", description: "Entre 07:00 y 19:00 hora de Bogotá, en bloques de 15 min" }), duracion: { type: "integer", enum: [15, 30, 45, 60], description: "Minutos" }, notas: str() }, ["salaId", "pacienteId", "inicio", "duracion"]), additionalProperties: false },
      Estudio: obj({ id: str(), pacienteId: nstr(), ordenId: nstr(), doctorId: nstr(), studyInstanceUid: str(), modalidad: nstr(), descripcion: nstr(), fechaEstudio: { type: ["string", "null"], format: "date-time" }, estado: str({ enum: ["POR_ASIGNAR", "ASIGNADO", "PUBLICADO"] }), creadoEn: fecha, actualizadoEn: fecha }),
      Informe: obj({ id: str(), grupoId: str(), version: { type: "integer" }, pacienteId: str(), ordenId: nstr(), estudioId: nstr(), motivo: nstr(), tecnica: nstr(), hallazgos: str(), impresion: str(), recomendaciones: nstr(), firmanteNombre: nstr(), firmanteTarjeta: nstr(), codigo: nstr(), emitidoEn: { type: ["string", "null"], format: "date-time" }, creadoEn: fecha, actualizadoEn: fecha }),
      Doctor: obj({ id: str(), nombre: str(), correo: str(), especialidad: nstr(), tarjetaProfesional: nstr(), telefono: nstr(), consultorio: nstr(), creadoEn: fecha }),
      Servicio: obj({ id: str(), categoria: str(), nombre: str(), descripcion: nstr(), precioImpreso: { type: ["integer", "null"] }, precioDigital: { type: ["integer", "null"] }, descuento: { type: "integer" }, creadoEn: fecha }),
      Sala: obj({ id: str(), nombre: str(), activa: { type: "boolean" } }),
    },
  },
};
