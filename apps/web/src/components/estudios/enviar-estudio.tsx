"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { enviarEstudio } from "@/app/(app)/estudios/enviar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Doctor = { id: string; nombre: string };

/** Envío de un estudio a un doctor del centro o a un correo libre, con confirmación explícita de destinatario y contenido. */
export function EnviarEstudio({ estudioId, tieneInforme, doctores, abierto, onAbierto }: { estudioId: string; tieneInforme: boolean; doctores: Doctor[]; abierto: boolean; onAbierto: (o: boolean) => void }) {
  const [tipo, setTipo] = useState<"DOCTOR" | "CORREO">("DOCTOR");
  const [doctorId, setDoctorId] = useState("");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const doctor = doctores.find((d) => d.id === doctorId);
  const listo = tipo === "DOCTOR" ? !!doctor : nombre.trim().length >= 2 && /\S+@\S+\.\S+/.test(correo);
  const destinatario = tipo === "DOCTOR" ? doctor?.nombre : `${nombre.trim()} (${correo.trim()})`;

  function cambiar(o: boolean) {
    onAbierto(o);
    if (!o) { setConfirmando(false); setDoctorId(""); setNombre(""); setCorreo(""); }
  }

  function enviar() {
    iniciar(async () => {
      const r = await enviarEstudio({ estudioId, destino: tipo === "DOCTOR" ? { tipo, doctorId } : { tipo, nombre, correo } });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.yaEnviado ? "Ya se había enviado hace unos minutos" : r.enviado ? "Estudio enviado" : "Enviado, pero el correo quedó omitido");
      cambiar(false);
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={cambiar}>
      <DialogContent>
        {confirmando ? (
          <>
            <DialogHeader>
              <DialogTitle>Confirmar envío</DialogTitle>
              <DialogDescription>Se enviará un enlace seguro con código de acceso por correo. Revisa antes de continuar.</DialogDescription>
            </DialogHeader>
            <dl className="grid gap-2 text-sm">
              <div><dt className="text-muted-foreground">Destinatario</dt><dd className="font-medium">{destinatario}</dd></div>
              <div><dt className="text-muted-foreground">Se comparte</dt><dd className="font-medium">El estudio (imágenes){tieneInforme ? " y su informe emitido" : ""}</dd></div>
              <div><dt className="text-muted-foreground">Vigencia</dt><dd className="font-medium">7 días</dd></div>
            </dl>
            <DialogFooter>
              <Button variant="outline" disabled={pendiente} onClick={() => setConfirmando(false)}>Volver</Button>
              <Button disabled={pendiente} onClick={enviar}>{pendiente ? "Enviando…" : "Confirmar y enviar"}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Enviar estudio</DialogTitle>
              <DialogDescription>Comparte el estudio con un doctor del centro o con un correo.</DialogDescription>
            </DialogHeader>
            <Tabs value={tipo} onValueChange={(v) => setTipo(v as "DOCTOR" | "CORREO")}>
              <TabsList>
                <TabsTrigger value="DOCTOR">Doctor del centro</TabsTrigger>
                <TabsTrigger value="CORREO">Otro correo</TabsTrigger>
              </TabsList>
            </Tabs>
            {tipo === "DOCTOR" ? (
              <div className="grid gap-2">
                <Label htmlFor={`envio-doctor-${estudioId}`}>Doctor remitente</Label>
                <Select value={doctorId} onValueChange={setDoctorId}>
                  <SelectTrigger id={`envio-doctor-${estudioId}`} className="w-full"><SelectValue placeholder={doctores.length ? "Elige un doctor" : "No hay doctores en el centro"} /></SelectTrigger>
                  <SelectContent>{doctores.map((d) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor={`envio-nombre-${estudioId}`}>Nombre del destinatario</Label>
                  <Input id={`envio-nombre-${estudioId}`} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`envio-correo-${estudioId}`}>Correo</Label>
                  <Input id={`envio-correo-${estudioId}`} type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="off" />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button disabled={!listo} onClick={() => setConfirmando(true)}>Continuar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
