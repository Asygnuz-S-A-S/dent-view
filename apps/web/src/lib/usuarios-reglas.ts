// Reglas puras de gestión de miembros de un centro (sin I/O) para poder probarlas.

export const ROLES_STAFF = ["admin_tenant", "recepcion", "especialista"] as const;

type Cambio = {
  actorId: string;
  objetivoId: string;
  rolActual: string;
  /** Rol nuevo, o null si se quita del centro. */
  rolNuevo: string | null;
  /** Cantidad de admin_tenant del centro antes del cambio. */
  admins: number;
};

/** Devuelve el mensaje de error si el cambio no está permitido, o null si procede. */
export function validarCambioMiembro(c: Cambio): string | null {
  if (c.rolActual === "doctor_remitente") return "Los doctores remitentes se gestionan en Doctores remitentes.";
  if (c.rolNuevo !== null && !(ROLES_STAFF as readonly string[]).includes(c.rolNuevo)) return "Rol no válido.";
  const sigueAdmin = c.rolNuevo === "admin_tenant";
  if (c.actorId === c.objetivoId && !sigueAdmin) return "No puedes quitarte ni degradarte a ti mismo.";
  if (c.rolActual === "admin_tenant" && !sigueAdmin && c.admins <= 1) return "Debe quedar al menos un administrador.";
  return null;
}
