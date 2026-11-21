import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@dent-view/db";
import { AppSidebar } from "@/components/app-sidebar";
import { BuscadorGlobal } from "@/components/comunes/buscador-global";
import { AvisoInvitaciones } from "@/components/invitaciones/aviso-invitaciones";
import { BannerSuplantacion } from "@/components/plataforma/banner-suplantacion";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { auth } from "@/lib/auth";
import { ETIQUETA_ROL } from "@/lib/invitaciones";
import { cssMarca } from "@/lib/marca";
import { contextoActivo, obtenerSesion } from "@/lib/sesion";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await contextoActivo();
  const sesion = await obtenerSesion();
  const superadmin = sesion?.user.role === "admin";
  // Un superadmin sin centro activo entra igual (a /plataforma); cualquier otro sin contexto, a ingresar.
  if (!ctx && !superadmin) redirect("/ingresar");
  const orgs = ctx ? await auth.api.listOrganizations({ headers: await headers() }) : [];
  const activa = orgs.find((o) => o.id === ctx?.organizationId);
  const marca = ctx
    ? await prisma.configCentro.findUnique({ where: { organizationId: ctx.organizationId }, select: { nombre: true, logo: true, colorPrimario: true } })
    : null;
  // Solo se inyecta un hex validado (cssMarca devuelve null ante cualquier otro valor).
  const css = cssMarca(marca?.colorPrimario);
  // Una suplantación no puede responder invitaciones ajenas.
  const invitaciones = sesion && !sesion.session.impersonatedBy
    ? await prisma.invitation.findMany({
        where: { email: sesion.user.email.toLowerCase(), status: "pending", expiresAt: { gt: new Date() } },
        select: { id: true, role: true, organization: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return (
    <TooltipProvider>
    {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
    <SidebarProvider>
      <AppSidebar
        orgs={orgs.map((o) => ({ id: o.id, name: o.name }))}
        activa={ctx?.organizationId ?? ""}
        rol={ctx?.rol ?? ""}
        superadmin={superadmin}
        marca={{ nombre: marca?.nombre || activa?.name || "Sin centro", logo: marca?.logo ?? null }}
        usuario={{ nombre: sesion!.user.name, correo: sesion!.user.email }}
      />
      <SidebarInset className="min-w-0">
        {sesion?.session.impersonatedBy && <BannerSuplantacion centro={activa?.name ?? "el centro"} />}
        {invitaciones.length > 0 && (
          <AvisoInvitaciones invitaciones={invitaciones.map((i) => ({ id: i.id, centro: i.organization.name, rol: ETIQUETA_ROL[i.role ?? ""] ?? "miembro" }))} />
        )}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <span className="truncate text-sm text-muted-foreground">{marca?.nombre || activa?.name || "Plataforma"}</span>
          {ctx && <BuscadorGlobal />}
        </header>
        {/* SidebarInset ya es el <main> de la página: aquí solo un div (BUG-01). */}
        <div id="contenido" className="mx-auto w-full max-w-[96rem] min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
  );
}
