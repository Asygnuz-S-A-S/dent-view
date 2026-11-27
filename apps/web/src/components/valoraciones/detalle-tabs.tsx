"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Pestañas del detalle para quien valora. El contenido de cada una llega ya armado desde el servidor. */
export function DetalleTabs({ inicial, conteoMensajes, paciente, responder, mensajes, notas }: {
  inicial: "paciente" | "responder"; conteoMensajes: number; paciente: ReactNode; responder: ReactNode; mensajes: ReactNode; notas: ReactNode;
}) {
  return (
    <Tabs defaultValue={inicial}>
      <TabsList className="h-auto" aria-label="Secciones de la valoración">
        <TabsTrigger value="paciente" className="min-h-9 px-3">Paciente</TabsTrigger>
        <TabsTrigger value="responder" className="min-h-9 px-3">Responder</TabsTrigger>
        <TabsTrigger value="mensajes" className="min-h-9 px-3">Mensajes ({conteoMensajes})</TabsTrigger>
        <TabsTrigger value="notas" className="min-h-9 px-3">Notas internas</TabsTrigger>
      </TabsList>
      <TabsContent value="paciente" className="space-y-6">{paciente}</TabsContent>
      <TabsContent value="responder">{responder}</TabsContent>
      <TabsContent value="mensajes">{mensajes}</TabsContent>
      <TabsContent value="notas">{notas}</TabsContent>
    </Tabs>
  );
}
