// Cuerpos aceptados por los POST/PATCH de /api/v1. strictObject: un campo desconocido (p. ej. "precio") se rechaza con 422.
import { z } from "zod";
import { esquemaNumeroDocumento, esquemaTipoDocumento } from "./pacientes";

export const esquemaPacienteApi = z.strictObject({
  tipoDocumento: esquemaTipoDocumento,
  numeroDocumento: esquemaNumeroDocumento,
  nombre: z.string().trim().min(2).max(200),
  fechaNacimiento: z.iso.date().optional(),
  celular: z.string().trim().max(30).optional(),
  correo: z.email().max(200).optional(),
  direccion: z.string().trim().max(300).optional(),
});

/** Solo contacto: el documento (y el nombre) nunca cambian por la API. */
export const esquemaPacientePatch = z
  .strictObject({
    celular: z.string().trim().max(30).nullable().optional(),
    correo: z.email().max(200).nullable().optional(),
    direccion: z.string().trim().max(300).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Envía al menos un campo");

/** Sin precios: el servidor los calcula con resolverPrecio. */
export const esquemaOrdenApi = z
  .strictObject({
    pacienteId: z.string().min(1).max(40),
    doctorId: z.string().min(1).max(40).optional(),
    doctorCorreo: z.email().max(200).optional(),
    entrega: z.enum(["IMPRESA", "DIGITAL"]).default("DIGITAL"),
    observaciones: z.string().trim().max(2000).optional(),
    servicios: z.array(z.strictObject({ servicioId: z.string().min(1).max(40), opciones: z.string().trim().max(500).optional() })).min(1).max(50),
  })
  .refine((d) => !(d.doctorId && d.doctorCorreo), "Envía doctorId o doctorCorreo, no ambos");

export const esquemaCitaApi = z.strictObject({
  salaId: z.string().min(1).max(40),
  pacienteId: z.string().min(1).max(40),
  ordenId: z.string().min(1).max(40).optional(),
  inicio: z.iso.datetime({ offset: true }),
  duracion: z.number().int().min(15).max(60),
  notas: z.string().trim().max(1000).optional(),
});
