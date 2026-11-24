// Paginación simple por URL (?pagina=N) para las listas del centro. Lógica pura.
export const TAM_PAGINA = 50;

/** `pagina` viene de la URL (texto libre): se acota a 1..paginas, así una página inexistente nunca da una lista vacía. */
export function calcularPagina(paginaParam: string | string[] | undefined, total: number, tam = TAM_PAGINA) {
  const bruto = Number(Array.isArray(paginaParam) ? paginaParam[0] : paginaParam);
  const paginas = Math.max(1, Math.ceil(total / tam));
  const pagina = Number.isInteger(bruto) && bruto >= 1 ? Math.min(bruto, paginas) : 1;
  const desde = total === 0 ? 0 : (pagina - 1) * tam + 1;
  return { pagina, paginas, skip: (pagina - 1) * tam, take: tam, desde, hasta: Math.min(total, pagina * tam) };
}
