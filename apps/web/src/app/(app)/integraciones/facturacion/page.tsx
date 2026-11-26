import { prisma } from "@dent-view/db";
import Link from "next/link";
import { FacturadorForm } from "@/components/integraciones/facturacion/facturador-form";
import { HistorialDocumentos } from "@/components/integraciones/facturacion/historial-documentos";
import { TarjetaConexion } from "@/components/integraciones/facturacion/tarjeta-conexion";
import { Button } from "@/components/ui/button";
import { descifrar, secretoCifrado } from "@/lib/cifrado";
import { ETIQUETA_ESTADO_DOC, type EstadoDoc } from "@/lib/fe/estados";
import { configDeConexion } from "@/lib/fe/servicio";
import { numeroFactura } from "@/lib/facturacion";
import { fechaCorta } from "@/lib/fechas";
import { ultimos4 } from "@/lib/fe/proveedor";
import { proveedoresDisponibles, slugProveedor } from "@/lib/fe/registro";
import { ADMIN } from "@/lib/roles";
import { exigirContexto, exigirModulo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

const ESTADOS = Object.keys(ETIQUETA_ESTADO_DOC) as EstadoDoc[];

export default async function FacturacionElectronica({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const ctx = await exigirContexto(ADMIN);
  await exigirModulo(ctx, "facturacion-electronica");
  const { estado } = await searchParams;
  const filtro = ESTADOS.find((e) => e === estado);
  const org = ctx.organizationId;
  const [cfg, conexiones, docs] = await Promise.all([
    prisma.configFacturacion.findUnique({ where: { organizationId: org } }),
    prisma.conexionFE.findMany({ where: { organizationId: org }, include: { _count: { select: { documentos: true } } } }),
    prisma.documentoElectronico.findMany({ where: { organizationId: org, ...(filtro ? { estado: filtro } : {}) }, include: { factura: { select: { numero: true } } }, orderBy: { creadoEn: "desc" }, take: 50 }),
  ]);
  const base = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const enlace = (e?: string) => (e ? `/integraciones/facturacion?estado=${e}` : "/integraciones/facturacion");
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
        Conecta TU proveedor tecnológico autorizado por la DIAN: cada centro conserva su contrato, su resolución de numeración y su firma. Las credenciales se guardan cifradas y solo se muestran sus últimos 4 caracteres. Si no conectas un proveedor o no activas «Emitir factura electrónica», todo sigue como hoy con la cuenta de cobro interna.
      </p>
      <FacturadorForm
        inicial={{
          nit: cfg?.nit ?? "", razonSocial: cfg?.razonSocial ?? "", nombreComercial: cfg?.nombreComercial ?? "", codigoPrestador: cfg?.codigoPrestador ?? "", prefijoFactura: cfg?.prefijoFactura ?? "", regimen: cfg?.regimen ?? "",
          responsabilidadFiscal: cfg?.responsabilidadFiscal ?? "", modalidadDefecto: cfg?.modalidadDefecto ?? "", grupoServiciosDefecto: cfg?.grupoServiciosDefecto ?? "", generaRips: cfg?.generaRips ?? false, emiteFev: cfg?.emiteFev ?? false,
        }}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {proveedoresDisponibles().map((a) => {
          const c = conexiones.find((x) => x.proveedor === a.clave);
          let ultimos: Record<string, string> = {};
          try {
            const llaves: Record<string, string> = c && secretoCifrado() ? JSON.parse(descifrar(c.credencialesCifradas, secretoCifrado()!)) : {};
            ultimos = Object.fromEntries(a.campos.map((k) => [k.clave, ultimos4(llaves[k.clave])]));
          } catch {
            ultimos = {};
          }
          const config = c ? Object.fromEntries(Object.entries(configDeConexion(c)).map(([k, v]) => [k, String(v)])) : {};
          return (
            <TarjetaConexion
              key={a.clave}
              adaptador={{ clave: a.clave, nombre: a.nombre, descripcion: a.descripcion, noProbado: a.bloqueadoProduccion && !a.soloLocal, simulado: !!a.soloLocal, bloqueadoProduccion: a.bloqueadoProduccion, advertencia: a.advertencia ?? null, campos: a.campos, camposConfig: a.camposConfig ?? [], tieneWebhook: !!a.verificarWebhook }}
              conexion={c ? { id: c.id, modo: c.modo, activa: c.activa, documentos: c._count.documentos, ultimos, config, urlWebhook: `${base}/api/fe/${slugProveedor(a.clave)}/${c.id}` } : null}
            />
          );
        })}
      </div>
      <section className="space-y-3" aria-labelledby="hist-fe">
        <h2 id="hist-fe" className="text-lg font-semibold tracking-tight">Historial de documentos</h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant={filtro ? "outline" : "default"}><Link href={enlace()}>Todos</Link></Button>
          {ESTADOS.map((e) => <Button key={e} asChild size="sm" variant={filtro === e ? "default" : "outline"}><Link href={enlace(e)}>{ETIQUETA_ESTADO_DOC[e]}</Link></Button>)}
        </div>
        <HistorialDocumentos
          filas={docs.map((d) => ({
            id: d.id, tipo: d.tipo, facturaId: d.facturaId, factura: numeroFactura(d.factura.numero), estado: d.estado, numeroDian: d.numeroDian, intentos: d.intentos, fecha: fechaCorta(d.creadoEn),
            mensaje: Array.isArray(d.mensajes) && typeof d.mensajes[0] === "string" ? d.mensajes[0] : null,
          }))}
        />
      </section>
    </div>
  );
}
