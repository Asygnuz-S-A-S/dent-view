import { versionApp } from "@/lib/version";

export const dynamic = "force-dynamic";

/** Pública y mínima (versión y commit corto): el despliegue la usa para comprobar que producción sirve el commit esperado. */
export function GET() {
  return Response.json(versionApp(), { headers: { "Cache-Control": "no-store" } });
}
