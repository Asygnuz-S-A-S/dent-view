// Exportación de la historia clínica en PDF: permisos, datos y auditoría compartidos por las rutas por paciente y por orden.
import { prisma } from "@dent-view/db";
import { registrarEvento } from "./eventos";
import { ETIQUETA_DESTINO, puedeLeerEvolucion } from "./evolucion";
import { generarPdfHistoria, type FolioPdf } from "./evolucion-pdf";
import { cargarEvoluciones } from "./evolucion-servidor";
import { fechaHoraCompleta } from "./fechas";
import { normalizarHex } from "./marca";
import { numeroOrden } from "./ordenes";
import { contextoActivo, modulosHabilitadoEnCentro } from "./sesion";

const sinCache = { "Cache-Control": "private, no-store" };

/** PDF de la historia por folios (del paciente o de una orden). 404 si no es rol médico, el módulo no aplica o el paciente es de otro centro. */
export async function responderPdfHistoria(pacienteId: string, ordenId?: string): Promise<Response> {
  const ctx = await contextoActivo();
  if (!ctx || ctx.usuario.debeCambiarClave) return new Response(null, { status: 401 });
  const org = ctx.organizationId;
  if (!puedeLeerEvolucion(ctx.rol) || !(await modulosHabilitadoEnCentro(org, "evolucion"))) return new Response("No encontrado", { status: 404 });
  const [pac, orden] = await Promise.all([
    prisma.pacienteTenant.findFirst({ where: { id: pacienteId, organizationId: org }, include: { persona: true } }),
    ordenId ? prisma.orden.findFirst({ where: { id: ordenId, organizationId: org, pacienteId }, select: { id: true, numero: true } }) : null,
  ]);
  if (!pac || (ordenId && !orden)) return new Response("No encontrado", { status: 404 });
  const [evs, config, centro] = await Promise.all([
    cargarEvoluciones(org, pacienteId, ordenId),
    prisma.configCentro.findUnique({ where: { organizationId: org } }),
    prisma.organization.findUnique({ where: { id: org }, select: { name: true } }),
  ]);
  const folios: FolioPdf[] = [...evs].reverse().map((e) => ({
    folio: e.folio, fecha: e.fecha, profesional: e.profesional, tarjeta: e.tarjeta, especialidad: e.especialidad, orden: e.ordenNumero ? numeroOrden(e.ordenNumero) : null,
    campos: [
      ...(["motivoConsulta", "hallazgos", "procedimiento"] as const).flatMap((k) => (e[k] ? [{ titulo: ETIQUETA_DESTINO[k], texto: e[k]! }] : [])),
      ...(e.diagnosticos.length ? [{ titulo: "Diagnósticos CIE-10", texto: e.diagnosticos.map((d) => `${d.codigo}${d.descripcion ? ` ${d.descripcion}` : ""}`).join("; ") }] : []),
      ...(["plan", "indicaciones"] as const).flatMap((k) => (e[k] ? [{ titulo: ETIQUETA_DESTINO[k], texto: e[k]! }] : [])),
      ...(e.proximaCita ? [{ titulo: "Próxima cita sugerida", texto: e.proximaCita }] : []),
    ],
    hashCorto: e.hashCorto, integra: e.integra,
    adendas: e.adendas.map((a) => ({ texto: a.texto, firmante: a.firmante, tarjeta: a.tarjeta, fecha: a.fecha, hashCorto: a.hashCorto })),
  }));
  const pdf = await generarPdfHistoria({
    membrete: { nombre: config?.nombre || centro?.name || "Centro", direccion: config?.direccion, telefono: config?.telefono, correo: config?.correo, registro: config?.registro, logo: config?.logo },
    paciente: { nombre: pac.nombre, documento: `${pac.persona.tipoDocumento} ${pac.persona.numeroDocumento}` },
    titulo: orden ? `Historia clínica · orden ${numeroOrden(orden.numero)}` : "Historia clínica", colorPrimario: normalizarHex(config?.colorPrimario), folios,
    exportadoEn: fechaHoraCompleta(new Date()), exportadoPor: ctx.usuario.name,
  });
  await registrarEvento({ organizationId: org, pacienteId, actorId: ctx.usuario.id, tipo: "hc.exportada", detalle: { ordenId: ordenId ?? null, folios: folios.length, formato: "pdf" } });
  const nombre = `historia-clinica-${pac.persona.numeroDocumento}${orden ? `-orden-${orden.numero}` : ""}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombre}"`, ...sinCache } });
}
