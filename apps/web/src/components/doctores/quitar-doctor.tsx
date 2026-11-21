"use client";

import { UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { quitarDoctor } from "@/app/(app)/doctores/actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function QuitarDoctor({ userId, nombre }: { userId: string; nombre: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm"><UserMinus /> Quitar del centro</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Quitar a {nombre} del centro?</AlertDialogTitle>
          <AlertDialogDescription>
            Perderá el acceso a este centro. Su cuenta, sus órdenes y sus estudios se conservan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pendiente}
            onClick={(e) => {
              e.preventDefault();
              iniciar(async () => {
                const r = await quitarDoctor(userId);
                if (r.error) {
                  toast.error(r.error);
                  return;
                }
                toast.success("Doctor quitado del centro");
                router.push("/doctores");
              });
            }}
          >
            Quitar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
