"use server";

// Implementación independiente (sala limpia) a partir de docs/sala-limpia/01-documentos-e-informes.md
import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calcularAlertas } from "@/lib/historia-clinica";
import { generarPdfInforme } from "@/lib/informe-pdf";
import { generarCodigo, informeEditable, puedeArchivar, puedeCorregir, puedeEmitir } from "@/lib/informes";
import { registrarEvento } from "@/lib/eventos";
import { encolarMensaje } from "@/lib/notificar";
import { numeroOrden, transicionValida } from "@/lib/ordenes";
import { calcularEdad } from "@/lib/pacientes";
import { ADMIN, MEDICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { esquemaLogo, normalizarHex } from "@/lib/marca";
import { cargarCapturasPdf } from "@/lib/informe-capturas";
import { filtroImagenes, normalizarCapturas } from "@/lib/imagenes";

type R = { error?: string };
const fechaBogota = (d: Date, opts: Intl.DateTimeFormatOptions = { dateStyle: "long" }) => d.toLocaleString("es-CO", { timeZone: "America/Bogota", ...opts });
const baseUrl = () => process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/** Crea el borrador de informe de una orden (o devuelve el que ya está en curso). */
export async function crearInformeDeOrden(ordenId: string): Promise<R & { id?: string }> {
  const ctx = await exigirContexto(MEDICOS);
  const orden = await prisma.orden.findFirst({ where: { id: ordenId, organizationId: ctx.organizationId }, include: { items: true, estudios: { take: 1, orderBy: { creadoEn: "asc" } } } });
  if (!orden) return { error: "Orden no encontrada" };
  const existente = await prisma.informe.findFirst({ where: { organizationId: ctx.organizationId, ordenId, vigente: true, estado: { not: "ARCHIVADO" } }, orderBy: { version: "desc" } });
  if (existente) return { id: existente.id };
  const grupoId = crypto.randomUUID();
  const informe = await prisma.informe.create({
    data: {
      organizationId: ctx.organizationId, grupoId, pacienteId: orden.pacienteId, ordenId, estudioId: orden.estudios[0]?.id ?? null,
      motivo: orden.observaciones, tecnica: orden.items.map((i) => i.nombre).join(", ") || null, creadoPorId: ctx.usuario.id,
    },
  });
  await registrarEvento({ organizationId: ctx.organizationId, pacienteId: orden.pacienteId, actorId: ctx.usuario.id, tipo: "informe.creado", detalle: { informeId: informe.id, orden: numeroOrden(orden.numero) } });
  revalidatePath("/informes");
  return { id: informe.id };
}

/** Borrador de informe desde un estudio asignado o publicado: usa su orden si la tiene; si no, lo liga directo al estudio. */
export async function crearInformeDeEstudio(estudioId: string): Promise<R & { id?: string }> {
  const ctx = await exigirContexto(MEDICOS);
  const estudio = await prisma.estudio.findFirst({ where: { id: estudioId, organizationId: ctx.organizationId } });
  if (!estudio) return { error: "Estudio no encontrado" };
  if (estudio.estado === "POR_ASIGNAR" || !estudio.pacienteId) return { error: "Asigna el estudio a un paciente antes de redactar el informe" };
  if (estudio.ordenId) return crearInformeDeOrden(estudio.ordenId);
  const existente = await prisma.informe.findFirst({ where: { organizationId: ctx.organizationId, estudioId, vigente: true, estado: { not: "ARCHIVADO" } }, orderBy: { version: "desc" } });
  if (existente) return { id: existente.id };
  const informe = await prisma.informe.create({
    data: { organizationId: ctx.organizationId, grupoId: crypto.randomUUID(), pacienteId: estudio.pacienteId, estudioId, tecnica: estudio.descripcion ?? estudio.modalidad, creadoPorId: ctx.usuario.id },
  });
  await registrarEvento({ organizationId: ctx.organizationId, pacienteId: estudio.pacienteId, actorId: ctx.usuario.id, tipo: "informe.creado", detalle: { informeId: informe.id, estudioId } });
  revalidatePath("/informes");
  return { id: informe.id };
}

const esquemaBorrador = z.object({
  motivo: z.string().trim().max(2000).optional(),
  tecnica: z.string().trim().max(500).optional(),
  hallazgos: z.string().trim().max(10000),
  impresion: z.string().trim().max(5000),
  recomendaciones: z.string().trim().max(3000).optional(),
});

export async function guardarBorrador(id: string, entrada: z.input<typeof esquemaBorrador>): Promise<R> {
  const ctx = await exigirContexto(MEDICOS);
  const r = esquemaBorrador.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const d = r.data;
  // updateMany con estado BORRADOR: un informe emitido jamás se modifica, ni con dos clics simultáneos.
  const { count } = await prisma.informe.updateMany({
    where: { id, organizationId: ctx.organizationId, estado: "BORRADOR" },
    data: { motivo: d.motivo || null, tecnica: d.tecnica || null, hallazgos: d.hallazgos, impresion: d.impresion, recomendaciones: d.recomendaciones || null },
  });
  if (!count) return { error: "El informe no existe o ya no es editable" };
  revalidatePath(`/informes/${id}`);
  return {};
}

/** Reemplaza la selección de capturas (en orden) de un borrador. Cada captura debe ser del mismo centro y paciente del informe. */
export async function guardarCapturas(id: string, entrada: unknown): Promise<R> {
  const ctx = await exigirContexto(MEDICOS);
  const n = normalizarCapturas(entrada);
  if ("error" in n) return { error: n.error };
  const org = ctx.organizationId;
  const inf = await prisma.informe.findFirst({ where: { id, organizationId: org, estado: "BORRADOR" }, select: { pacienteId: true } });
  if (!inf) return { error: "El informe no existe o ya no es editable" };
  const ids = n.capturas.flatMap((c) => (c.imagenId ? [c.imagenId] : []));
  const uids = n.capturas.flatMap((c) => (c.estudioUid ? [c.estudioUid] : []));
  const [imgs, ests] = await Promise.all([
    ids.length ? prisma.imagenEstudio.count({ where: { id: { in: ids }, pacienteId: inf.pacienteId, ...filtroImagenes(org, ctx.usuario.id, ctx.rol) } }) : 0,
    uids.length ? prisma.estudio.count({ where: { studyInstanceUid: { in: uids }, organizationId: org, pacienteId: inf.pacienteId } }) : 0,
  ]);
  if (imgs !== new Set(ids).size || ests !== new Set(uids).size) return { error: "Alguna captura no pertenece a este paciente" };
  await prisma.$transaction([
    prisma.informeImagen.deleteMany({ where: { informeId: id, organizationId: org } }),
    prisma.informeImagen.createMany({ data: n.capturas.map((c) => ({ ...c, organizationId: org, informeId: id })) }),
  ]);
  revalidatePath(`/informes/${id}`);
  return {};
}

/** Compone el PDF completo ANTES de cambiar el estado; si falla, sigue siendo borrador. */
export async function emitirInforme(id: string): Promise<R> {
  const ctx = await exigirContexto(MEDICOS);
  // La firma es personal: un superadmin suplantando a otro usuario no puede emitir a su nombre.
  if (ctx.suplantadoPor) return { error: "Un superadmin dentro del centro no puede firmar informes" };
  const org = ctx.organizationId;
  const inf = await prisma.informe.findFirst({ where: { id, organizationId: org } });
  if (!inf) return { error: "Informe no encontrado" };
  if (!informeEditable(inf.estado)) return { error: "El informe ya fue emitido" };
  if (!puedeEmitir(inf)) return { error: "Completa hallazgos e impresión diagnóstica antes de emitir" };

  const [pac, orden, estudio, config, centro, perfil, contexto, alergias, enfermedades] = await Promise.all([
    prisma.pacienteTenant.findFirst({ where: { id: inf.pacienteId, organizationId: org }, include: { persona: true } }),
    inf.ordenId ? prisma.orden.findFirst({ where: { id: inf.ordenId, organizationId: org }, include: { doctorRemitente: true } }) : null,
    inf.estudioId ? prisma.estudio.findFirst({ where: { id: inf.estudioId, organizationId: org } }) : null,
    prisma.configCentro.findUnique({ where: { organizationId: org } }),
    prisma.organization.findUniqueOrThrow({ where: { id: org } }),
    prisma.perfilDoctor.findUnique({ where: { userId: ctx.usuario.id } }),
    prisma.contextoMedico.findUnique({ where: { pacienteId: inf.pacienteId } }),
    prisma.alergiaPaciente.findMany({ where: { pacienteId: inf.pacienteId, activo: true } }),
    prisma.enfermedadPaciente.findMany({ where: { pacienteId: inf.pacienteId, activo: true } }),
  ]);
  if (!pac) return { error: "Paciente no encontrado" };

  const codigo = generarCodigo();
  const ahora = new Date();
  const { persona } = pac;
  const alertas = calcularAlertas(contexto, alergias, enfermedades).map((a) => a.texto).filter((t) => /^(Embarazo|Implantes|Marcapasos)/.test(t));
  let pdf: Buffer;
  try {
    const capturas = await cargarCapturasPdf(org, id);
    pdf = await generarPdfInforme({
      membrete: { nombre: config?.nombre || centro.name, direccion: config?.direccion, telefono: config?.telefono, correo: config?.correo, registro: config?.registro, logo: config?.logo },
      paciente: {
        nombre: pac.nombre, documento: `${persona.tipoDocumento} ${persona.numeroDocumento}`,
        nacimiento: pac.fechaNacimiento ? pac.fechaNacimiento.toLocaleDateString("es-CO", { timeZone: "UTC" }) : "—",
        edad: pac.fechaNacimiento ? calcularEdad(pac.fechaNacimiento) : null,
      },
      orden: orden ? numeroOrden(orden.numero) : null, remitente: orden?.doctorRemitente?.name ?? null,
      estudioFecha: estudio?.fechaEstudio ? fechaBogota(estudio.fechaEstudio) : null,
      motivo: inf.motivo, tecnica: inf.tecnica, hallazgos: inf.hallazgos, impresion: inf.impresion, recomendaciones: inf.recomendaciones, alertas, capturas, colorPrimario: normalizarHex(config?.colorPrimario),
      firmante: { nombre: ctx.usuario.name, tarjeta: perfil?.tarjetaProfesional ?? null },
      emitidoEn: fechaBogota(ahora, { dateStyle: "long", timeStyle: "short" }), version: inf.version, codigo, urlVerificacion: `${baseUrl()}/verificar/${codigo}`,
    });
  } catch (e) {
    return { error: `No se pudo generar el PDF: ${e instanceof Error ? e.message : "error"}` };
  }

  const ok = await prisma.$transaction(async (tx) => {
    // Solo una emisión gana si dos usuarios emiten el mismo borrador a la vez.
    const { count } = await tx.informe.updateMany({
      where: { id, organizationId: org, estado: "BORRADOR" },
      data: { estado: "EMITIDO", codigo, pdf: new Uint8Array(pdf), emitidoEn: ahora, firmanteId: ctx.usuario.id, firmanteNombre: ctx.usuario.name, firmanteTarjeta: perfil?.tarjetaProfesional ?? null },
    });
    if (count !== 1) return false;
    if (inf.version > 1) await tx.informe.updateMany({ where: { grupoId: inf.grupoId, organizationId: org, version: { lt: inf.version } }, data: { vigente: false } });
    await registrarEvento({ organizationId: org, pacienteId: inf.pacienteId, actorId: ctx.usuario.id, tipo: "informe.emitido", detalle: { informeId: id, version: inf.version, codigo } }, tx);
    if (orden && transicionValida(orden.estado, "INFORMADA")) {
      await tx.orden.update({ where: { id: orden.id }, data: { estado: "INFORMADA" } });
      await registrarEvento({ organizationId: org, pacienteId: inf.pacienteId, actorId: ctx.usuario.id, tipo: "orden.estado", detalle: { ordenId: orden.id, orden: numeroOrden(orden.numero), de: orden.estado, a: "INFORMADA", origen: "informe" } }, tx);
    }
    // Avisos: al paciente y al doctor remitente (se envían después, desde la cola).
    const vars = {
      paciente: pac.nombre, centro: config?.nombre || centro.name, orden: orden ? numeroOrden(orden.numero) : "", medico: orden?.doctorRemitente?.name ?? "",
      enlace: `${baseUrl()}/ordenes/${orden?.id ?? ""}`, informeId: id,
    };
    await encolarMensaje({ organizationId: org, tipo: "INFORME_PACIENTE", pacienteId: inf.pacienteId, contexto: vars, claveUnica: `informe-paciente-${id}` }, tx);
    if (orden?.doctorRemitente?.email) {
      await encolarMensaje({ organizationId: org, tipo: "INFORME_REMITENTE", pacienteId: inf.pacienteId, direccion: orden.doctorRemitente.email, contexto: vars, claveUnica: `informe-remitente-${id}` }, tx);
    }
    return true;
  });
  if (!ok) return { error: "El informe ya fue emitido por otra persona" };
  revalidatePath(`/informes/${id}`);
  revalidatePath("/informes");
  if (orden) revalidatePath(`/ordenes/${orden.id}`);
  return {};
}

/** Corrección: nueva versión en borrador que referencia a la anterior; la emitida sigue vigente hasta que se emita la nueva. */
export async function corregirInforme(id: string, motivoCorreccion: string): Promise<R & { id?: string }> {
  const ctx = await exigirContexto(MEDICOS);
  const m = z.string().trim().min(5, "Explica el motivo de la corrección").max(500).safeParse(motivoCorreccion);
  if (!m.success) return { error: m.error.issues[0]?.message };
  const base = await prisma.informe.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!base) return { error: "Informe no encontrado" };
  if (!puedeCorregir(base)) return { error: "Solo se corrige la versión emitida vigente" };
  if (await prisma.informe.findFirst({ where: { grupoId: base.grupoId, estado: "BORRADOR" } })) return { error: "Ya hay una corrección en borrador" };
  const nuevo = await prisma.informe.create({
    data: {
      organizationId: base.organizationId, grupoId: base.grupoId, version: base.version + 1, pacienteId: base.pacienteId, ordenId: base.ordenId, estudioId: base.estudioId,
      motivo: base.motivo, tecnica: base.tecnica, hallazgos: base.hallazgos, impresion: base.impresion, recomendaciones: base.recomendaciones,
      motivoCorreccion: m.data, creadoPorId: ctx.usuario.id,
    },
  });
  const previas = await prisma.informeImagen.findMany({ where: { informeId: base.id, organizationId: base.organizationId } });
  if (previas.length) await prisma.informeImagen.createMany({ data: previas.map(({ id: _id, informeId: _i, ...c }) => ({ ...c, informeId: nuevo.id })) }); // la corrección hereda las capturas
  await registrarEvento({ organizationId: ctx.organizationId, pacienteId: base.pacienteId, actorId: ctx.usuario.id, tipo: "informe.correccion", detalle: { informeId: nuevo.id, version: nuevo.version, motivo: m.data } });
  revalidatePath("/informes");
  return { id: nuevo.id };
}

export async function archivarInforme(id: string): Promise<R> {
  const ctx = await exigirContexto(ADMIN);
  const inf = await prisma.informe.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!inf) return { error: "Informe no encontrado" };
  if (!puedeArchivar(inf.estado)) return { error: "Ya está archivado" };
  // Baja lógica: el PDF y el contenido emitidos permanecen íntegros.
  await prisma.informe.update({ where: { id }, data: { estado: "ARCHIVADO" } });
  await registrarEvento({ organizationId: ctx.organizationId, pacienteId: inf.pacienteId, actorId: ctx.usuario.id, tipo: "informe.archivado", detalle: { informeId: id } });
  revalidatePath("/informes");
  revalidatePath(`/informes/${id}`);
  return {};
}

const esquemaMembrete = z.object({
  nombre: z.string().trim().max(120).optional(), direccion: z.string().trim().max(200).optional(), telefono: z.string().trim().max(40).optional(),
  correo: z.string().trim().max(120).optional(), registro: z.string().trim().max(60).optional(),
  logo: esquemaLogo.nullish(),
});

/** Membrete del centro. Los campos vacíos caen al nombre del centro; el logo es opcional. */
export async function guardarMembrete(entrada: z.input<typeof esquemaMembrete>): Promise<R> {
  const ctx = await exigirContexto(ADMIN);
  const r = esquemaMembrete.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const d = r.data;
  const data = { nombre: d.nombre || null, direccion: d.direccion || null, telefono: d.telefono || null, correo: d.correo || null, registro: d.registro || null, ...(d.logo !== undefined ? { logo: d.logo } : {}) };
  await prisma.configCentro.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });
  revalidatePath("/informes");
  return {};
}
