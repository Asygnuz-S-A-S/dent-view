// Carga la entrada del generador RIPS desde la base (siempre acotada por centro).
import { prisma } from "@dent-view/db";
import type { EntradaRips } from "./generar";

const ORDEN_RIPS = {
  paciente: { include: { persona: true } },
  items: { include: { servicio: { select: { codigoCups: true, tipoRips: true, codServicioReps: true } } }, orderBy: { nombre: "asc" } },
  documentosElectronicos: { where: { estado: "ACEPTADA" }, orderBy: { creadoEn: "desc" }, take: 1, select: { numeroDian: true } },
} as const;

type OrdenCargada = NonNullable<Awaited<ReturnType<typeof cargarOrden>>>;
const cargarOrden = (organizationId: string, id: string) => prisma.orden.findFirst({ where: { id, organizationId }, include: ORDEN_RIPS });

export function armarEntrada(
  o: OrdenCargada,
  config: { nit: string | null; dv: string | null; codigoPrestador: string | null; modalidadDefecto: string | null; grupoServiciosDefecto: string | null } | null,
  profesional: { tipoDocumento: string | null; numeroDocumento: string | null } | null,
): EntradaRips {
  const { paciente: p } = o;
  return {
    prestador: { nit: config?.nit ?? null, codigoPrestador: config?.codigoPrestador ?? null, modalidad: config?.modalidadDefecto ?? null, grupoServicios: config?.grupoServiciosDefecto ?? null },
    numFactura: o.documentosElectronicos[0]?.numeroDian ?? null,
    orden: {
      numero: o.numero, fechaAtencion: o.creadoEn, total: o.items.reduce((t, i) => t + i.precio, 0),
      tipoUsuario: o.tipoUsuario ?? p.tipoUsuarioDefecto, numAutorizacion: o.numAutorizacion, finalidad: o.finalidad,
      causaMotivoAtencion: o.causaMotivoAtencion, viaIngreso: o.viaIngreso, diagnosticoPrincipal: o.diagnosticoPrincipal,
      diagnosticosRelacionados: o.diagnosticosRelacionados, tipoDiagnostico: o.tipoDiagnostico,
    },
    paciente: {
      tipoDocumento: p.persona.tipoDocumento, numeroDocumento: p.persona.numeroDocumento, fechaNacimiento: p.fechaNacimiento ?? p.persona.fechaNacimiento,
      sexo: p.sexo, codPaisResidencia: p.codPaisResidencia, codMunicipio: p.codMunicipio, zonaTerritorial: p.zonaTerritorial, codPaisOrigen: p.codPaisOrigen,
    },
    profesional,
    items: o.items.map((i) => {
      // Órdenes anteriores a RIPS no copiaron el CUPS: se usa el del servicio de catálogo.
      const delServicio = !i.codigoCups && i.servicio;
      return {
        nombre: i.nombre, precio: i.precio, finalidad: i.finalidad, diagnostico: i.diagnostico,
        codigoCups: i.codigoCups ?? (delServicio ? delServicio.codigoCups : null),
        tipoRips: delServicio ? delServicio.tipoRips : i.tipoRips,
        codServicioReps: i.servicio?.codServicioReps ?? null,
      };
    }),
  };
}

export async function cargarEntradaRips(organizationId: string, ordenId: string) {
  const orden = await cargarOrden(organizationId, ordenId);
  if (!orden) return null;
  const config = await prisma.configFacturacion.findUnique({ where: { organizationId } });
  // El sistema no guarda el documento del profesional: null y advertencia en el validador.
  return { orden, config, entrada: armarEntrada(orden, config, null) };
}

/** Estado RIPS de varias órdenes (listado): una consulta de config + una de órdenes. */
export async function estadoRipsDeOrdenes(organizationId: string, ids: string[]): Promise<Map<string, boolean>> {
  const r = new Map<string, boolean>();
  if (!ids.length) return r;
  const [config, ordenes] = await Promise.all([
    prisma.configFacturacion.findUnique({ where: { organizationId } }),
    prisma.orden.findMany({ where: { organizationId, id: { in: ids } }, include: ORDEN_RIPS }),
  ]);
  const { generarRips } = await import("./generar");
  for (const o of ordenes) r.set(o.id, generarRips(armarEntrada(o, config, null)).errores.length === 0);
  return r;
}
