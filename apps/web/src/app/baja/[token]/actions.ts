"use server";

import { headers } from "next/headers";
import { secretoCifrado } from "@/lib/cifrado";
import { verificarBaja } from "@/lib/crm-baja";
import { aplicarBaja } from "@/lib/crm-motor-datos";
import { limitarIp } from "@/lib/entrega";

const intentos = new Map<string, number[]>();

/** Confirma la baja (solo con POST: abrir el enlace nunca da de baja, así los escáneres de correo no la disparan). */
export async function confirmarBaja(token: string): Promise<{ ok: true; centro: string } | { error: string }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconocida";
  if (!limitarIp(intentos, ip, Date.now(), 20, 10 * 60_000)) return { error: "Demasiados intentos. Prueba de nuevo en unos minutos." };
  const secreto = secretoCifrado();
  const sujeto = secreto ? verificarBaja(token, secreto) : null;
  if (!sujeto) return { error: "El enlace no es válido." };
  return aplicarBaja(sujeto);
}
