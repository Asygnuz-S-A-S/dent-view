import { NavCrm } from "@/components/crm/nav-crm";
import { esGestion } from "@/lib/crm-datos";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

// El doctor remitente no ve el CRM (404). Cada página vuelve a exigir su rol: los layouts no se reejecutan en navegación suave.
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const ctx = await exigirContexto(CLINICOS);
  return (
    <div className="space-y-6">
      <NavCrm gestion={esGestion(ctx.rol)} />
      {children}
    </div>
  );
}
