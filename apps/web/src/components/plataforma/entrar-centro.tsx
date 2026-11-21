"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { prepararEntrada } from "@/app/(app)/plataforma/actions";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function EntrarCentro({ organizationId, nombre }: { organizationId: string; nombre: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pendiente}
      aria-label={`Entrar a ${nombre}`}
      onClick={() =>
        iniciar(async () => {
          const r = await prepararEntrada(organizationId);
          if ("error" in r) return void toast.error(r.error);
          const { error } = await authClient.admin.impersonateUser({ userId: r.userId });
          if (error) return void toast.error(error.message ?? "No se pudo entrar al centro");
          await authClient.organization.setActive({ organizationId });
          router.push("/inicio");
          router.refresh();
        })
      }
    >
      <LogIn /> Entrar al centro
    </Button>
  );
}
