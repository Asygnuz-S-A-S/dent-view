import { prisma } from "@dent-view/db";
import { obtenerSesion } from "./sesion";
import { encolarWebhooks } from "./webhooks";
import { aEventoPublico } from "./webhooks-eventos";

type Cliente = Pick<typeof prisma, "evento" | "webhook" | "webhookEntrega" | "organization" | "pacienteTenant">;

/**
 * Registra un evento en la hoja de vida / auditoría. Solo inserta: los eventos no se editan ni se borran.
 * Si la sesión es una suplantación, guarda también al superadmin real (detalle.suplantadoPor).
 * Si el tipo es público, encola una entrega por cada webhook suscrito del centro (misma transacción si se recibe `tx`).
 */
export async function registrarEvento(
  e: { organizationId: string; tipo: string; pacienteId?: string | null; actorId?: string | null; detalle?: object },
  db: Cliente = prisma,
) {
  const suplantadoPor = await obtenerSesion().then((s) => s?.session.impersonatedBy ?? null, () => null);
  const detalle = suplantadoPor ? { ...(e.detalle ?? {}), suplantadoPor } : e.detalle;
  const evento = await db.evento.create({ data: { ...e, detalle: detalle ?? undefined } });
  const publico = aEventoPublico(e.tipo, e.detalle);
  if (publico) {
    const encolar = () => encolarWebhooks(db, { organizationId: e.organizationId, ...publico, pacienteId: e.pacienteId });
    // Sin transacción un fallo al encolar no debe romper la operación de negocio; con ella, un error aborta igual la transacción.
    if (db === prisma) await encolar().catch((err) => console.error("No se pudo encolar el webhook", e.tipo, err));
    else await encolar();
  }
  return evento;
}
