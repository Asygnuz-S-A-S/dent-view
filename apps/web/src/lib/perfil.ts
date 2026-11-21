export const ROLES_PROFESIONALES = ["doctor_remitente", "especialista"] as const;

export const MIN_CLAVE = 10;

/** Mensaje de error de la nueva contraseña, o null si es válida. */
export function validarClaveNueva(nueva: string, confirmacion: string): string | null {
  if (nueva.length < MIN_CLAVE) return `La contraseña debe tener al menos ${MIN_CLAVE} caracteres`;
  if (nueva !== confirmacion) return "La confirmación no coincide";
  return null;
}

/**
 * MFA obligatorio para el superadmin (user.role "admin") y para quien actúa como admin_tenant del centro activo.
 * Una suplantación ("Entrar al centro") no lo exige: el superadmin ya pasó su propio MFA.
 */
export function debeActivarMfa(
  usuario: { role?: string | null; twoFactorEnabled?: boolean | null },
  rolCentro: string | null,
  suplantado: boolean,
) {
  if (suplantado || usuario.twoFactorEnabled) return false;
  return usuario.role === "admin" || rolCentro === "admin_tenant";
}
