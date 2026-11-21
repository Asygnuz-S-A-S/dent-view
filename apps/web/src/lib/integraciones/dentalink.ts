// Adaptador Dentalink (HealthAtom). SIN VERIFICAR contra una cuenta real: se implementó solo lo que confirma la documentación oficial
// https://api.dentalink.healthatom.com/docs/ (consultada el 2026-11-20). Lo que no confirma la documentación está marcado TODO.
import { obtenerJson, type OpcionesHttp } from "./http.ts";
import { normalizarPaciente } from "./normalizar.ts";
import { ErrorConector, type CitaExterna, type Conector, type PacienteExterno } from "./tipos.ts";

// URL base FIJA (documentación: "Todas las llamadas deben usar HTTPS"): el usuario no la escribe, así que no hay SSRF.
export const BASE_DENTALINK = "https://api.dentalink.healthatom.com/api/v1";
const MAX_PAGINAS = 200;

type Pagina = { data?: unknown; links?: { next?: unknown } };

// Documentado: `Authorization: Token <access_token>`; el token lo genera el administrador en Configuración API.
const cabeceras = (cred: Record<string, string>) => ({ Authorization: `Token ${cred.token ?? ""}` });

/** Lee todas las páginas de un listado GET. Documentado: la respuesta trae `links.next` con `?cursor=`; solo se toma el cursor y se reconstruye la URL base fija. */
async function leerTodo(ruta: string, consulta: string, cred: Record<string, string>, http: OpcionesHttp): Promise<unknown[]> {
  const filas: unknown[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const params: string = cursor ? `cursor=${encodeURIComponent(cursor)}` : consulta;
    const r = (await obtenerJson(`${BASE_DENTALINK}${ruta}${params ? `?${params}` : ""}`, cabeceras(cred), http)) as Pagina;
    if (Array.isArray(r.data)) filas.push(...r.data);
    const siguiente: unknown = r.links?.next;
    cursor = typeof siguiente === "string" ? new URL(siguiente, BASE_DENTALINK).searchParams.get("cursor") : null;
    if (!cursor) return filas;
  }
  throw new ErrorConector("El proveedor devolvió demasiadas páginas");
}

type Fila = Record<string, unknown>;
const cadena = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** Campos documentados de GET /pacientes: id, rut, nombre, apellidos, fecha_nacimiento ("0000-00-00" = sin fecha), celular, telefono, email, direccion. */
export function pacienteDeDentalink(f: Fila): PacienteExterno | null {
  return normalizarPaciente({
    idExterno: cadena(f.id),
    // TODO: `tipo_documento` es un entero cuyo significado no está en la documentación consultada: se asume cédula (CC).
    tipoDocumento: "CC",
    numeroDocumento: cadena(f.rut),
    nombre: [cadena(f.nombre), cadena(f.apellidos)].filter(Boolean).join(" "),
    fechaNacimiento: cadena(f.fecha_nacimiento),
    celular: cadena(f.celular) || cadena(f.telefono),
    correo: cadena(f.email),
    direccion: cadena(f.direccion),
  });
}

/**
 * Campos documentados de GET /citas: id, id_paciente, fecha ("2018-11-02"), hora_inicio/hora_fin ("09:00:00"),
 * estado_anulacion (1 = anulada), estado_confirmacion (1 = confirmada), nombre_sillon.
 */
export function citaDeDentalink(f: Fila): CitaExterna | null {
  // TODO: la documentación no indica la zona horaria de fecha/hora: se asume hora de Colombia (-05:00).
  const inicio = new Date(`${cadena(f.fecha)}T${cadena(f.hora_inicio)}-05:00`);
  const fin = new Date(`${cadena(f.fecha)}T${cadena(f.hora_fin)}-05:00`);
  if (!cadena(f.id) || !cadena(f.id_paciente) || Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fin <= inicio) return null;
  return {
    idExterno: cadena(f.id), idPacienteExterno: cadena(f.id_paciente), inicio, fin,
    estado: Number(f.estado_anulacion) === 1 ? "CANCELADA" : Number(f.estado_confirmacion) === 1 ? "CONFIRMADA" : "PROGRAMADA",
    sala: cadena(f.nombre_sillon).slice(0, 40) || null,
  };
}

export function crearDentalink(http: OpcionesHttp = {}): Conector {
  return {
    clave: "dentalink",
    nombre: "Dentalink",
    descripcion: "Sistema de gestión para clínicas dentales de HealthAtom. Trae pacientes y citas.",
    verificado: false,
    advertencia: "Requiere tu propia API key (token) de Dentalink, que se genera en Administrador > Configuración API. Implementado según la documentación oficial pero no probado contra una cuenta real.",
    campos: [{ clave: "token", etiqueta: "Token de acceso de Dentalink", secreto: true }],
    async probarConexion(cred) {
      if (!cred.token) return { ok: false, mensaje: "Falta el token" };
      try {
        await obtenerJson(`${BASE_DENTALINK}/pacientes`, cabeceras(cred), { ...http, intentos: 1 });
        return { ok: true, mensaje: "Conexión correcta" };
      } catch (e) {
        return { ok: false, mensaje: e instanceof ErrorConector ? e.message : "No se pudo conectar" };
      }
    },
    // TODO: la documentación no muestra un filtro por fecha de modificación de pacientes: se lee el listado completo en cada sincronización
    // (los vínculos mantienen la operación idempotente). Revisar si `q` admite alguna columna de actualización.
    async listarPacientes(cred) {
      return (await leerTodo("/pacientes", "", cred, http)).map((f) => pacienteDeDentalink(f as Fila)).filter((p): p is PacienteExterno => !!p);
    },
    // TODO: el filtro `q={"columna":{"gte":...}}` y la columna `fecha_actualizacion` (presente en la respuesta) están documentados por separado,
    // pero no hay un ejemplo que filtre citas por `fecha_actualizacion`: confirmar con una cuenta real.
    async listarCitas(cred, desde) {
      const margen = desde ? new Date(desde.getTime() - 24 * 3_600_000).toISOString().slice(0, 19).replace("T", " ") : null;
      const q = margen ? `q=${encodeURIComponent(JSON.stringify({ fecha_actualizacion: { gte: margen } }))}` : "";
      return (await leerTodo("/citas", q, cred, http)).map((f) => citaDeDentalink(f as Fila)).filter((c): c is CitaExterna => !!c);
    },
    // TODO: sin publicarResultados: la documentación consultada no muestra un endpoint para adjuntar resultados.
  };
}
