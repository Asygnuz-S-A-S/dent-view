import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { PestanasIntegraciones } from "@/components/integraciones/pestanas";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export default async function IntegracionesLayout({ children }: { children: React.ReactNode }) {
  await exigirContexto(ADMIN);
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Integraciones" descripcion="Conecta dent-view con otros sistemas: API con tokens, webhooks, conectores a sistemas de gestión de pacientes, pasarelas de pago y facturación electrónica DIAN." />
      <PestanasIntegraciones />
      {children}
    </div>
  );
}
