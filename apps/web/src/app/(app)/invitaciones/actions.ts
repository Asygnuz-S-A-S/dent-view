"use server";

import { revalidatePath } from "next/cache";
import { responderInvitacion } from "@/lib/invitaciones";
import { obtenerSesion } from "@/lib/sesion";

/** El correo de la sesión debe ser el de la invitación (lo valida responderInvitacion). */
export async function responder(id: string, aceptar: boolean): Promise<{ error?: string }> {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.session.impersonatedBy) return { error: "Sesión no válida" };
  const r = await responderInvitacion(id, sesion.user, aceptar);
  if ("error" in r) return { error: r.error };
  revalidatePath("/", "layout");
  return {};
}
