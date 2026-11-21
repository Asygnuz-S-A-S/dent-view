/** Mensaje de la pantalla de ingreso según el estado HTTP que devolvió el servidor. */
export function mensajeErrorLogin(status?: number) {
  if (status === 429) return "Demasiados intentos. Espera un minuto antes de volver a intentarlo.";
  if (status && status >= 500) return "No pudimos iniciar sesión por un problema del servidor. Inténtalo de nuevo en unos minutos.";
  return "Correo o contraseña incorrectos.";
}
