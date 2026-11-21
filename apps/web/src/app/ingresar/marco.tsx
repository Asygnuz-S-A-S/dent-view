import { ScanLine } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Marco común de las pantallas de acceso (código MFA, recuperar contraseña). */
export function MarcoAcceso({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2 font-semibold">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ScanLine className="size-4" />
          </div>
          dent-view
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{titulo}</CardTitle>
            <CardDescription>{descripcion}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}
