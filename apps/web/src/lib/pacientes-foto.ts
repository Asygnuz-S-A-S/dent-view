// Validación pura de la foto del paciente: tipo real (por firma, no por lo que declara el cliente) y tamaño.
export const FOTO_MAX_BYTES = 5 * 1024 * 1024;
/** Tope del cuerpo de la petición (foto + formulario multipart); Caddy aplica el mismo. */
export const FOTO_MAX_PETICION = 6 * 1024 * 1024;
export const FOTO_TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;

/** Tipo de imagen según los primeros bytes; null si no es JPEG, PNG ni WebP. */
export function tipoDeImagen(b: Uint8Array): (typeof FOTO_TIPOS)[number] | null {
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  return null;
}

/** Mensaje de error si el archivo no es aceptable; null si sirve. */
export function validarFoto(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "El archivo está vacío";
  if (bytes.length > FOTO_MAX_BYTES) return "La foto supera los 5 MB";
  return tipoDeImagen(bytes) ? null : "Solo se aceptan imágenes JPEG, PNG o WebP";
}

/** Clave S3 de la foto: por centro y paciente; el sufijo cambia en cada subida para no servir una copia vieja. */
export const claveFoto = (organizationId: string, pacienteId: string, sufijo: string) =>
  `tenants/${organizationId}/pacientes/${pacienteId}/foto-${sufijo}.jpg`;

/** La clave guardada debe pertenecer al centro y al paciente antes de leerla o borrarla. */
export const claveFotoValida = (key: string, organizationId: string, pacienteId: string) =>
  key.startsWith(`tenants/${organizationId}/pacientes/${pacienteId}/`);
