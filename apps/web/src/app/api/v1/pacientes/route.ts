import { prisma } from "@dent-view/db";
import { esquemaPacienteApi } from "@/lib/api-esquemas";
import { listarApi } from "@/lib/api-lista";
import { pacienteJson } from "@/lib/api-serializar";
import { rutaApi, textoConsulta } from "@/lib/api-ruta";
import { registrarEvento } from "@/lib/eventos";
import { normalizarDocumento } from "@/lib/pacientes";
import { crearPacienteEnCentro } from "@/lib/pacientes-centro";

export const GET = rutaApi("pacientes:leer", async (c) => {
  const documento = textoConsulta(c.url, "documento", 20);
  const q = textoConsulta(c.url, "q");
  const docQ = q ? normalizarDocumento(q) : ""; // "---" normaliza a "" y un startsWith vacío coincidiría con todos
  return listarApi(c.url, {
    // actualizadoDesde filtra por creadoEn: el paciente no tiene columna de actualización.
    filtros: {
      organizationId: c.organizationId,
      ...(documento && { persona: { numeroDocumento: normalizarDocumento(documento) } }),
      ...(q && { OR: [{ nombre: { contains: q, mode: "insensitive" } }, ...(docQ ? [{ persona: { numeroDocumento: { startsWith: docQ } } }] : [])] }),
    },
    consulta: (a) => prisma.pacienteTenant.findMany({ ...a, include: { persona: true } }),
    fecha: (p) => p.creadoEn,
    mapear: pacienteJson,
  });
});

export const POST = rutaApi("pacientes:escribir", (c) =>
  c.escribir(esquemaPacienteApi, async (d) => {
    const { tipoDocumento, numeroDocumento, fechaNacimiento, ...resto } = d;
    const res = await crearPacienteEnCentro(c.organizationId, { tipoDocumento, numeroDocumento }, { ...resto, fechaNacimiento: fechaNacimiento ? new Date(`${fechaNacimiento}T00:00:00Z`) : null });
    const id = "existente" in res ? res.existente : res.creado.id;
    if ("creado" in res) {
      await registrarEvento({ organizationId: c.organizationId, pacienteId: id, actorId: null, tipo: "paciente.creado", detalle: { origen: "api", token: c.token.prefijo } });
    }
    const paciente = await prisma.pacienteTenant.findFirstOrThrow({ where: { id, organizationId: c.organizationId }, include: { persona: true } });
    // M3: escribir no da derecho a leer; sin pacientes:leer solo se devuelve el id (no los datos del paciente que ya existía).
    const puedeLeer = c.token.permisos.includes("pacientes:leer");
    return { status: "creado" in res ? 201 : 200, body: { creado: "creado" in res, paciente: puedeLeer || "creado" in res ? pacienteJson(paciente) : { id } } };
  }),
);
