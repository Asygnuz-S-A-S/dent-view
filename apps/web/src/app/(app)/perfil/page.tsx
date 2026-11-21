import { prisma } from "@dent-view/db";
import { redirect } from "next/navigation";
import { FormClave, FormDatos, FormProfesional } from "@/components/perfil/formularios";
import { FormMfa } from "@/components/perfil/mfa";
import { debeActivarMfa, ROLES_PROFESIONALES } from "@/lib/perfil";
import { contextoActivo, obtenerSesion } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Perfil() {
  // No usa exigirContexto: es la página a la que se redirige a quien debe cambiar su clave.
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/ingresar");
  const { user } = sesion;
  const esProfesional =
    user.role === "admin" ||
    !!(await prisma.member.findFirst({ where: { userId: user.id, role: { in: [...ROLES_PROFESIONALES] } }, select: { id: true } }));
  const suplantado = !!sesion.session.impersonatedBy;
  const mfaPendiente = debeActivarMfa(user, (await contextoActivo())?.rol ?? null, suplantado);
  const pf = esProfesional ? await prisma.perfilDoctor.findUnique({ where: { userId: user.id } }) : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mi perfil</h1>
        <p className="text-sm text-muted-foreground">Tus datos de cuenta y tu contraseña.</p>
      </div>
      {user.debeCambiarClave && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Tu cuenta tiene una clave temporal. Debes cambiarla para continuar.
        </p>
      )}
      {mfaPendiente && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Tu rol de administrador exige la verificación en dos pasos. Actívala para continuar.
        </p>
      )}
      <FormDatos nombre={user.name} correo={user.email} />
      <FormClave />
      {/* Una suplantación no gestiona el MFA ajeno (además exigiría la contraseña del titular). */}
      {!suplantado && <FormMfa activo={!!user.twoFactorEnabled} />}
      {esProfesional && (
        <FormProfesional
          inicial={{
            tarjetaProfesional: pf?.tarjetaProfesional ?? "",
            especialidad: pf?.especialidad ?? "",
            telefono: pf?.telefono ?? "",
            consultorio: pf?.consultorio ?? "",
          }}
        />
      )}
    </div>
  );
}
