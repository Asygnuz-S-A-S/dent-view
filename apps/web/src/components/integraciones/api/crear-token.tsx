"use client";

import { CalendarIcon, Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { es } from "react-day-picker/locale";
import { toast } from "sonner";
import { crearToken } from "@/app/(app)/integraciones/api/actions";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PERMISOS, SOLO_LECTURA, type Permiso } from "@/lib/api-token";
import { fechaCorta } from "@/lib/fechas";

const GRUPOS: { etiqueta: string; permisos: Permiso[] }[] = [
  { etiqueta: "Pacientes", permisos: ["pacientes:leer", "pacientes:escribir"] },
  { etiqueta: "Órdenes", permisos: ["ordenes:leer", "ordenes:escribir"] },
  { etiqueta: "Citas y salas", permisos: ["citas:leer", "citas:escribir"] },
  { etiqueta: "Estudios e informes", permisos: ["estudios:leer", "informes:leer"] },
  { etiqueta: "Catálogo y doctores", permisos: ["catalogo:leer", "doctores:leer"] },
  { etiqueta: "Servidor MCP (token aparte, solo lectura)", permisos: ["mcp", "pii"] },
];
const ETIQUETA: Partial<Record<Permiso, string>> = {
  "pacientes:leer": "Leer", "pacientes:escribir": "Escribir", "ordenes:leer": "Leer", "ordenes:escribir": "Escribir", "citas:leer": "Leer", "citas:escribir": "Escribir",
  "estudios:leer": "Estudios", "informes:leer": "Informes", "catalogo:leer": "Catálogo", "doctores:leer": "Doctores", mcp: "Token para el servidor MCP", pii: "Datos sin enmascarar",
};

const aTexto = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function CrearToken() {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState("");
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [vence, setVence] = useState<Date | undefined>();
  const [creado, setCreado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  function cambiar(o: boolean) {
    setAbierto(o);
    if (!o) {
      setNombre(""); setPermisos([]); setVence(undefined); setCreado(null); setCopiado(false);
    }
  }
  const esMcp = permisos.includes("mcp");
  const alternar = (p: Permiso, on: boolean) =>
    setPermisos((l) => {
      if (!on) return l.filter((x) => x !== p && !(p === "mcp" && x === "pii"));
      // Un token MCP es de solo lectura: al marcarlo se quitan los permisos de escritura.
      return p === "mcp" ? [...l.filter((x) => !x.endsWith(":escribir")), p] : [...l, p];
    });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await crearToken({ nombre, permisos, vence: vence ? aTexto(vence) : "" });
      if ("error" in r) return void toast.error(r.error);
      setCreado(r.token);
    });
  }

  async function copiar() {
    if (!creado) return;
    try {
      await navigator.clipboard.writeText(creado);
      setCopiado(true);
    } catch {
      toast.error("No se pudo copiar; selecciónalo y cópialo a mano");
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={cambiar}>
      <DialogTrigger asChild>
        <Button><KeyRound /> Crear token</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{creado ? "Copia tu token ahora" : "Crear token de API"}</DialogTitle>
          <DialogDescription>{creado ? "Es la única vez que se muestra completo." : "Da acceso solo a este centro y solo a los permisos que elijas."}</DialogDescription>
        </DialogHeader>
        {creado ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>Guárdalo en un gestor de secretos. No podrás verlo de nuevo: si lo pierdes, revoca este token y crea otro.</p>
            </div>
            <div className="flex gap-2">
              <Input readOnly value={creado} aria-label="Token de API" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={copiar} aria-label="Copiar token">{copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar"}</Button>
            </div>
            <DialogFooter><Button onClick={() => cambiar(false)}>Listo</Button></DialogFooter>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={enviar}>
            <div className="grid gap-2">
              <Label htmlFor="token-nombre">Nombre</Label>
              <Input id="token-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Integración con el sistema de gestión" maxLength={80} required />
            </div>
            <fieldset className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <legend className="text-sm font-medium">Permisos</legend>
                <Button type="button" size="sm" variant="outline" onClick={() => setPermisos(SOLO_LECTURA)}>Solo lectura</Button>
              </div>
              {GRUPOS.map((g) => (
                <div key={g.etiqueta} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <span className="text-sm">{g.etiqueta}</span>
                  <div className="flex gap-4">
                    {g.permisos.map((p) => (
                      <label key={p} className="flex items-center gap-2 text-sm" title={PERMISOS[p]}>
                        <Checkbox checked={permisos.includes(p)} disabled={(p === "pii" && !esMcp) || (esMcp && p.endsWith(":escribir"))} onCheckedChange={(v) => alternar(p, v === true)} />
                        {ETIQUETA[p]}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
            <div className="grid gap-2">
              <Label>Vencimiento (opcional)</Label>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="justify-start font-normal"><CalendarIcon /> {vence ? fechaCorta(vence) : "Sin vencimiento"}</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" locale={es} selected={vence} onSelect={setVence} disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }} />
                  </PopoverContent>
                </Popover>
                {vence && <Button type="button" variant="ghost" size="sm" onClick={() => setVence(undefined)}>Quitar</Button>}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pendiente || !permisos.length}>{pendiente ? "Creando…" : "Crear token"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
