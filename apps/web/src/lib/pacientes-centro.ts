import { prisma } from "@dent-view/db";

export type DatosPaciente = {
  nombre: string;
  fechaNacimiento?: Date | null;
  celular?: string | null;
  correo?: string | null;
  direccion?: string | null;
  alertas?: string | null;
  notas?: string | null;
};

/**
 * Registra al paciente en el centro. `Persona` solo guarda la identidad (tipo + número de documento):
 * los datos que se guardan son los que escribe este centro; nunca se leen ni copian los de otro centro.
 */
export async function crearPacienteEnCentro(
  organizationId: string,
  clave: { tipoDocumento: string; numeroDocumento: string },
  datos: DatosPaciente,
): Promise<{ existente: string } | { creado: { id: string } }> {
  const persona = await prisma.persona.upsert({
    where: { tipoDocumento_numeroDocumento: clave },
    update: {},
    create: clave,
    select: { id: true },
  });
  const enCentro = await prisma.pacienteTenant.findUnique({
    where: { organizationId_personaId: { organizationId, personaId: persona.id } },
    select: { id: true },
  });
  if (enCentro) return { existente: enCentro.id };
  const creado = await prisma.pacienteTenant.create({ data: { organizationId, personaId: persona.id, ...datos }, select: { id: true } });
  return { creado };
}
