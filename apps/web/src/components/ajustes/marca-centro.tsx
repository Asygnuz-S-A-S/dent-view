"use client";

import { Check, House, ImageUp, RotateCcw, ScanLine, TriangleAlert, X } from "lucide-react";
import { useState, useTransition, type CSSProperties } from "react";
import { toast } from "sonner";
import { guardarMarca } from "@/app/(app)/ajustes/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizarHex, temaMarca } from "@/lib/marca";

type Props = { nombreOrg: string; inicial: { nombre: string; logo: string | null; color: string } };
const PREDETERMINADO = "#0e6b8a";
const razon = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })}:1`;

export function MarcaCentro({ nombreOrg, inicial }: Props) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [logo, setLogo] = useState(inicial.logo);
  const [hexTexto, setHexTexto] = useState(inicial.color);
  const [pendiente, iniciar] = useTransition();
  const color = normalizarHex(hexTexto); // null = sin color propio (usa el de dent-view)
  const tema = color ? temaMarca(color) : null;
  const colorInvalido = hexTexto.trim() !== "" && !color;
  const nombreVisible = nombre.trim() || nombreOrg;
  // La vista previa sigue el modo activo: ambas paletas viajan como variables y `dark:` elige (en oscuro el primario se aclara).
  const vistaPrevia = (tema
    ? { "--pc": tema.claro.primario, "--tc": tema.claro.texto, "--po": tema.oscuro.primario, "--to": tema.oscuro.texto }
    : {}) as CSSProperties;
  const claseVistaPrevia = tema ? "[--primary:var(--pc)] [--primary-foreground:var(--tc)] [--sidebar-primary:var(--pc)] [--sidebar-primary-foreground:var(--tc)] dark:[--primary:var(--po)] dark:[--primary-foreground:var(--to)] dark:[--sidebar-primary:var(--po)] dark:[--sidebar-primary-foreground:var(--to)]" : "";

  function elegirLogo(f: File | undefined) {
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type)) return void toast.error("El logo debe ser PNG o JPEG");
    if (f.size > 150_000) return void toast.error("El logo debe pesar menos de 150 KB");
    const lector = new FileReader();
    lector.onload = () => setLogo(String(lector.result));
    lector.readAsDataURL(f);
  }

  const guardar = () => iniciar(async () => {
    const r = await guardarMarca({ nombre, color: color ?? "", logo: logo === inicial.logo ? undefined : logo });
    if (r?.error) return void toast.error(r.error);
    toast.success("Marca guardada");
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Marca del centro</CardTitle>
        <CardDescription>Nombre, logo y color que ven tu equipo y tus pacientes en la aplicación y en la página de resultados.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid content-start gap-6">
          <div className="grid gap-2">
            <Label htmlFor="marca-nombre">Nombre comercial</Label>
            <Input id="marca-nombre" value={nombre} maxLength={120} placeholder={nombreOrg} onChange={(e) => setNombre(e.target.value)} />
            <p className="text-xs text-muted-foreground">Si lo dejas vacío se usa «{nombreOrg}». También aparece en el membrete de los informes.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="marca-logo">Logo</Label>
            <div className="flex items-center gap-3">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
                {/* eslint-disable-next-line @next/next/no-img-element -- logo del centro como data URL */}
                {logo ? <img src={logo} alt="" className="size-full object-contain p-1" /> : <ImageUp className="size-5 text-muted-foreground" aria-hidden />}
              </div>
              <div className="grid min-w-0 flex-1 gap-1.5">
                <Input id="marca-logo" type="file" accept="image/png,image/jpeg" onChange={(e) => elegirLogo(e.target.files?.[0])} />
                <p className="text-xs text-muted-foreground">PNG o JPEG de hasta 150 KB, idealmente cuadrado.</p>
              </div>
              {logo && <Button type="button" size="icon" variant="ghost" aria-label="Quitar logo" onClick={() => setLogo(null)}><X /></Button>}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="marca-hex">Color principal</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Elegir color principal"
                value={color ?? PREDETERMINADO}
                onChange={(e) => setHexTexto(e.target.value)}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
              />
              <Input
                id="marca-hex"
                value={hexTexto}
                placeholder="Predeterminado de dent-view"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={colorInvalido}
                aria-describedby="marca-hex-ayuda"
                onChange={(e) => setHexTexto(e.target.value)}
                className="max-w-48 font-mono"
              />
              {hexTexto && <Button type="button" variant="ghost" size="sm" onClick={() => setHexTexto("")}><RotateCcw /> Restablecer</Button>}
            </div>
            <div id="marca-hex-ayuda" aria-live="polite" className="text-xs text-muted-foreground">
              {colorInvalido ? (
                <span className="text-destructive">Escribe un color hex de 6 dígitos, por ejemplo #0e6b8a.</span>
              ) : tema ? (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1"><Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />Texto sobre el color {razon(tema.contrasteTexto)} (cumple AA)</span>
                  <span>Texto en {tema.claro.texto === "#ffffff" ? "blanco" : "oscuro"}, elegido automáticamente.</span>
                </span>
              ) : (
                "Sin color propio se usa el azul de dent-view."
              )}
            </div>
            {tema?.aviso && (
              <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-2.5 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />{tema.aviso} (contraste con el fondo {razon(tema.contrasteFondo)}).
              </p>
            )}
          </div>
        </div>

        <figure className={`grid content-start gap-2 ${claseVistaPrevia}`} style={vistaPrevia}>
          <figcaption className="text-xs font-medium text-muted-foreground">Vista previa</figcaption>
          <div className="overflow-hidden rounded-xl border bg-background">
            <div className="flex">
              <div className="w-40 shrink-0 space-y-1 border-r bg-sidebar p-2 text-sidebar-foreground">
                <div className="flex items-center gap-2 p-1">
                  <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                    {/* eslint-disable-next-line @next/next/no-img-element -- logo del centro como data URL */}
                    {logo ? <img src={logo} alt="" className="size-full bg-white object-contain" /> : <span className="text-xs font-semibold">{nombreVisible.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <span className="truncate text-xs font-semibold">{nombreVisible}</span>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-sidebar-accent px-2 py-1.5 text-xs font-medium"><House className="size-3.5 text-sidebar-primary" aria-hidden />Inicio</div>
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground"><ScanLine className="size-3.5" aria-hidden />Estudios</div>
              </div>
              <div className="min-w-0 flex-1 space-y-3 p-3">
                <p className="text-sm font-semibold">Orden #0001</p>
                <Badge>Informada</Badge>
                <Button size="sm" className="w-full" tabIndex={-1} aria-hidden>Abrir visor</Button>
                <p className="text-xs text-primary underline underline-offset-4">Ver informe</p>
              </div>
            </div>
          </div>
        </figure>
      </CardContent>
      <CardFooter className="justify-end border-t">
        <Button disabled={pendiente || colorInvalido} onClick={guardar}>{pendiente ? "Guardando…" : "Guardar marca"}</Button>
      </CardFooter>
    </Card>
  );
}
