"use client";

import {
  Building2, CalendarDays, Check, ChevronsUpDown, ClipboardList, House, LogOut, ScanLine, Settings2, ShieldCheck, HardDriveUpload, Plug,
  Stethoscope, Tags, Handshake, CircleUser, Users, UserRound, Receipt, Wallet, FlaskConical, ChartColumn, FileText, PhoneCall, Bell, Lock,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { SelectorTema } from "@/components/comunes/selector-tema";
import { authClient } from "@/lib/auth-client";

const TODOS = ["admin_tenant", "recepcion", "especialista", "doctor_remitente"];
const NAV = [
  {
    grupo: "Gestión",
    items: [
      { href: "/inicio", label: "Inicio", icon: House, roles: TODOS },
      { href: "/pacientes", label: "Pacientes", icon: UserRound, roles: ["admin_tenant", "recepcion", "especialista"] },
      { href: "/ordenes", label: "Órdenes", icon: ClipboardList, roles: TODOS },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, roles: ["admin_tenant", "recepcion", "especialista"] },
      { href: "/estudios", label: "Estudios", icon: ScanLine, roles: TODOS },
      { href: "/informes", label: "Informes", icon: FileText, roles: TODOS },
      { href: "/seguimiento", label: "Seguimiento", icon: PhoneCall, roles: ["admin_tenant", "recepcion", "especialista"] },
      { href: "/doctores", label: "Doctores remitentes", icon: Stethoscope, roles: ["admin_tenant", "recepcion"] },
      { href: "/laboratorio", label: "Laboratorio", icon: FlaskConical, roles: ["admin_tenant", "recepcion", "especialista"] },
    ],
  },
  {
    grupo: "Finanzas",
    items: [
      { href: "/facturacion", label: "Facturación", icon: Receipt, roles: ["admin_tenant", "recepcion"] },
      { href: "/cartera", label: "Cartera", icon: Wallet, roles: ["admin_tenant", "recepcion"] },
      { href: "/reportes", label: "Reportes", icon: ChartColumn, roles: ["admin_tenant"] },
    ],
  },
  {
    grupo: "Configuración",
    items: [
      { href: "/catalogo", label: "Catálogo y precios", icon: Tags, roles: ["admin_tenant"] },
      { href: "/convenios", label: "Convenios y tarifas", icon: Handshake, roles: ["admin_tenant"] },
      { href: "/usuarios", label: "Usuarios del centro", icon: Users, roles: ["admin_tenant"] },
      { href: "/ajustes", label: "Salas y ajustes", icon: Settings2, roles: ["admin_tenant"] },
      { href: "/ingesta", label: "Estaciones de ingesta", icon: HardDriveUpload, roles: ["admin_tenant"] },
      { href: "/integraciones", label: "Integraciones", icon: Plug, roles: ["admin_tenant"] },
      { href: "/notificaciones", label: "Notificaciones", icon: Bell, roles: ["admin_tenant"] },
      { href: "/proteccion-datos", label: "Protección de datos", icon: Lock, roles: ["admin_tenant", "recepcion"] },
    ],
  },
];

export const ROL_ETIQUETA: Record<string, string> = {
  admin_tenant: "Administrador",
  recepcion: "Recepción",
  especialista: "Especialista",
  doctor_remitente: "Doctor remitente",
};

// Ítem activo: peso medio e icono en el color del centro.
const ACTIVO = "data-[active=true]:font-medium data-[active=true]:[&>svg]:text-sidebar-primary";

const iniciales = (s: string) =>
  s.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

type Props = {
  orgs: { id: string; name: string }[];
  activa: string;
  rol: string;
  superadmin: boolean;
  usuario: { nombre: string; correo: string };
  /** Marca del centro activo: nombre comercial y logo (data URL). */
  marca: { nombre: string; logo: string | null };
};

export function AppSidebar({ orgs, activa, rol, superadmin, usuario, marca }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const activo = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  {marca.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- logo del centro como data URL
                    <img src={marca.logo} alt="" className="size-8 shrink-0 rounded-lg border bg-white object-contain" />
                  ) : (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                      <Building2 className="size-4" aria-hidden />
                    </div>
                  )}
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{marca.nombre}</span>
                    <span className="truncate text-xs text-muted-foreground">{ROL_ETIQUETA[rol] ?? rol}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-56" align="start">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Centros</DropdownMenuLabel>
                {orgs.map((o) => (
                  <DropdownMenuItem
                    key={o.id}
                    onSelect={async () => {
                      await authClient.organization.setActive({ organizationId: o.id });
                      router.refresh();
                    }}
                  >
                    {o.name}
                    {o.id === activa && <Check className="ml-auto size-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map(({ grupo, items }) => {
          const visibles = items.filter((i) => i.roles.includes(rol));
          if (!visibles.length) return null;
          return (
            <SidebarGroup key={grupo}>
              <SidebarGroupLabel>{grupo}</SidebarGroupLabel>
              <SidebarMenu>
                {visibles.map(({ href, label, icon: Icono }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild tooltip={label} isActive={activo(href)} className={ACTIVO}>
                      <Link href={href}>
                        <Icono />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
        {superadmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Centros" isActive={activo("/plataforma")} className={ACTIVO}>
                  <Link href="/plataforma">
                    <ShieldCheck />
                    <span>Centros (superadmin)</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">{iniciales(usuario.nombre)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{usuario.nombre}</span>
                    <span className="truncate text-xs text-muted-foreground">{usuario.correo}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-56" side="top" align="end">
                <DropdownMenuLabel className="font-normal">{usuario.correo}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/perfil"><CircleUser /> Mi perfil</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <SelectorTema />
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async () => {
                    await authClient.signOut();
                    router.push("/ingresar");
                    router.refresh();
                  }}
                >
                  <LogOut /> Salir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
