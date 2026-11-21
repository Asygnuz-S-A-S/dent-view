"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { cambiarRol, quitarUsuario } from "@/app/(app)/usuarios/actions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLES_USUARIO } from "./roles";

export function AccionesUsuario({ memberId, nombre, rol }: { memberId: string; nombre: string; rol: string }) {
  const [pendiente, iniciar] = useTransition();
  const avisar = (r: { ok: boolean; error?: string }, ok: string) => {
    if (r.ok) toast.success(ok);
    else toast.error(r.error ?? "No se pudo completar");
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={rol}
        disabled={pendiente}
        onValueChange={(v) => iniciar(async () => avisar(await cambiarRol(memberId, v), "Rol actualizado"))}
      >
        <SelectTrigger size="sm" className="w-36" aria-label={`Rol de ${nombre}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          {ROLES_USUARIO.map((r) => <SelectItem key={r.valor} value={r.valor}>{r.etiqueta}</SelectItem>)}
        </SelectContent>
      </Select>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`Quitar a ${nombre}`} disabled={pendiente}><Trash2 /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar a {nombre} del centro?</AlertDialogTitle>
            <AlertDialogDescription>Perderá el acceso a este centro. Su cuenta no se elimina.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => iniciar(async () => avisar(await quitarUsuario(memberId), "Usuario quitado"))}>
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
