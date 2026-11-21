// Forma pública (JSON) de cada recurso de /api/v1. Lista blanca de campos: nada interno (orthancId, claves S3, bytes) sale de aquí.
import type { Prisma } from "@dent-view/db";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

type Paciente = Prisma.PacienteTenantGetPayload<{ include: { persona: true } }>;
export const pacienteJson = (p: Paciente) => ({
  id: p.id, tipoDocumento: p.persona.tipoDocumento, numeroDocumento: p.persona.numeroDocumento, nombre: p.nombre,
  fechaNacimiento: dia(p.fechaNacimiento), celular: p.celular, correo: p.correo, direccion: p.direccion, creadoEn: iso(p.creadoEn),
});

type Orden = Prisma.OrdenGetPayload<{ include: { items: true } }>;
export const ordenJson = (o: Orden) => ({
  id: o.id, numero: o.numero, estado: o.estado, entrega: o.entrega, pacienteId: o.pacienteId, doctorId: o.doctorRemitenteId,
  convenioId: o.convenioId, embarazo: o.embarazo, observaciones: o.observaciones,
  items: o.items.map((i) => ({ id: i.id, servicioId: i.servicioId, nombre: i.nombre, opciones: i.opciones, precio: i.precio, descuento: i.descuento })),
  total: o.items.reduce((t, i) => t + i.precio, 0), creadoEn: iso(o.creadoEn), actualizadoEn: iso(o.actualizadoEn),
});

export const citaJson = (c: Prisma.CitaGetPayload<object>) => ({
  id: c.id, salaId: c.salaId, pacienteId: c.pacienteId, ordenId: c.ordenId, inicio: iso(c.inicio), fin: iso(c.fin), estado: c.estado, notas: c.notas, creadoEn: iso(c.creadoEn),
});

export const estudioJson = (e: Prisma.EstudioGetPayload<object>) => ({
  id: e.id, pacienteId: e.pacienteId, ordenId: e.ordenId, doctorId: e.doctorRemitenteId, studyInstanceUid: e.studyInstanceUid,
  modalidad: e.modalidad, descripcion: e.descripcion, fechaEstudio: iso(e.fechaEstudio), estado: e.estado, creadoEn: iso(e.creadoEn), actualizadoEn: iso(e.actualizadoEn),
});

export const informeJson = (i: Omit<Prisma.InformeGetPayload<object>, "pdf">) => ({
  id: i.id, grupoId: i.grupoId, version: i.version, pacienteId: i.pacienteId, ordenId: i.ordenId, estudioId: i.estudioId,
  motivo: i.motivo, tecnica: i.tecnica, hallazgos: i.hallazgos, impresion: i.impresion, recomendaciones: i.recomendaciones,
  firmanteNombre: i.firmanteNombre, firmanteTarjeta: i.firmanteTarjeta, codigo: i.codigo, emitidoEn: iso(i.emitidoEn), creadoEn: iso(i.creadoEn), actualizadoEn: iso(i.actualizadoEn),
});

type Doctor = Prisma.MemberGetPayload<{ include: { user: { include: { perfilDoctor: true } } } }>;
export const doctorJson = (m: Doctor) => ({
  id: m.userId, nombre: m.user.name, correo: m.user.email, especialidad: m.user.perfilDoctor?.especialidad ?? null,
  tarjetaProfesional: m.user.perfilDoctor?.tarjetaProfesional ?? null, telefono: m.user.perfilDoctor?.telefono ?? null,
  consultorio: m.user.perfilDoctor?.consultorio ?? null, creadoEn: iso(m.createdAt),
});

export const servicioJson = (s: Prisma.ServicioGetPayload<object>) => ({
  id: s.id, categoria: s.categoria, nombre: s.nombre, descripcion: s.descripcion, precioImpreso: s.precioImpreso, precioDigital: s.precioDigital,
  descuento: s.descuento, creadoEn: iso(s.creadoEn),
});

export const salaJson = (s: Prisma.SalaGetPayload<object>) => ({ id: s.id, nombre: s.nombre, activa: s.activa });
