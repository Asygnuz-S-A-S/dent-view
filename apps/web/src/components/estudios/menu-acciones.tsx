"use client";

import { Box, Download, FilePlus, FileText, Link2, Link2Off, MoreHorizontal, Send, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { crearInformeDeEstudio } from "@/app/(app)/informes/actions";
import { publicarEstudio } from "@/app/(app)/estudios/actions";
import { AsignarEstudio, VincularOrden } from "@/components/estudios/acciones-estudio";
import { EnviarEstudio } from "@/components/estudios/enviar-estudio";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Doctor = { id: string; nombre: string };
export type PropsMenu = {
  estudioId: string; estado: "POR_ASIGNAR" | "ASIGNADO" | "PUBLICADO"; pacienteId: string | null; ordenId: string | null;
  informeId: string | null; informeEmitido: boolean; superficie: boolean;
  gestion: boolean; clinico: boolean; puedeInformar: boolean; puedeDescargar: boolean;
  doctores: Doctor[]; doctoresEnvio: Doctor[];
};

/** Acciones secundarias del estudio agrupadas en un menú; "Abrir visor" queda como primaria fuera de él. */
export function MenuAccionesEstudio(p: PropsMenu) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<"asignar" | "vincular" | "enviar" | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cerrar = (d: NonNullable<typeof dialogo>) => (o: boolean) => setDialogo(o ? d : null);
  const puedeEnviar = p.clinico && p.estado === "PUBLICADO" && !!p.pacienteId;

  const publicar = () => iniciar(async () => {
    const r = await publicarEstudio(p.estudioId);
    if (r.ok) toast.success("Estudio publicado"); else toast.error(r.error);
  });
  const informar = () => iniciar(async () => {
    const r = await crearInformeDeEstudio(p.estudioId);
    if (r.error || !r.id) toast.error(r.error ?? "No se pudo crear"); else router.push(`/informes/${r.id}`);
  });

  const hayAcciones = p.puedeDescargar || puedeEnviar || p.informeId || p.puedeInformar || p.superficie || (p.gestion && p.estado !== "PUBLICADO") || (p.clinico && p.pacienteId);
  if (!hayAcciones) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="outline" aria-label="Más acciones" disabled={pendiente}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {p.puedeDescargar && (
            // Descarga directa: la ruta valida sesión, centro y rol, y responde con Content-Disposition: attachment.
            <DropdownMenuItem asChild><a href={`/api/estudios/${p.estudioId}/descargar`} download><Download /> Descargar DICOM (zip)</a></DropdownMenuItem>
          )}
          {puedeEnviar && <DropdownMenuItem onSelect={() => setDialogo("enviar")}><Send /> Enviar…</DropdownMenuItem>}
          {p.informeId
            ? <DropdownMenuItem asChild><Link href={`/informes/${p.informeId}`}><FileText /> Ver informe</Link></DropdownMenuItem>
            : p.puedeInformar && <DropdownMenuItem onSelect={informar}><FilePlus /> Informar este estudio</DropdownMenuItem>}
          {p.superficie && <DropdownMenuItem asChild><Link href={`/estudios/${p.estudioId}/superficie`}><Box /> Escaneo facial</Link></DropdownMenuItem>}
          {(p.gestion && p.estado !== "PUBLICADO") || (p.clinico && p.pacienteId) ? <DropdownMenuSeparator /> : null}
          {p.gestion && p.estado !== "PUBLICADO" && <DropdownMenuItem onSelect={() => setDialogo("asignar")}><UserCheck /> Asignar</DropdownMenuItem>}
          {p.gestion && p.estado === "ASIGNADO" && <DropdownMenuItem onSelect={publicar}><Send /> Publicar</DropdownMenuItem>}
          {p.clinico && p.pacienteId && (
            <DropdownMenuItem onSelect={() => setDialogo("vincular")}>{p.ordenId ? <Link2Off /> : <Link2 />} {p.ordenId ? "Cambiar orden" : "Vincular orden"}</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {p.gestion && <AsignarEstudio estudioId={p.estudioId} doctores={p.doctores} abierto={dialogo === "asignar"} onAbierto={cerrar("asignar")} />}
      {p.clinico && p.pacienteId && <VincularOrden estudioId={p.estudioId} pacienteId={p.pacienteId} ordenActualId={p.ordenId} abierto={dialogo === "vincular"} onAbierto={cerrar("vincular")} />}
      {puedeEnviar && <EnviarEstudio estudioId={p.estudioId} tieneInforme={p.informeEmitido} doctores={p.doctoresEnvio} abierto={dialogo === "enviar"} onAbierto={cerrar("enviar")} />}
    </>
  );
}
