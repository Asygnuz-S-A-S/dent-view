// Página pública (móvil primero) de la cotización: pide el código del enlace y, validado, muestra la cotización y deja aceptar, rechazar o preguntar.
import { prisma } from "@dent-view/db";
import { CheckCircle2, Clock, ShieldCheck, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormCodigoPresupuesto } from "@/components/presupuestos/form-codigo-presupuesto";
import { RespuestaPresupuesto } from "@/components/presupuestos/respuesta-presupuesto";
import { PREFIJO_ACCESO } from "@/lib/bitacora";
import { registrarEvento } from "@/lib/eventos";
import { fechaHora } from "@/lib/fechas";
import { cssMarca } from "@/lib/marca";
import { admiteRespuesta, estaVencida, lineaNeta, numeroPresupuesto, textoAceptacion, totalGuardado, type EstadoPres } from "@/lib/presupuestos";
import { fechaTexto, presupuestoDelPaciente } from "@/lib/presupuestos-servidor";
import { cop } from "@/lib/precios";
import { truncarIp } from "@/lib/valoraciones";
import { ipCliente } from "@/lib/valoraciones-servidor";
import { marcarVisto } from "./actions";

export const dynamic = "force-dynamic";
// Con el token en la URL: ni buscadores ni referrers hacia otros orígenes.
export const metadata = { title: "Tu cotización", robots: { index: false, follow: false }, referrer: "same-origin" as const };

export default async function PresupuestoPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await presupuestoDelPaciente(token);
  if (!p) {
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 p-6">
        <div className="space-y-2 text-center">
          <ShieldCheck className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Tu cotización</h1>
          <p className="text-sm text-muted-foreground">Escribe el código de 6 dígitos que recibiste para continuar.</p>
        </div>
        <Card><CardContent><FormCodigoPresupuesto token={token} /></CardContent></Card>
      </main>
    );
  }

  const org = p.organizationId;
  await marcarVisto(token);
  const [centro, config, items, paciente] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: org }, select: { name: true } }),
    prisma.configCentro.findUnique({ where: { organizationId: org }, select: { nombre: true, logo: true, colorPrimario: true, telefono: true, direccion: true, correo: true } }),
    prisma.itemPresupuesto.findMany({ where: { presupuestoId: p.id, organizationId: org }, orderBy: [{ fase: "asc" }, { posicion: "asc" }] }),
    prisma.pacienteTenant.findFirst({ where: { id: p.pacienteId, organizationId: org }, select: { nombre: true } }),
  ]);
  await registrarEvento({ organizationId: org, pacienteId: p.pacienteId, tipo: `${PREFIJO_ACCESO}presupuesto`, detalle: { accion: "ver", presupuestoId: p.id, ip: truncarIp(await ipCliente()) } });
  const nombreCentro = config?.nombre || centro.name;
  const css = cssMarca(config?.colorPrimario);
  const estado = p.estado as EstadoPres;
  const total = totalGuardado(items);
  const vencida = estaVencida(p.validoHasta);
  const abierta = admiteRespuesta({ estado, validoHasta: p.validoHasta });
  const subtotal = items.reduce((t, i) => t + i.cantidad * i.valorUnitario, 0);
  const fases = [...new Set(items.map((i) => i.fase))];
  const contacto = [config?.direccion, config?.telefono && `Tel. ${config.telefono}`, config?.correo].filter(Boolean).join(" · ");
  const sinAcceso = estado === "VENCIDO" || estado === "BORRADOR";

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <header className="space-y-4">
        <div className="flex items-center gap-3 border-b-2 border-primary pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo del centro como data URI */}
          {config?.logo && <img src={config.logo} alt={`Logo de ${nombreCentro}`} className="size-11 rounded-lg object-contain" />}
          <div className="min-w-0"><p className="text-base font-semibold">{nombreCentro}</p>{contacto && <p className="text-xs text-muted-foreground">{contacto}</p>}</div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Cotización {numeroPresupuesto(p.numero)}</h1>
        <p className="text-sm text-muted-foreground">Hola, {paciente?.nombre}. {p.titulo ? `${p.titulo}. ` : ""}Vigente hasta el {fechaTexto(p.validoHasta!)}.</p>
      </header>

      {sinAcceso ? (
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock className="size-5 text-muted-foreground" aria-hidden /> Esta cotización ya no está activa</CardTitle>
          <CardDescription>Comunícate con {nombreCentro}{config?.telefono ? ` (${config.telefono})` : ""} para que te envíen una nueva.</CardDescription></CardHeader></Card>
      ) : (
        <>
          {vencida && estado !== "ACEPTADO" && estado !== "CONVERTIDO" && estado !== "RECHAZADO" && (
            <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-ink">Esta cotización venció el {fechaTexto(p.validoHasta!)} y ya no se puede aceptar. Comunícate con {nombreCentro} para que te envíen una vigente.</p>
          )}
          <Card>
            <CardHeader><CardTitle>Detalle</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              {fases.map((fase) => (
                <section key={fase} aria-label={`Fase ${fase}`} className="space-y-2">
                  {fases.length > 1 && <h2 className="text-sm font-semibold">Fase {fase}</h2>}
                  <ul className="divide-y rounded-md border">
                    {items.filter((i) => i.fase === fase).map((i) => (
                      <li key={i.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium break-words">{i.descripcion}{i.diente ? ` · diente ${i.diente}` : ""}</p>
                          <p className="text-xs text-muted-foreground">{i.cantidad} × {cop(i.valorUnitario)}{i.descuento > 0 ? ` · descuento ${cop(i.descuento)}` : ""}</p>
                        </div>
                        <span className="shrink-0 font-medium tabular-nums">{cop(lineaNeta(i))}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <dl className="space-y-1 border-t pt-3 text-sm">
                {subtotal !== total && <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{cop(subtotal)}</dd></div>}
                {subtotal !== total && <div className="flex justify-between"><dt className="text-muted-foreground">Descuentos</dt><dd className="tabular-nums">− {cop(subtotal - total)}</dd></div>}
                <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="tabular-nums" data-testid="total-publico">{cop(total)}</dd></div>
              </dl>
              {p.notas && <p className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">{p.notas}</p>}
              <p className="text-xs text-muted-foreground">Los valores son estimados y quedan sujetos a la valoración presencial.</p>
            </CardContent>
          </Card>

          {abierta && <RespuestaPresupuesto token={token} texto={textoAceptacion({ numero: p.numero, total, validoHasta: p.validoHasta!, centro: nombreCentro })} />}
          {estado === "ACEPTADO" || estado === "CONVERTIDO" ? (
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-success-ink" aria-hidden /> Aceptaste esta cotización</CardTitle>
              <CardDescription>El {fechaHora(p.aceptadoEn)}. {nombreCentro} se pondrá en contacto contigo para los siguientes pasos.</CardDescription></CardHeader></Card>
          ) : estado === "RECHAZADO" ? (
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><XCircle className="size-5 text-muted-foreground" aria-hidden /> Rechazaste esta cotización</CardTitle>
              <CardDescription>Si cambias de opinión, comunícate con {nombreCentro}.</CardDescription></CardHeader></Card>
          ) : null}
        </>
      )}
      <p className="text-xs text-muted-foreground">No compartas este enlace ni el código. Tus datos se tratan conforme a la Ley 1581 de 2012.</p>
    </main>
  );
}
