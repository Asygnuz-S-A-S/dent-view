// Implementación independiente (sala limpia) a partir de docs/sala-limpia/04-notificaciones.md
import { prisma } from "@dent-view/db";
import { HorasRecordatorio, PlantillaEditor, ProcesarCola } from "@/components/seguimiento/notificaciones-ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { smtpConfigurado } from "@/lib/conectores";
import { ETIQUETA_TIPO_MENSAJE, PLANTILLAS_DEFECTO, TIPOS_MENSAJE, type TipoMensaje } from "@/lib/notificaciones";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { fechaHoraCompleta } from "@/lib/fechas";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";

export const dynamic = "force-dynamic";

export default async function Notificaciones() {
  const ctx = await exigirContexto(ADMIN);
  const org = ctx.organizationId;
  const [mensajes, plantillas, config] = await Promise.all([
    prisma.mensaje.findMany({ where: { organizationId: org }, orderBy: [{ creadoEn: "desc" }, { id: "desc" }], take: 100 }),
    prisma.plantillaMensaje.findMany({ where: { organizationId: org, canal: "CORREO", activa: true } }),
    prisma.configCentro.findUnique({ where: { organizationId: org } }),
  ]);
  const propias = new Map(plantillas.map((p) => [p.tipo, p]));
  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Notificaciones"
        descripcion={<>Correo por SMTP: {smtpConfigurado() ? "configurado" : "sin configurar (los envíos se registran como simulados)"}. SMS y WhatsApp: solo conector simulado.</>}
        acciones={<ProcesarCola />}
      />
      <HorasRecordatorio inicial={config?.recordatorioHoras ?? 24} />

      <Card className="py-0"><CardContent className="px-0">
        {mensajes.length === 0 ? <EstadoVacio titulo="Aún no hay mensajes" descripcion="Se generan al crear citas, informes y recordatorios." /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="pl-4 md:pl-6">Fecha</TableHead><TableHead>Tipo</TableHead><TableHead className="hidden lg:table-cell">Canal</TableHead><TableHead className="hidden lg:table-cell">Destinatario</TableHead><TableHead>Estado</TableHead><TableHead className="hidden pr-4 md:pr-6 lg:table-cell">Detalle</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {mensajes.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="pl-4 md:pl-6">{fechaHoraCompleta(m.creadoEn)}</TableCell>
                  <TableCell>{ETIQUETA_TIPO_MENSAJE[m.tipo as TipoMensaje] ?? m.tipo}</TableCell>
                  <TableCell className="hidden lg:table-cell">{m.canal}</TableCell>
                  <TableCell className="hidden lg:table-cell">{m.destinatario ?? "—"}</TableCell>
                  <TableCell><Badge variant={m.estado === "ENVIADO" ? "default" : m.estado === "FALLIDO" ? "destructive" : "secondary"}>{m.estado === "ENVIADO" && m.simulado ? "Simulado" : m.estado}</Badge></TableCell>
                  <TableCell className="hidden pr-4 md:pr-6 text-xs text-muted-foreground lg:table-cell">{m.motivo ?? m.error ?? (m.intentos ? `${m.intentos} intento(s)` : "")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Plantillas de correo</h2>
        <p className="text-xs text-muted-foreground">Variables disponibles: {"{{paciente}}, {{centro}}, {{fecha}}, {{hora}}, {{direccion}}, {{telefono}}, {{orden}}, {{medico}}, {{enlace}}, {{motivo}}, {{mes}}"}.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {TIPOS_MENSAJE.map((t) => {
            const p = propias.get(t);
            return <PlantillaEditor key={t} tipo={t} etiqueta={ETIQUETA_TIPO_MENSAJE[t]} asunto={p?.asunto ?? PLANTILLAS_DEFECTO[t].asunto} cuerpo={p?.cuerpo ?? PLANTILLAS_DEFECTO[t].cuerpo} personalizada={!!p} />;
          })}
        </div>
      </div>
    </div>
  );
}
