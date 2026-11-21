import { prisma } from "@dent-view/db";
import { esquemaOrdenApi } from "@/lib/api-esquemas";
import { listarApi } from "@/lib/api-lista";
import { ErrorApi } from "@/lib/api-auth";
import { enumConsulta, rutaApi, textoConsulta } from "@/lib/api-ruta";
import { ordenJson } from "@/lib/api-serializar";
import { ESTADOS_ORDEN } from "@/lib/ordenes";
import { crearOrdenEnCentro } from "@/lib/ordenes-servicio";

export const GET = rutaApi("ordenes:leer", async (c) => {
  const estado = enumConsulta(c.url, "estado", ESTADOS_ORDEN);
  const pacienteId = textoConsulta(c.url, "pacienteId", 40);
  return listarApi(c.url, {
    filtros: { organizationId: c.organizationId, ...(estado && { estado }), ...(pacienteId && { pacienteId }) },
    campoActualizado: "actualizadoEn",
    consulta: (a) => prisma.orden.findMany({ ...a, include: { items: true } }),
    fecha: (o) => o.creadoEn,
    mapear: ordenJson,
  });
});

export const POST = rutaApi("ordenes:escribir", (c) =>
  c.escribir(esquemaOrdenApi, async (d) => {
    let doctorId = d.doctorId ?? null;
    if (d.doctorCorreo) {
      const m = await prisma.member.findFirst({ where: { organizationId: c.organizationId, role: "doctor_remitente", user: { email: { equals: d.doctorCorreo, mode: "insensitive" } } } });
      if (!m) throw new ErrorApi(422, "doctor_no_valido", "Doctor remitente no válido.");
      doctorId = m.userId;
    }
    // Los precios no vienen del cliente: crearOrdenEnCentro los recalcula con resolverPrecio.
    const res = await crearOrdenEnCentro({
      organizationId: c.organizationId,
      actorId: null,
      esDoctor: false,
      datos: { pacienteId: d.pacienteId, doctorId, entrega: d.entrega, embarazo: false, observaciones: d.observaciones, items: d.servicios },
      detalleEvento: { origen: "api", token: c.token.prefijo },
    });
    if ("error" in res) throw new ErrorApi(422, "orden_no_valida", res.error);
    const orden = await prisma.orden.findFirstOrThrow({ where: { id: res.id, organizationId: c.organizationId }, include: { items: true } });
    return { status: 201, body: { orden: ordenJson(orden) } };
  }),
);
