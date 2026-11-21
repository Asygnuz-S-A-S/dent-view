import { prisma } from "@dent-view/db";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, organization, twoFactor } from "better-auth/plugins";
import { conectores } from "./conectores";
import { marcaDeUsuario } from "./correo/marca";
import { correoEnlaceClave } from "./correo/vistas";
import { ac, roles } from "./permisos";

// Endpoints del plugin organization que la app NO usa (tiene sus propias server actions con reglas):
// bloquearlos evita crear centros por autoservicio, saltarse las reglas de miembros y listar el directorio.
const ENDPOINTS_BLOQUEADOS = new Set([
  "/organization/create",
  "/organization/update",
  "/organization/delete",
  "/organization/check-slug",
  "/organization/get-full-organization",
  "/organization/list-members",
  "/organization/get-active-member",
  "/organization/add-member",
  "/organization/remove-member",
  "/organization/update-member-role",
  "/organization/invite-member",
  "/organization/leave",
  // N8: las invitaciones se responden solo con la server action propia (valida correo verificado y suplantación).
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/cancel-invitation",
  "/organization/get-invitation",
  "/organization/list-invitations",
  "/organization/list-user-invitations",
]);

export const auth = betterAuth({
  appName: "dent-view",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Orígenes extra (p. ej. http://localhost:8080 junto a https://localhost:8443) en BETTER_AUTH_TRUSTED_ORIGINS, separados por coma.
  // Cookies Secure (__Secure-) cuando BETTER_AUTH_URL es https; Chrome/curl las aceptan también en http://localhost.
  advanced: { useSecureCookies: process.env.BETTER_AUTH_URL?.startsWith("https://") ?? false },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // cuentas creadas por el seed/admin, no autoservicio
    minPasswordLength: 10,
    // El mismo enlace sirve de bienvenida (cuenta creada por un tercero) y de recuperación; de un solo uso.
    resetPasswordTokenExpiresIn: 24 * 3600,
    revokeSessionsOnPasswordReset: true,
    // Sin await: ni la demora del SMTP ni un fallo cambian la respuesta (no revela si el correo existe).
    sendResetPassword: async ({ user, url }) => {
      marcaDeUsuario(user.id).then((marca) => conectores.CORREO.enviar({ ...correoEnlaceClave(user, url), marca })).catch((e) =>
        console.error("No se pudo enviar el correo de contraseña:", e instanceof Error ? e.message : e),
      );
    },
    // Abrir el enlace prueba que la persona controla el buzón: el correo queda verificado y la clave ya es suya (N1).
    onPasswordReset: async ({ user }) => {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true, debeCambiarClave: false } });
    },
  },
  // debeCambiarClave: cuentas creadas por un tercero con clave temporal; solo el servidor lo escribe (input: false).
  user: { additionalFields: { debeCambiarClave: { type: "boolean", defaultValue: false, input: false } } },
  // admin(): user.role "admin" = superadmin de la plataforma (ver todos los centros, entrar a uno).
  plugins: [
    organization({ ac, roles, creatorRole: "admin_tenant", allowUserToCreateOrganization: false }),
    admin(),
    // MFA por TOTP (obligatorio para admin_tenant y superadmin, ver sesion.ts); los códigos de respaldo se guardan cifrados.
    twoFactor({ issuer: "dent-view" }),
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ENDPOINTS_BLOQUEADOS.has(ctx.path)) throw new APIError("FORBIDDEN");
      // N5: del plugin admin la app solo usa la suplantación; el resto (cambiar claves, roles, crear usuarios) queda cerrado.
      if (ctx.path.startsWith("/admin/") && ctx.path !== "/admin/impersonate-user" && ctx.path !== "/admin/stop-impersonating")
        throw new APIError("FORBIDDEN");
      if (ctx.path !== "/admin/impersonate-user") return;
      // La suplantación solo se permite hacia el admin de un centro y siempre queda registrada en el servidor.
      const sesion = await getSessionFromCtx(ctx);
      const userId = (ctx.body as { userId?: string } | undefined)?.userId;
      if (!sesion || sesion.user.role !== "admin" || !userId) throw new APIError("FORBIDDEN");
      const objetivo = await prisma.member.findFirst({
        where: { userId, role: "admin_tenant", user: { OR: [{ role: null }, { role: { not: "admin" } }] } },
        orderBy: { createdAt: "asc" },
      });
      if (!objetivo) throw new APIError("FORBIDDEN", { message: "Solo se puede entrar como administrador de un centro" });
      await prisma.evento.create({
        data: {
          organizationId: objetivo.organizationId,
          tipo: "plataforma.entrada",
          actorId: sesion.user.id,
          detalle: { superadmin: sesion.user.email, suplantado: userId },
        },
      });
    }),
  },
  databaseHooks: {
    account: {
      update: {
        // Cambiar la contraseña (/change-password) levanta la obligación de cambio de clave.
        after: async (_cuenta, ctx) => {
          const userId = ctx?.path === "/change-password" ? ctx.context.session?.user.id : null;
          if (userId) await prisma.user.update({ where: { id: userId }, data: { debeCambiarClave: false } });
        },
      },
    },
    session: {
      create: {
        // Organización activa por defecto: la primera a la que pertenece el usuario.
        before: async (session) => {
          const m = await prisma.member.findFirst({
            where: { userId: session.userId },
            orderBy: { createdAt: "asc" },
          });
          return { data: { ...session, activeOrganizationId: m?.organizationId ?? null } };
        },
      },
    },
  },
});
