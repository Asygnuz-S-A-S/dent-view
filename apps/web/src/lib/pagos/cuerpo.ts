/** Lee el cuerpo crudo (necesario para verificar firmas) cortando al pasar el tope: no se confía en Content-Length. null = demasiado grande. */
export async function leerCuerpoAcotado(req: Request, max = 256 * 1024): Promise<string | null> {
  if (!req.body) return "";
  const lector = req.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel().catch(() => {});
      return null;
    }
    trozos.push(value);
  }
  return Buffer.concat(trozos).toString("utf8");
}
