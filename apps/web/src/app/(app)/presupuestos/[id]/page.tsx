import { prisma } from "@dent-view/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { AccionesPresupuesto } from "@/components/presupuestos/acciones-presupuesto";
import { BadgePresupuesto } from "@/components/presupuestos/badge-presupuesto";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fechaHora } from "@/lib/fechas";
import { normalizarDocumento } from "@/lib/pacientes";
import { cop } from "@/lib/precios";
import { admiteRespuesta, calcularTotales, esEditable, estadoVisible, lineaNeta, numeroPresupuesto, puedeAnular, type EstadoPres } from "@/lib/presupuestos";
import { contextoPresupuestos, fechaTexto, opcionesEditor, presupuestoVisible } from "@/lib/presupuestos-servidor";
import { modulosHabilitadoEnCentro } from "@/lib/sesion";

export const dynamic = "force-dynamic";

type Hito = { fecha: Date; texto: string };

export default async function FichaPresupuesto({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoPresupuestos();
  const { id } = await params;
  const p = await presupuestoVisible(ctx, id);
  if (!p) notFound();
  const org = ctx.organizationId;
  const [items, paciente, eventos, opciones, conCrm, conVal] = await Promise.all([
    prisma.itemPresupuesto.findMany({ where: { presupuestoId: id, organizationId: org }, orderBy: [{ fase: "asc" }, { posicion: "asc" }] }),
    prisma.pacienteTenant.findFirst({ where: { id: p.pacienteId, organizationId: org }, select: { id: true, nombre: true, persona: { select: { numeroDocumento: true } } } }),
    prisma.evento.findMany({ where: { organizationId: org, tipo: { startsWith: "presupuesto." }, detalle: { path: ["presupuestoId"], equals: id } }, orderBy: { creadoEn: "asc" }, take: 100 }),
    p.estado === "ACEPTADO" ? opcionesEditor(org) : null,
    modulosHabilitadoEnCentro(org, "crm"),
    modulosHabilitadoEnCentro(org, "valoraciones"),
  ]);
  const estadoDb = p.estado as EstadoPres;
  const visible = estadoVisible({ estado: estadoDb, validoHasta: p.validoHasta });
  const t = calcularTotales(items.map((i) => ({ ...i, costoUnitario: i.costoUnitario })));
  const fases = [...new Set(items.map((i) => i.fase))];
  const coincide = !!p.aceptadoDocumento && !!paciente && normalizarDocumento(p.aceptadoDocumento) === paciente.persona.numeroDocumento;

  const detalle = (e: { detalle: unknown }) => (e.detalle ?? {}) as { texto?: string; motivo?: string; ordenNumero?: number; correoEnviado?: boolean };
  const hitos: Hito[] = [
    { fecha: p.creadoEn, texto: "Creada" },
    ...(p.enviadoEn ? [{ fecha: p.enviadoEn, texto: "Enviada al paciente" }] : []),
    ...eventos.flatMap((e): Hito[] => {
      const d = detalle(e);
      if (e.tipo === "presupuesto.reenviado") return [{ fecha: e.creadoEn, texto: "Reenviada con enlace y código nuevos" }];
      if (e.tipo === "presupuesto.pregunta") return [{ fecha: e.creadoEn, texto: `Pregunta del paciente: «${d.texto ?? ""}»` }];
      if (e.tipo === "presupuesto.anulado") return [{ fecha: e.creadoEn, texto: `Anulada: ${d.motivo ?? ""}` }];
      if (e.tipo === "presupuesto.convertido") return [{ fecha: e.creadoEn, texto: `Convertida en la orden ${d.ordenNumero ? `#${String(d.ordenNumero).padStart(4, "0")}` : ""}` }];
      return [];
    }),
    ...(p.vistoEn ? [{ fecha: p.vistoEn, texto: "Vista por el paciente" }] : []),
    ...(p.aceptadoEn ? [{ fecha: p.aceptadoEn, texto: `Aceptada por ${p.aceptadoNombre}` }] : []),
    ...(p.rechazadoEn ? [{ fecha: p.rechazadoEn, texto: `Rechazada${p.rechazoMotivo ? `: ${p.rechazoMotivo}` : ""}` }] : []),
  ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo={`Cotización ${numeroPresupuesto(p.numero)}`} insignia={<BadgePresupuesto estado={visible} />}
        descripcion={[p.titulo, p.validoHasta ? `Vigente hasta el ${fechaTexto(p.validoHasta)}` : null].filter(Boolean).join(" · ")}>
        <p className="text-sm text-muted-foreground">
          Para <Link className="underline" href={`/pacientes/${p.pacienteId}`}>{paciente?.nombre}</Link>
          {p.leadId && conCrm && <> · <Link className="underline" href={`/crm/leads/${p.leadId}`}>ver lead</Link></>}
          {p.valoracionId && conVal && <> · <Link className="underline" href={`/valoraciones/${p.valoracionId}`}>ver valoración</Link></>}
          {p.ordenId && <> · <Link className="underline" href={`/ordenes/${p.ordenId}`}>ver orden</Link></>}
        </p>
      </EncabezadoPagina>
      <AccionesPresupuesto id={p.id} puedeEditar={esEditable({ estado: estadoDb })} puedeEnviar={estadoDb === "BORRADOR"} puedeReenviar={estadoDb !== "BORRADOR" && admiteRespuesta({ estado: estadoDb, validoHasta: p.validoHasta })}
        puedeAnular={puedeAnular({ estado: estadoDb })} puedeConvertir={estadoDb === "ACEPTADO" && !p.ordenId} convenios={opciones?.convenios ?? []} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Ítems</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {fases.map((fase) => (
                <section key={fase} aria-label={`Fase ${fase}`} className="space-y-2">
                  {fases.length > 1 && <h2 className="text-sm font-semibold">Fase {fase}</h2>}
                  <ul className="divide-y rounded-md border">
                    {items.filter((i) => i.fase === fase).map((i) => (
                      <li key={i.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium break-words">{i.descripcion}{i.diente ? ` · diente ${i.diente}` : ""}{!i.servicioId && <span className="ml-2 text-xs font-normal text-muted-foreground">(libre)</span>}</p>
                          <p className="text-xs text-muted-foreground">{i.cantidad} × {cop(i.valorUnitario)}{i.descuento > 0 ? ` · descuento ${cop(i.descuento)}` : ""}{ctx.esAdmin && i.costoUnitario > 0 ? ` · costo ${cop(i.costoUnitario)}` : ""}</p>
                        </div>
                        <span className="shrink-0 font-medium tabular-nums">{cop(lineaNeta(i))}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <dl className="space-y-1 border-t pt-3 text-sm tabular-nums">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{cop(t.subtotal)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Descuentos</dt><dd>− {cop(t.descuentoItems)}</dd></div>
                <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd data-testid="total-ficha">{cop(t.total)}</dd></div>
              </dl>
              {p.notas && <p className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">{p.notas}</p>}
            </CardContent>
          </Card>
          {ctx.esAdmin && t.costo > 0 && (
            <Card><CardHeader><CardTitle>Costo y margen</CardTitle><CardDescription>Solo lo ve el administrador; nunca llega al paciente.</CardDescription></CardHeader>
              <CardContent><dl className="grid gap-2 text-sm tabular-nums sm:grid-cols-3">
                <div><dt className="text-muted-foreground">Costo</dt><dd className="font-medium">{cop(t.costo)}</dd></div>
                <div><dt className="text-muted-foreground">Utilidad</dt><dd className="font-medium">{cop(t.utilidad)}</dd></div>
                <div><dt className="text-muted-foreground">Margen sobre costo</dt><dd className="font-medium">{t.margenPct} %</dd></div>
              </dl></CardContent></Card>
          )}
        </div>
        <aside className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Línea de tiempo</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {hitos.map((h, i) => (
                  <li key={i} className="border-l-2 pl-3 text-sm"><p className="break-words">{h.texto}</p><p className="text-xs text-muted-foreground">{fechaHora(h.fecha)}</p></li>
                ))}
              </ol>
            </CardContent>
          </Card>
          {p.aceptadoEn && (
            <Card>
              <CardHeader><CardTitle>Aceptación</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Nombre:</span> {p.aceptadoNombre}</p>
                <p><span className="text-muted-foreground">Documento:</span> {p.aceptadoDocumento} {coincide ? "(coincide con el del paciente)" : "(no coincide con el del paciente: verifícalo)"}</p>
                <p><span className="text-muted-foreground">Texto:</span> versión {p.textoAceptacionVersion}</p>
                <p className="break-all text-xs text-muted-foreground">Huella del texto: {p.textoAceptacionHash?.slice(0, 16)}…</p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
