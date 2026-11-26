// Presentación por tipo de mensaje: título, texto del botón y aviso. El cuerpo (texto) sigue viniendo de las plantillas.
import type { TipoMensaje } from "../notificaciones";
import { primerUrl, type Vista } from "./plantilla";

const IGNORAR = "Si no esperabas este mensaje, puedes ignorarlo.";

const POR_TIPO: Record<TipoMensaje, { titulo: string; boton?: string; aviso?: string }> = {
  CITA_CREADA: { titulo: "Tu cita quedó agendada" },
  CITA_RECORDATORIO: { titulo: "Recordatorio de tu cita" },
  INFORME_PACIENTE: { titulo: "Tu informe está listo" },
  INFORME_REMITENTE: { titulo: "Informe listo", boton: "Ver informe" },
  SEGUIMIENTO: { titulo: "Es momento de tu control" },
  ENTREGA_ENLACE: { titulo: "Resultados disponibles", boton: "Ver resultados", aviso: IGNORAR },
  ENTREGA_CODIGO: { titulo: "Tu código de acceso", aviso: "No compartas este código con nadie. " + IGNORAR },
  ESTUDIO_ENLACE: { titulo: "Tienes un estudio disponible", boton: "Abrir estudio", aviso: IGNORAR },
  ESTUDIO_CODIGO: { titulo: "Tu código de acceso", aviso: "No compartas este código con nadie. " + IGNORAR },
  VALORACION_ENLACE: { titulo: "Completa tu valoración", boton: "Completar valoración", aviso: IGNORAR },
  VALORACION_CODIGO: { titulo: "Tu código de acceso", aviso: "No compartas este código con nadie. " + IGNORAR },
  VALORACION_RESULTADO: { titulo: "Tu valoración está lista", boton: "Ver valoración", aviso: IGNORAR },
  VALORACION_AVISO: { titulo: "Valoración por revisar", boton: "Abrir valoración" },
  PRESUPUESTO_ENLACE: { titulo: "Tu cotización está lista", boton: "Ver cotización", aviso: IGNORAR },
  PRESUPUESTO_CODIGO: { titulo: "Tu código de acceso", aviso: "No compartas este código con nadie. " + IGNORAR },
  PRESUPUESTO_RESPUESTA: { titulo: "Novedad en una cotización", boton: "Abrir cotización" },
  VINCULO_SOLICITADO: { titulo: "Solicitud de vínculo", boton: "Revisar solicitud" },
  REMISION_RECIBIDA: { titulo: "Tienes una remisión nueva", boton: "Abrir remisión" },
  REMISION_RESPONDIDA: { titulo: "Novedad en una remisión", boton: "Abrir remisión" },
};

export function vistaMensaje(tipo: string, cuerpo: string, codigo?: string | null): Vista {
  const p = POR_TIPO[tipo as TipoMensaje];
  if (!p) return {};
  const url = p.boton ? primerUrl(cuerpo) : null;
  return { titulo: p.titulo, aviso: p.aviso, boton: url ? { texto: p.boton!, url } : undefined, destacado: codigo || undefined };
}

/** Correo con el enlace para fijar la contraseña: bienvenida si la cuenta la creó un tercero, recuperación si no. */
export function correoEnlaceClave(usuario: { name: string; email: string; debeCambiarClave?: boolean | null }, url: string): { para: string; asunto: string; cuerpo: string; vista: Vista } {
  const bienvenida = !!usuario.debeCambiarClave;
  return {
    para: usuario.email,
    vista: {
      titulo: bienvenida ? "Activa tu cuenta" : "Restablece tu contraseña",
      preheader: bienvenida ? "Fija tu contraseña para empezar." : "Usa este enlace para crear una contraseña nueva.",
      boton: { texto: bienvenida ? "Fijar mi contraseña" : "Restablecer contraseña", url },
      aviso: bienvenida ? "El enlace sirve una sola vez y vence en 24 horas. Si no esperabas este correo, ignóralo." : "El enlace sirve una sola vez y vence en 24 horas. Si no solicitaste este cambio, ignora este correo: tu contraseña seguirá igual.",
    },
    asunto: bienvenida ? "Tu cuenta en dent-view" : "Recupera tu contraseña de dent-view",
    cuerpo: [
      `Hola, ${usuario.name}:`,
      bienvenida
        ? "Se creó una cuenta para ti en dent-view. Para activarla, fija tu contraseña en este enlace:"
        : "Recibimos una solicitud para cambiar tu contraseña. Fíjala en este enlace:",
      url,
    ].join("\n\n"),
  };
}

