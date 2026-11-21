import { describe, expect, it } from "vitest";
import { filtrarHoja, leerTiposHoja, ordenarHoja, type EntradaHoja } from "./pacientes-hoja";

const e = (id: string, tipo: EntradaHoja["tipo"], f: string): EntradaHoja => ({ id, tipo, fecha: new Date(f), titulo: id });

describe("hoja de vida", () => {
  const xs = [e("a", "orden", "2026-01-01"), e("c", "pago", "2026-03-01"), e("b", "estudio", "2026-03-01")];
  it("ordena del más reciente al más antiguo, estable por id", () => expect(ordenarHoja(xs).map((x) => x.id)).toEqual(["b", "c", "a"]));
  it("filtra por tipo y sin tipos devuelve todo", () => {
    expect(filtrarHoja(xs, ["pago"]).map((x) => x.id)).toEqual(["c"]);
    expect(filtrarHoja(xs, [])).toHaveLength(3);
  });
  it("ignora tipos desconocidos del parámetro", () => expect(leerTiposHoja("orden,xx,pago")).toEqual(["orden", "pago"]));
});
