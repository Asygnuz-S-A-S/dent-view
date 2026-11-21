import { prisma } from "@dent-view/db";
import { ETIQUETA_ESTADO_CITA } from "./agenda";
import { ETIQUETA_MEDIO, numeroFactura } from "./facturacion";
import { ETIQUETA_ESTADO_ORDEN, numeroOrden } from "./ordenes";
import { ordenarHoja, type EntradaHoja } from "./pacientes-hoja";
import { cop } from "./precios";
import { ETIQUETA_MOTIVO, ETIQUETA_ESTADO_SEG, type EstadoSeg, type Motivo } from "./seguimiento";

const LIMITE = 500;
const ETIQUETA_EVENTO: Record<string, string> = {
  "paciente.creado": "Paciente registrado en el centro",
  "paciente.actualizado": "Datos del paciente actualizados",
  "paciente.foto_actualizada": "Foto de perfil actualizada",
  "paciente.foto_eliminada": "Foto de perfil eliminada",
  "paciente.doctor_agregado": "Doctor agregado al equipo tratante",
  "paciente.doctor_quitado": "Doctor retirado del equipo tratante",
};

/** Línea de tiempo unificada del paciente (solo personal del centro). Cada fuente se acota por centro. */
export async function cargarHojaDeVida(organizationId: string, pacienteId: string): Promise<EntradaHoja[]> {
  const base = { organizationId, pacienteId };
  const take = LIMITE;
  const [ordenes, citas, estudios, informes, enlaces, pagos, autorizaciones, seguimientos, eventos] = await Promise.all([
    prisma.orden.findMany({ where: base, select: { id: true, numero: true, estado: true, creadoEn: true }, orderBy: { creadoEn: "desc" }, take }),
    prisma.cita.findMany({ where: base, select: { id: true, inicio: true, estado: true, sala: { select: { nombre: true } } }, orderBy: { inicio: "desc" }, take }),
    prisma.estudio.findMany({ where: base, select: { id: true, modalidad: true, descripcion: true, studyInstanceUid: true, fechaEstudio: true, creadoEn: true }, orderBy: { creadoEn: "desc" }, take }),
    prisma.informe.findMany({ where: { ...base, estado: "EMITIDO", emitidoEn: { not: null } }, select: { id: true, version: true, emitidoEn: true, firmanteNombre: true }, orderBy: { emitidoEn: "desc" }, take }),
    prisma.enlaceEntrega.findMany({ where: base, select: { id: true, destinatarioTipo: true, destinatarioNombre: true, creadoEn: true }, orderBy: { creadoEn: "desc" }, take }),
    prisma.pago.findMany({ where: { factura: base }, select: { id: true, valor: true, medio: true, fecha: true, factura: { select: { id: true, numero: true } } }, orderBy: { fecha: "desc" }, take }),
    prisma.autorizacion.findMany({ where: base, select: { id: true, tipo: true, finalidad: true, otorgada: true, creadoEn: true }, orderBy: { creadoEn: "desc" }, take }),
    prisma.seguimiento.findMany({ where: base, select: { id: true, motivo: true, estado: true, nota: true, creadoEn: true }, orderBy: { creadoEn: "desc" }, take }),
    prisma.evento.findMany({ where: { ...base, tipo: { in: Object.keys(ETIQUETA_EVENTO) } }, select: { id: true, tipo: true, creadoEn: true }, orderBy: { creadoEn: "desc" }, take }),
  ]);

  return ordenarHoja([
    ...ordenes.map((o): EntradaHoja => ({ id: `o${o.id}`, tipo: "orden", fecha: o.creadoEn, titulo: `Orden ${numeroOrden(o.numero)} creada`, detalle: `Estado actual: ${ETIQUETA_ESTADO_ORDEN[o.estado]}`, href: `/ordenes/${o.id}` })),
    ...citas.map((c): EntradaHoja => ({ id: `c${c.id}`, tipo: "cita", fecha: c.inicio, titulo: `Cita en ${c.sala.nombre}`, detalle: ETIQUETA_ESTADO_CITA[c.estado] })),
    ...estudios.map((e): EntradaHoja => ({
      id: `e${e.id}`, tipo: "estudio", fecha: e.fechaEstudio ?? e.creadoEn, titulo: `Estudio recibido${e.modalidad ? ` · ${e.modalidad}` : ""}`, detalle: e.descripcion ?? undefined,
      href: `/visor/viewer?StudyInstanceUIDs=${encodeURIComponent(e.studyInstanceUid)}`,
    })),
    ...informes.map((i): EntradaHoja => ({ id: `i${i.id}`, tipo: "informe", fecha: i.emitidoEn!, titulo: `Informe emitido (v${i.version})`, detalle: i.firmanteNombre ? `Firmado por ${i.firmanteNombre}` : undefined, href: `/informes/${i.id}` })),
    ...enlaces.map((n): EntradaHoja => ({ id: `n${n.id}`, tipo: "entrega", fecha: n.creadoEn, titulo: `Resultados entregados por enlace a ${n.destinatarioTipo === "DOCTOR" ? "doctor" : "paciente"}`, detalle: n.destinatarioNombre ?? undefined })),
    ...pagos.map((p): EntradaHoja => ({ id: `p${p.id}`, tipo: "pago", fecha: p.fecha, titulo: `Pago de ${cop(p.valor)}`, detalle: `${ETIQUETA_MEDIO[p.medio]} · ${numeroFactura(p.factura.numero)}`, href: `/facturacion/${p.factura.id}` })),
    ...autorizaciones.map((a): EntradaHoja => ({ id: `a${a.id}`, tipo: "consentimiento", fecha: a.creadoEn, titulo: `Consentimiento ${a.otorgada ? "otorgado" : "revocado"}`, detalle: a.finalidad })),
    ...seguimientos.map((s): EntradaHoja => ({ id: `s${s.id}`, tipo: "seguimiento", fecha: s.creadoEn, titulo: `Seguimiento: ${ETIQUETA_MOTIVO[s.motivo as Motivo] ?? s.motivo}`, detalle: [ETIQUETA_ESTADO_SEG[s.estado as EstadoSeg] ?? s.estado, s.nota].filter(Boolean).join(" · ") })),
    ...eventos.map((e): EntradaHoja => ({ id: `v${e.id}`, tipo: "paciente", fecha: e.creadoEn, titulo: ETIQUETA_EVENTO[e.tipo] })),
  ]);
}
