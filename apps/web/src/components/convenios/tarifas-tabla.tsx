"use client";

import { Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarTarifa } from "@/app/(app)/convenios/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cop, precioFinal, type TarifaEspecial } from "@/lib/precios";
import { EstadoVacio } from "@/components/comunes/estado-vacio";

export type ServicioTarifa = { id: string; nombre: string; precioImpreso: number | null; precioDigital: number | null; descuento: number };

/** Edición en línea de tarifas especiales por servicio para un convenio o un doctor remitente. Vacío = usa el catálogo. */
export function TarifasTabla({
  destino, servicios, tarifas,
}: {
  destino: { convenioId: string } | { doctorId: string };
  servicios: ServicioTarifa[];
  tarifas: Record<string, TarifaEspecial>;
}) {
  if (servicios.length === 0) return <EstadoVacio titulo="No hay servicios activos en el catálogo" />;
  return (
    <Card className="py-0">
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Servicio</TableHead>
              <TableHead className="text-right">Catálogo (impreso / digital)</TableHead>
              <TableHead className="w-40">Tarifa impresa</TableHead>
              <TableHead className="w-40">Tarifa digital</TableHead>
              <TableHead className="w-28 pr-6"><span className="sr-only">Guardar</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servicios.map((s) => (
              <Fila key={s.id} destino={destino} servicio={s} inicial={tarifas[s.id]} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const texto = (n: number | null | undefined) => (n == null ? "" : String(n));
const dinero = (n: number | null) => (n === null ? "—" : cop(n));

function Fila({ destino, servicio: s, inicial }: { destino: { convenioId: string } | { doctorId: string }; servicio: ServicioTarifa; inicial?: TarifaEspecial }) {
  const [impreso, setImpreso] = useState(texto(inicial?.precioImpreso));
  const [digital, setDigital] = useState(texto(inicial?.precioDigital));
  const [guardado, setGuardado] = useState({ impreso: texto(inicial?.precioImpreso), digital: texto(inicial?.precioDigital) });
  const [pendiente, iniciar] = useTransition();
  const sucio = impreso !== guardado.impreso || digital !== guardado.digital;

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarTarifa({ ...destino, servicioId: s.id, precioImpreso: impreso, precioDigital: digital });
      if (r.error) return void toast.error(r.error);
      setGuardado({ impreso, digital });
      toast.success(`Tarifa de ${s.nombre} guardada`);
    });

  return (
    <TableRow>
      <TableCell className="pl-6 font-medium">{s.nombre}</TableCell>
      <TableCell className="text-right text-muted-foreground">{dinero(precioFinal(s, "IMPRESA"))} / {dinero(precioFinal(s, "DIGITAL"))}</TableCell>
      {[
        { nombre: "impresa", valor: impreso, set: setImpreso },
        { nombre: "digital", valor: digital, set: setDigital },
      ].map(({ nombre, valor, set }) => (
        <TableCell key={nombre}>
          <Input
            type="number" min={0} step={1000} inputMode="numeric" placeholder="Catálogo"
            aria-label={`Tarifa ${nombre} de ${s.nombre} en COP`}
            value={valor} onChange={(e) => set(e.target.value)}
          />
        </TableCell>
      ))}
      <TableCell className="pr-6 text-right">
        <Button size="sm" variant={sucio ? "default" : "ghost"} disabled={!sucio || pendiente} onClick={guardar}>
          {pendiente ? <Loader2 className="animate-spin" /> : !sucio && (inicial || guardado.impreso || guardado.digital) ? <Check /> : null} Guardar
        </Button>
      </TableCell>
    </TableRow>
  );
}
