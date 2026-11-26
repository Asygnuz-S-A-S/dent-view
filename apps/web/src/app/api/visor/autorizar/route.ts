import { prisma } from "@dent-view/db";
import { auth } from "@/lib/auth";
import { decidirAccesoVisor, extraerEstudioUid, puedeVerEstudio } from "@/lib/acceso";
import { CLINICOS } from "@/lib/roles";
import { enlaceDeCookie } from "@/lib/resultados";

export const dynamic = "force-dynamic";

// forward_auth de Caddy: 200 permite, 401 sin sesión ni cookie de resultados válida, 403 en cualquier otro caso.
export async function GET(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  // N9: una cuenta con clave temporal sin cambiar no abre el visor.
  const sesion = s?.user.debeCambiarClave ? null : s;
  const uid = extraerEstudioUid(req.headers.get("x-forwarded-uri"));
  const estudio = uid
    ? await prisma.estudio.findUnique({
        where: { studyInstanceUid: uid },
        select: { organizationId: true, doctorRemitenteId: true, pacienteId: true },
      })
    : null;
  const miembro =
    sesion && estudio
      ? await prisma.member.findUnique({
          where: { organizationId_userId: { organizationId: estudio.organizationId, userId: sesion.user.id } },
        })
      : null;
  // Doctor remitente ajeno al estudio: lo ve solo si el centro se lo compartió (enlace DOCTOR activo a su correo).
  const compartido =
    sesion && estudio && uid && estudio.pacienteId && miembro?.role === "doctor_remitente"
      ? !!(await prisma.enlaceEntrega.findFirst({
          where: {
            organizationId: estudio.organizationId, pacienteId: estudio.pacienteId, destinatarioTipo: "DOCTOR", revocadoEn: null,
            venceEn: { gt: new Date() }, estudioUids: { has: uid }, destinatarioCorreo: { equals: sesion.user.email, mode: "insensitive" },
          },
          select: { id: true },
        }))
      : false;
  // Remisión: el centro origen ve en el visor (solo lectura) los estudios que el destino le devolvió.
  const remitido =
    sesion && estudio && uid && estudio.pacienteId && !puedeVerEstudio(sesion.user.id, miembro?.role ?? null, estudio)
      ? !!(await prisma.remision.findFirst({
          where: {
            destinoId: estudio.organizationId, pacienteDestinoId: estudio.pacienteId, estado: "DEVUELTA", estudioUids: { has: uid },
            origen: { members: { some: { userId: sesion.user.id, role: { in: [...CLINICOS] } } } },
          },
          select: { id: true },
        }))
      : false;
  // Sin sesión, la cookie de resultados (enlace + código) da acceso de solo lectura a los estudios de ese enlace.
  const enlace = sesion ? null : await enlaceDeCookie();
  const status = decidirAccesoVisor({
    usuarioId: sesion?.user.id ?? null,
    metodo: req.headers.get("x-forwarded-method"),
    uid,
    estudio,
    rol: miembro?.role ?? null,
    compartido,
    remitido,
    // N3: el estudio debe seguir siendo del paciente y centro del enlace (pudo reasignarse después de entregarlo).
    enlace: enlace && {
      estudioUids: estudio && estudio.organizationId === enlace.organizationId && estudio.pacienteId === enlace.pacienteId ? enlace.estudioUids : [],
      activo: true,
    },
  });
  return new Response(null, { status });
}
