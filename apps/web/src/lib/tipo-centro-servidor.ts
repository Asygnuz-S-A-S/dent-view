import { prisma } from "@dent-view/db";
import { cache } from "react";
import { esTipoCentro, TIPO_POR_DEFECTO, type TipoCentro } from "./tipo-centro";

/** Tipo del centro; sin fila de ConfigCentro se trata como centro radiológico. Una consulta por request. */
export const tipoDeCentro = cache(async (organizationId: string): Promise<TipoCentro> => {
  const c = await prisma.configCentro.findUnique({ where: { organizationId }, select: { tipoCentro: true } });
  return esTipoCentro(c?.tipoCentro) ? c.tipoCentro : TIPO_POR_DEFECTO;
});
