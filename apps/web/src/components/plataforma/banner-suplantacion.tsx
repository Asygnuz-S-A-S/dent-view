"use client";

import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function BannerSuplantacion({ centro }: { centro: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  return (
    <div role="status" className="sticky top-0 z-30 flex flex-wrap items-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
      <ShieldAlert className="size-4 shrink-0" />
      <span className="flex-1">Estás dentro de {centro} como superadmin</span>
      <Button
        size="sm"
        variant="secondary"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            await authClient.admin.stopImpersonating();
            router.push("/plataforma");
            router.refresh();
          })
        }
      >
        Volver a la plataforma
      </Button>
    </div>
  );
}
