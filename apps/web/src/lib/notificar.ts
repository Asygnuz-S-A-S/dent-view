// Implementación independiente (sala limpia) a partir de docs/sala-limpia/04-notificaciones.md
// Cola de mensajes: encolar (decide si/por dónde) y despachar (envía con reintentos). Nada de red en la petición del usuario.
import { prisma } from "@dent-view/db";
import { conectores } from "./conectores";
import {
  decidirEnvio, esperaMinutos, PLANTILLAS_DEFECTO, renderPlantilla, TIPOS_SENSIBLES, type Canal, type TipoMensaje,
} from "./notificaciones";

type Cliente = Pick<typeof prisma, "mensaje" | "pacienteTenant" | "preferenciaContacto">;

type Entrada = {
  organizationId: string; tipo: TipoMensaje; pacienteId?: string | null;
  /** Dirección alterna (p. ej. correo del doctor remitente); el destinatario no es el paciente. */
  direccion?: string | null;
  contexto: Record<string, string | number | null>;
  canales?: Canal[]; claveUnica?: string;
};

/** Encola (o registra como omitido con motivo). Pasa `tx` para que, si la operación de negocio se revierte, no quede mensaje. */
export async function encolarMensaje(e: Entrada, db: Cliente = prisma) {
  if (e.claveUnica && (await db.mensaje.findFirst({ where: { organizationId: e.organizationId, claveUnica: e.claveUnica }, select: { id: true } }))) return null;
  const pac = e.pacienteId
    ? await db.pacienteTenant.findFirst({ where: { id: e.pacienteId, organizationId: e.organizationId }, include: { persona: true } })
    : null;
  const pref = pac ? await db.preferenciaContacto.findUnique({ where: { pacienteId: pac.id } }) : null;
  const d = decidirEnvio({
    tipo: e.tipo, pref, contacto: { correo: pac?.correo, celular: pac?.celular },
    canales: e.canales, direccion: e.direccion, ajeno: !!e.direccion,
  });
  const base = { organizationId: e.organizationId, pacienteId: pac?.id ?? null, tipo: e.tipo, claveUnica: e.claveUnica ?? null, contexto: { ...e.contexto, destinoAjeno: e.direccion ? 1 : 0 } };
  return db.mensaje.create({
    data: d.ok ? { ...base, canal: d.canal, destinatario: d.destinatario } : { ...base, estado: "OMITIDO", motivo: d.motivo },
  });
}

async function componer(m: { organizationId: string; tipo: string; canal: string; contexto: unknown }) {
  const plantilla = (await prisma.plantillaMensaje.findFirst({ where: { organizationId: m.organizationId, tipo: m.tipo, canal: m.canal, activa: true } })) ?? PLANTILLAS_DEFECTO[m.tipo as TipoMensaje];
  if (!plantilla) throw new Error(`Sin plantilla para ${m.tipo}`);
  const vars = (m.contexto ?? {}) as Record<string, string>;
  return { asunto: renderPlantilla(plantilla.asunto, vars), cuerpo: renderPlantilla(plantilla.cuerpo, vars) };
}

/** Procesa un lote de mensajes vencidos. Cada mensaje se reclama de forma optimista: dos procesos nunca toman el mismo. */
export async function despachar(opts: { limite?: number; organizationId?: string } = {}) {
  const ahora = new Date();
  const candidatos = await prisma.mensaje.findMany({
    where: { estado: { in: ["EN_COLA", "FALLIDO"] }, proximoIntento: { lte: ahora }, ...(opts.organizationId ? { organizationId: opts.organizationId } : {}) },
    orderBy: { creadoEn: "asc" }, take: opts.limite ?? 50,
  });
  let enviados = 0, fallidos = 0, omitidos = 0;
  for (const m of candidatos) {
    if (m.intentos >= m.maxIntentos) continue;
    // Reclamo: solo avanza el contador si nadie más lo tocó; el próximo intento sirve de arrendamiento ante caídas.
    const reclamo = await prisma.mensaje.updateMany({ where: { id: m.id, intentos: m.intentos, estado: { in: ["EN_COLA", "FALLIDO"] } }, data: { intentos: m.intentos + 1, proximoIntento: new Date(ahora.getTime() + 5 * 60_000) } });
    if (reclamo.count !== 1) continue;
    try {
      // Consentimiento revalidado justo antes de enviar.
      const ctx = (m.contexto ?? {}) as Record<string, string | number | null>;
      const pref = m.pacienteId && ctx.destinoAjeno !== 1 ? await prisma.preferenciaContacto.findUnique({ where: { pacienteId: m.pacienteId } }) : null;
      if (pref?.noContactar) {
        await prisma.mensaje.update({ where: { id: m.id }, data: { estado: "OMITIDO", motivo: "El paciente pidió no ser contactado" } });
        omitidos++;
        continue;
      }
      const { asunto, cuerpo } = await componer(m);
      // N6: el PDF clínico nunca viaja adjunto; el paciente lo descarga con enlace + código.
      const r = await conectores[m.canal as Canal].enviar({ para: m.destinatario ?? "", asunto, cuerpo });
      await prisma.mensaje.update({ where: { id: m.id }, data: { estado: "ENVIADO", asunto, cuerpo: TIPOS_SENSIBLES.includes(m.tipo) ? "(contenido con credenciales de acceso omitido)" : cuerpo, ...(TIPOS_SENSIBLES.includes(m.tipo) && { contexto: {} }), proveedor: r.proveedor, simulado: r.simulado, enviadoEn: new Date(), error: null } });
      enviados++;
    } catch (err) {
      const intentos = m.intentos + 1;
      await prisma.mensaje.update({
        where: { id: m.id },
        data: {
          estado: "FALLIDO", error: String(err instanceof Error ? err.message : err).slice(0, 300), proximoIntento: new Date(Date.now() + esperaMinutos(intentos) * 60_000),
          // N2: un mensaje sensible que agotó sus intentos no conserva credenciales.
          ...(TIPOS_SENSIBLES.includes(m.tipo) && intentos >= m.maxIntentos && { contexto: {} }),
        },
      });
      fallidos++;
    }
  }
  return { enviados, fallidos, omitidos };
}
