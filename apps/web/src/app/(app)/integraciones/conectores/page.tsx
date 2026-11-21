import { prisma } from "@dent-view/db";
import { TarjetaConector } from "@/components/integraciones/conectores/tarjeta-conector";
import { ADAPTADORES } from "@/lib/integraciones/registro";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Conectores() {
  const ctx = await exigirContexto(ADMIN);
  const integraciones = await prisma.integracion.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, proveedor: true, activa: true, ultimaSync: true, estadoSync: true, errorSync: true, secretoEntrada: true, _count: { select: { vinculos: { where: { entidad: { in: ["paciente", "cita"] } } } } } },
  });
  const base = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
        Sincroniza pacientes y citas con tu sistema de gestión. Las credenciales se guardan cifradas y nunca se vuelven a mostrar. El sistema externo solo completa datos que estén vacíos: nunca reemplaza lo que ya tiene dent-view.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.values(ADAPTADORES).map((a) => {
          const i = integraciones.find((x) => x.proveedor === a.clave);
          return (
            <TarjetaConector
              key={a.clave}
              adaptador={{ clave: a.clave, nombre: a.nombre, descripcion: a.descripcion, verificado: a.verificado, advertencia: a.advertencia ?? null, campos: a.campos }}
              integracion={i ? { id: i.id, activa: i.activa, ultimaSync: i.ultimaSync?.toISOString() ?? null, estadoSync: i.estadoSync, errorSync: i.errorSync, vinculados: i._count.vinculos, urlEntrada: i.secretoEntrada ? `${base}/api/integraciones/entrada/${i.id}` : null } : null}
            />
          );
        })}
      </div>
    </div>
  );
}
