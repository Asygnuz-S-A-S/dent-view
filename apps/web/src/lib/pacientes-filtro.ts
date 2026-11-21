// Lógica pura de la lista de pacientes: parámetros de URL → filtro Prisma. Sin I/O para poder probarla.
import type { Prisma } from "@dent-view/db";
import { numeroDeBusqueda } from "./ordenes";
import { normalizarDocumento } from "./pacientes";

export const ORDENES_LISTA = {
  nombre: "Nombre (A–Z)",
  nombre_desc: "Nombre (Z–A)",
  reciente: "Registrados recientemente",
  estudios: "Más estudios",
} as const;
export type OrdenLista = keyof typeof ORDENES_LISTA;

export type FiltrosPacientes = {
  q: string;
  doctor: string;
  /** Texto de la especialidad: del perfil del doctor remitente o de la relación registrada a mano. */
  especialidad: string;
  /** Con alguna orden sin informar (solicitada, agendada o tomada). */
  pendientes: boolean;
  /** Con alguna cuenta de cobro abierta (saldo por pagar). */
  cartera: boolean;
  /** Fecha (YYYY-MM-DD, hora de Bogotá) entre las que cae su ÚLTIMO estudio. */
  desde: string;
  hasta: string;
  orden: OrdenLista;
};

type Params = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (s: string) => FECHA.test(s) && !Number.isNaN(new Date(`${s}T00:00:00-05:00`).getTime());

export function leerFiltros(sp: Params): FiltrosPacientes {
  const orden = uno(sp.orden);
  return {
    q: uno(sp.q),
    doctor: uno(sp.doctor),
    especialidad: uno(sp.especialidad).slice(0, 60),
    pendientes: uno(sp.pendientes) === "1",
    cartera: uno(sp.cartera) === "1",
    desde: fechaValida(uno(sp.desde)) ? uno(sp.desde) : "",
    hasta: fechaValida(uno(sp.hasta)) ? uno(sp.hasta) : "",
    orden: orden in ORDENES_LISTA ? (orden as OrdenLista) : "nombre",
  };
}

/**
 * Regla de pertenencia: un paciente es "de" un doctor remitente si ese doctor lo remitió en alguna orden
 * o estudio del centro, o si recepción lo registró a mano en su equipo tratante. Siempre acotada por centro.
 */
export function filtroDoctor(organizationId: string, doctorId: string): Prisma.PacienteTenantWhereInput {
  return {
    OR: [
      { ordenes: { some: { organizationId, doctorRemitenteId: doctorId } } },
      { estudios: { some: { organizationId, doctorRemitenteId: doctorId } } },
      { doctores: { some: { organizationId, doctorId } } },
    ],
  };
}

export function filtroEspecialidad(organizationId: string, texto: string): Prisma.PacienteTenantWhereInput {
  const especialidad = { contains: texto, mode: "insensitive" as const };
  return {
    OR: [
      { doctores: { some: { organizationId, especialidad } } },
      { ordenes: { some: { organizationId, doctorRemitente: { perfilDoctor: { especialidad } } } } },
    ],
  };
}

/** Pacientes que el usuario puede ver: todo el centro, salvo el doctor remitente (solo los suyos). */
export function filtroVisibles(organizationId: string, usuarioId: string, rol: string): Prisma.PacienteTenantWhereInput {
  return rol === "doctor_remitente" ? { organizationId, ...filtroDoctor(organizationId, usuarioId) } : { organizationId };
}

const inicioDia = (s: string) => new Date(`${s}T00:00:00-05:00`);
const finDia = (s: string) => new Date(`${s}T23:59:59.999-05:00`);
// La fecha de un estudio es fechaEstudio y, si falta, creadoEn.
const enRango = (g?: Date, l?: Date): Prisma.EstudioWhereInput[] => {
  const r = { ...(g && { gte: g }), ...(l && { lte: l }) };
  return [{ fechaEstudio: r }, { fechaEstudio: null, creadoEn: r }];
};

export function construirWhere(organizationId: string, usuario: { id: string; rol: string }, f: FiltrosPacientes): Prisma.PacienteTenantWhereInput {
  const and: Prisma.PacienteTenantWhereInput[] = [filtroVisibles(organizationId, usuario.id, usuario.rol)];
  // El doctor remitente no puede ampliar su alcance con ?doctor=.
  if (f.doctor && usuario.rol !== "doctor_remitente") and.push(filtroDoctor(organizationId, f.doctor));
  if (f.especialidad) and.push(filtroEspecialidad(organizationId, f.especialidad));
  if (f.q) {
    const doc = normalizarDocumento(f.q);
    const numero = numeroDeBusqueda(f.q);
    and.push({
      OR: [
        { nombre: { contains: f.q, mode: "insensitive" } },
        ...(doc ? [{ persona: { numeroDocumento: { contains: doc } } }] : []),
        ...(numero !== null ? [{ ordenes: { some: { organizationId, numero } } }] : []),
      ],
    });
  }
  if (f.pendientes) and.push({ ordenes: { some: { organizationId, estado: { in: ["SOLICITADA", "AGENDADA", "TOMADA"] } } } });
  if (f.cartera) and.push({ facturas: { some: { organizationId, estado: "ABIERTA" } } });
  if (f.desde || f.hasta) {
    const desde = f.desde ? inicioDia(f.desde) : undefined;
    const hasta = f.hasta ? finDia(f.hasta) : undefined;
    // Último estudio dentro del rango = hay uno en el rango y ninguno posterior al límite superior.
    and.push({ estudios: { some: { organizationId, OR: enRango(desde, hasta) } } });
    if (hasta) and.push({ estudios: { none: { organizationId, OR: [{ fechaEstudio: { gt: hasta } }, { fechaEstudio: null, creadoEn: { gt: hasta } }] } } });
  }
  return { AND: and };
}

export function ordenarPor(o: OrdenLista): Prisma.PacienteTenantOrderByWithRelationInput {
  switch (o) {
    case "nombre_desc": return { nombre: "desc" };
    case "reciente": return { creadoEn: "desc" };
    case "estudios": return { estudios: { _count: "desc" } };
    default: return { nombre: "asc" };
  }
}

/** Query string de los filtros activos (para conservarlos al cambiar de vista). */
export function consultaFiltros(f: FiltrosPacientes) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.doctor) p.set("doctor", f.doctor);
  if (f.especialidad) p.set("especialidad", f.especialidad);
  if (f.pendientes) p.set("pendientes", "1");
  if (f.cartera) p.set("cartera", "1");
  if (f.desde) p.set("desde", f.desde);
  if (f.hasta) p.set("hasta", f.hasta);
  if (f.orden !== "nombre") p.set("orden", f.orden);
  return p.toString();
}
