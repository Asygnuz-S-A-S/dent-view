import { responderPdfHistoria } from "@/lib/evolucion-exportar";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ pacienteId: string }> }) {
  return responderPdfHistoria((await params).pacienteId);
}
