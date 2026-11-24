declare module "heic-decode" {
  type Imagen = { width: number; height: number; data: Uint8ClampedArray };
  function decode(entrada: { buffer: Uint8Array }): Promise<Imagen>;
  namespace decode {
    /** Lee el contenedor sin decodificar píxeles; hay que llamar a dispose() al terminar. */
    function all(entrada: { buffer: Uint8Array }): Promise<Array<{ width: number; height: number; decode(): Promise<Imagen> }> & { dispose(): void }>;
  }
  export default decode;
}
