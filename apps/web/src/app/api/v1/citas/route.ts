import { prisma } from "@dent-view/db";
import { ESTADOS_CITA, utcABogota } from "@/lib/agenda";
import { esquemaCita, guardarCitaEnCentro } from "@/lib/agenda-servicio";
import { ErrorApi } from "@/lib/api-auth";
import { esquemaCitaApi } from "@/lib/api-esquemas";
import { listarApi } from "@/lib/api-lista";
import { enumConsulta, rutaApi, textoConsulta } from "@/lib/api-ruta";
import { citaJson } from "@/lib/api-serializar";

const fechaConsulta = (url: URL, nombre: string) => {
  const v = url.searchParams.get(nombre);
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ErrorApi(400, "fecha_invalida", `${nombre} debe ser una fecha ISO 8601.`);
  return d;
};

export const GET = rutaApi("citas:leer", async (c) => {
  const salaId = textoConsulta(c.url, "salaId", 40);
  const pacienteId = textoConsulta(c.url, "pacienteId", 40);
  const estado = enumConsulta(c.url, "estado", ESTADOS_CITA);
  const desde = fechaConsulta(c.url, "desde");
  const hasta = fechaConsulta(c.url, "hasta");
  return listarApi(c.url, {
    // actualizadoDesde filtra por creadoEn: la cita no tiene columna de actualización.
    filtros: { organizationId: c.organizationId, ...(salaId && { salaId }), ...(pacienteId && { pacienteId }), ...(estado && { estado }), ...((desde || hasta) && { inicio: { ...(desde && { gte: desde }), ...(hasta && { lt: hasta }) } }) },
    consulta: (a) => prisma.cita.findMany(a),
    fecha: (x) => x.creadoEn,
    mapear: citaJson,
  });
});

export const POST = rutaApi("citas:escribir", (c) =>
  c.escribir(esquemaCitaApi, async (d) => {
    // La app guarda fecha + minutos en hora de Bogotá; aquí se convierte el instante ISO y la misma validación decide.
    const { fecha, minutos } = utcABogota(new Date(d.inicio));
    // Mismas reglas de horario que la app (07:00–19:00, bloques de 15 min).
    const v = esquemaCita.safeParse({ salaId: d.salaId, pacienteId: d.pacienteId, ordenId: d.ordenId, fecha, inicioMin: minutos, duracion: d.duracion, notas: d.notas });
    if (!v.success) throw new ErrorApi(422, "cita_no_valida", "La cita debe empezar entre 07:00 y 19:00 (hora de Bogotá), en bloques de 15 minutos, y terminar antes de las 19:00.");
    const res = await guardarCitaEnCentro({
      organizationId: c.organizationId,
      actorId: null,
      datos: v.data,
      detalleEvento: { origen: "api", token: c.token.prefijo },
    });
    if ("error" in res) throw new ErrorApi(res.error.startsWith("Ya hay una cita") ? 409 : 422, res.error.startsWith("Ya hay una cita") ? "cruce_de_sala" : "cita_no_valida", res.error);
    const cita = await prisma.cita.findFirstOrThrow({ where: { id: res.id, organizationId: c.organizationId } });
    return { status: 201, body: { cita: citaJson(cita) } };
  }),
);
