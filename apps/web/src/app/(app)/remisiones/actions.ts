"use server";

// Remisión entre centros. Sin RLS: cada consulta a prisma.remision filtra por origenId o destinoId = centro activo.
// La auditoría guarda solo ids (nunca datos del paciente).
import { prisma, type Prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarEvento } from "@/lib/eventos";
import { encolarMensaje, despachar } from "@/lib/notificar";
import type { TipoMensaje } from "@/lib/notificaciones";
import { crearPacienteEnCentro } from "@/lib/pacientes-centro";
import {
  ALCANCES, CONSENTIMIENTO_REMISION_V, copiaMinima, TEXTO_CONSENTIMIENTO_REMISION, transicionRemision, type EstadoRemision,
} from "@/lib/remisiones";
import { urlBase } from "@/lib/resultados";
import { ADMIN, CLINICOS, GESTION } from "@/lib/roles";
import { exigirContexto, exigirModulo } from "@/lib/sesion";
import { nombreCentro } from "@/lib/valoraciones-servidor";

type R = { error?: string };
type Ctx = Awaited<ReturnType<typeof exigirContexto>>;

const refrescar = (id?: string) => {
  revalidatePath("/remisiones");
  if (id) revalidatePath(`/remisiones/${id}`);
};

/** Aviso por correo a los miembros con alguno de `roles` del centro `hacia`. Sin datos del paciente: solo el centro y el enlace. */
async function avisar(a: { tipo: TipoMensaje; hacia: string; desde: string; ruta: string; clave: string; roles: readonly string[] }) {
  const miembros = await prisma.member.findMany({ where: { organizationId: a.hacia, role: { in: [...a.roles] } }, select: { userId: true, user: { select: { email: true } } } });
  const centro = await nombreCentro(a.desde);
  for (const m of miembros) {
    await encolarMensaje({ organizationId: a.hacia, tipo: a.tipo, direccion: m.user.email, contexto: { centro, enlace: `${urlBase()}${a.ruta}` }, claveUnica: `${a.clave}-${m.userId}` });
  }
  await despachar({ organizationId: a.hacia, limite: 10 }).catch((e) => console.error("No se pudo despachar el aviso de remisión", e));
}

// --- Vínculos entre centros ---

const esquemaCodigo = z.string().trim().toLowerCase().min(2, "Escribe el código del centro").max(80);
const MENSAJE_SOLICITUD = "Si el código es correcto, enviamos tu solicitud al otro centro. Te avisamos cuando responda.";

/** Pide vincularse con otro centro por su código (slug). La respuesta es la misma exista o no el código. */
export async function solicitarVinculo(codigo: string): Promise<R & { mensaje?: string }> {
  const ctx = await exigirContexto(ADMIN);
  await exigirModulo(ctx, "remisiones");
  const r = esquemaCodigo.safeParse(codigo);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Código inválido" };
  const receptor = await prisma.organization.findUnique({ where: { slug: r.data }, select: { id: true } });
  if (receptor && receptor.id !== ctx.organizationId) {
    const par = { solicitanteId: ctx.organizationId, receptorId: receptor.id };
    const actual = await prisma.vinculoCentro.findUnique({ where: { solicitanteId_receptorId: par }, select: { id: true, estado: true } });
    let id: string | null = null;
    if (!actual) {
      id = (await prisma.vinculoCentro.create({ data: { ...par, solicitadoPorId: ctx.usuario.id }, select: { id: true } })).id;
    } else if (actual.estado === "RECHAZADO" || actual.estado === "REVOCADO") {
      const { count } = await prisma.vinculoCentro.updateMany({
        where: { id: actual.id, ...par, estado: actual.estado },
        data: { estado: "PENDIENTE", solicitadoPorId: ctx.usuario.id, respondidoPorId: null, respondidoEn: null },
      });
      if (count === 1) id = actual.id;
    }
    if (id) {
      await registrarEvento({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "vinculo.solicitado", detalle: { vinculoId: id, receptorId: receptor.id } });
      await avisar({ tipo: "VINCULO_SOLICITADO", hacia: receptor.id, desde: ctx.organizationId, ruta: "/remisiones/vinculos", clave: `vinculo-${id}-${Date.now()}`, roles: ADMIN });
    }
  }
  revalidatePath("/remisiones/vinculos");
  return { mensaje: MENSAJE_SOLICITUD };
}

export async function responderVinculo(id: string, aceptar: boolean): Promise<R> {
  const ctx = await exigirContexto(ADMIN);
  await exigirModulo(ctx, "remisiones");
  const { count } = await prisma.vinculoCentro.updateMany({
    where: { id, receptorId: ctx.organizationId, estado: "PENDIENTE" },
    data: { estado: aceptar ? "ACTIVO" : "RECHAZADO", respondidoPorId: ctx.usuario.id, respondidoEn: new Date() },
  });
  if (count !== 1) return { error: "La solicitud ya no está pendiente" };
  await registrarEvento({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "vinculo.respondido", detalle: { vinculoId: id, aceptar } });
  revalidatePath("/remisiones/vinculos");
  return {};
}

/** Revoca un vínculo activo; puede hacerlo cualquiera de los dos centros. */
export async function revocarVinculo(id: string): Promise<R> {
  const ctx = await exigirContexto(ADMIN);
  await exigirModulo(ctx, "remisiones");
  const { count } = await prisma.vinculoCentro.updateMany({
    where: { id, estado: "ACTIVO", OR: [{ solicitanteId: ctx.organizationId }, { receptorId: ctx.organizationId }] },
    data: { estado: "REVOCADO", respondidoPorId: ctx.usuario.id, respondidoEn: new Date() },
  });
  if (count !== 1) return { error: "El vínculo ya no está activo" };
  await registrarEvento({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "vinculo.revocado", detalle: { vinculoId: id } });
  revalidatePath("/remisiones/vinculos");
  return {};
}

// --- Remisiones ---

const esquemaRemision = z.object({
  pacienteId: z.string().min(1, "Selecciona un paciente"),
  destinoId: z.string().min(1, "Selecciona el centro destino"),
  motivo: z.string().trim().min(3, "Escribe el motivo de la remisión").max(1000),
  estudiosSolicitados: z.string().trim().min(3, "Indica los estudios solicitados").max(1000),
  alcance: z.array(z.enum(ALCANCES)).refine((a) => a.includes("IDENTIFICACION"), "El alcance debe incluir la identificación"),
  embarazo: z.boolean().optional(),
  autorizado: z.literal(true, { error: "Confirma que el paciente autorizó compartir sus datos" }),
});

export async function crearRemision(entrada: z.input<typeof esquemaRemision>): Promise<R & { id?: string }> {
  const ctx = await exigirContexto(CLINICOS);
  await exigirModulo(ctx, "remisiones");
  const r = esquemaRemision.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const d = r.data;
  const org = ctx.organizationId;
  const paciente = await prisma.pacienteTenant.findFirst({ where: { id: d.pacienteId, organizationId: org }, select: { nombre: true, fechaNacimiento: true, celular: true, persona: { select: { tipoDocumento: true, numeroDocumento: true } } } });
  if (!paciente) return { error: "Paciente no encontrado" };
  const vinculo = await prisma.vinculoCentro.findFirst({ where: { solicitanteId: org, receptorId: d.destinoId, estado: "ACTIVO" }, select: { id: true, receptor: { select: { name: true } } } });
  if (!vinculo) return { error: "El centro destino no está vinculado" };
  const alcance = [...new Set(d.alcance)];
  const ahora = new Date();
  const id = await prisma.$transaction(async (tx) => {
    const aut = await tx.autorizacion.create({
      data: {
        organizationId: org, pacienteId: d.pacienteId, tipo: "DATOS", finalidad: `remisión de datos a ${vinculo.receptor.name}`,
        otorgada: true, otorgadaEn: ahora, textoMostrado: `${TEXTO_CONSENTIMIENTO_REMISION}\nAlcance: ${alcance.join(", ")}`,
        version: CONSENTIMIENTO_REMISION_V, registradoPorId: ctx.usuario.id,
      },
      select: { id: true },
    });
    const rem = await tx.remision.create({
      data: {
        vinculoId: vinculo.id, origenId: org, destinoId: d.destinoId, pacienteOrigenId: d.pacienteId, autorizacionId: aut.id, creadoPorId: ctx.usuario.id,
        ...copiaMinima(paciente, alcance, d.embarazo),
        motivo: d.motivo, estudiosSolicitados: d.estudiosSolicitados, remitenteNombre: ctx.usuario.name,
        alcance, consentimientoTexto: TEXTO_CONSENTIMIENTO_REMISION, consentimientoVersion: CONSENTIMIENTO_REMISION_V, consentimientoPorId: ctx.usuario.id, consentimientoEn: ahora,
      },
      select: { id: true },
    });
    await tx.remisionEvento.create({ data: { remisionId: rem.id, organizationId: org, actorId: ctx.usuario.id, tipo: "ENVIADA" } });
    await registrarEvento({ organizationId: org, pacienteId: d.pacienteId, actorId: ctx.usuario.id, tipo: "remision.enviada", detalle: { remisionId: rem.id, destinoId: d.destinoId, autorizacionId: aut.id } }, tx);
    return rem.id;
  });
  await avisar({ tipo: "REMISION_RECIBIDA", hacia: d.destinoId, desde: org, ruta: `/remisiones/${id}`, clave: `remision-${id}-ENVIADA`, roles: GESTION });
  refrescar();
  return { id };
}

type Lado = "origen" | "destino";
type Cambio = { error: string } | { data?: Prisma.RemisionUncheckedUpdateManyInput };

/**
 * Transición atómica: la remisión debe ser del centro activo en `lado` y seguir en el estado leído (updateMany con el estado de origen);
 * count != 1 → error. `preparar` calcula datos extra con la remisión ya validada.
 */
async function transicionar(
  ctx: Ctx, id: string, lado: Lado, a: EstadoRemision,
  opciones: { motivo?: string; preparar?: (rem: { id: string; ordenDestinoId: string | null; origenId: string; destinoId: string; tipoDocumento: string; numeroDocumento: string; nombre: string; fechaNacimiento: Date | null; celular: string | null }) => Promise<Cambio> } = {},
): Promise<R & { origenId?: string; destinoId?: string }> {
  const propio: Prisma.RemisionWhereInput = lado === "origen" ? { id, origenId: ctx.organizationId } : { id, destinoId: ctx.organizationId };
  const rem = await prisma.remision.findFirst({
    where: propio,
    select: { id: true, estado: true, ordenDestinoId: true, origenId: true, destinoId: true, tipoDocumento: true, numeroDocumento: true, nombre: true, fechaNacimiento: true, celular: true },
  });
  if (!rem) return { error: "Remisión no encontrada" };
  const t = transicionRemision(rem.estado, a, lado, opciones.motivo);
  if (!t.ok) return { error: t.error };
  const cambio = opciones.preparar ? await opciones.preparar(rem) : {};
  if ("error" in cambio) return { error: cambio.error };
  const ok = await prisma.$transaction(async (tx) => {
    const { count } = await tx.remision.updateMany({ where: { ...propio, estado: rem.estado }, data: { ...cambio.data, estado: a } });
    if (count !== 1) return false;
    await tx.remisionEvento.create({ data: { remisionId: id, organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: a } });
    return true;
  });
  if (!ok) return { error: "La remisión cambió de estado; recarga la página" };
  refrescar(id);
  return { origenId: rem.origenId, destinoId: rem.destinoId };
}

export async function cancelarRemision(id: string): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  await exigirModulo(ctx, "remisiones");
  const r = await transicionar(ctx, id, "origen", "CANCELADA");
  return r.error ? { error: r.error } : {};
}

/** El destino acepta la remisión: crea (o reutiliza, sin sobrescribir) al paciente con la copia mínima. */
export async function recibirRemision(id: string): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  await exigirModulo(ctx, "remisiones");
  const r = await transicionar(ctx, id, "destino", "RECIBIDA", {
    preparar: async (rem) => {
      const res = await crearPacienteEnCentro(
        ctx.organizationId, { tipoDocumento: rem.tipoDocumento, numeroDocumento: rem.numeroDocumento },
        { nombre: rem.nombre, fechaNacimiento: rem.fechaNacimiento, celular: rem.celular },
      );
      if ("creado" in res) await registrarEvento({ organizationId: ctx.organizationId, pacienteId: res.creado.id, actorId: ctx.usuario.id, tipo: "paciente.creado", detalle: { origen: "remision", remisionId: id } });
      return { data: { pacienteDestinoId: "existente" in res ? res.existente : res.creado.id } };
    },
  });
  return r.error ? { error: r.error } : {};
}

export async function rechazarRemision(id: string, motivo: string): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  await exigirModulo(ctx, "remisiones");
  const m = z.string().trim().min(3, "Indica el motivo del rechazo").max(500).safeParse(motivo);
  if (!m.success) return { error: m.error.issues[0]?.message ?? "Motivo inválido" };
  const r = await transicionar(ctx, id, "destino", "RECHAZADA", { motivo: m.data, preparar: async () => ({ data: { motivoRechazo: m.data } }) });
  if (r.error) return { error: r.error };
  await avisar({ tipo: "REMISION_RESPONDIDA", hacia: r.origenId!, desde: ctx.organizationId, ruta: `/remisiones/${id}`, clave: `remision-${id}-RECHAZADA`, roles: GESTION });
  return {};
}

/** El destino devuelve el estudio y el informe emitido (vigente) de la orden creada para la remisión. También re-devuelve. */
export async function devolverRemision(id: string): Promise<R> {
  const ctx = await exigirContexto(CLINICOS);
  await exigirModulo(ctx, "remisiones");
  const org = ctx.organizationId;
  const r = await transicionar(ctx, id, "destino", "DEVUELTA", {
    preparar: async (rem) => {
      if (!rem.ordenDestinoId) return { error: "Crea la orden antes de devolver" };
      const informe = await prisma.informe.findFirst({ where: { organizationId: org, ordenId: rem.ordenDestinoId, estado: "EMITIDO", vigente: true }, select: { id: true } });
      if (!informe) return { error: "Emite el informe antes de devolver" };
      const estudios = await prisma.estudio.findMany({ where: { organizationId: org, ordenId: rem.ordenDestinoId, estado: { in: ["ASIGNADO", "PUBLICADO"] } }, select: { studyInstanceUid: true } });
      if (estudios.length === 0) return { error: "Vincula el estudio a la orden antes de devolver" };
      return { data: { informeId: informe.id, estudioUids: estudios.map((e) => e.studyInstanceUid), devueltaEn: new Date() } };
    },
  });
  if (r.error) return { error: r.error };
  await avisar({ tipo: "REMISION_RESPONDIDA", hacia: r.origenId!, desde: org, ruta: `/remisiones/${id}`, clave: `remision-${id}-DEVUELTA`, roles: GESTION });
  return {};
}
