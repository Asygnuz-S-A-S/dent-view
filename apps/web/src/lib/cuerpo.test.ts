import { describe, expect, it } from "vitest";
import { cuerpoExcede } from "./cuerpo";

const req = (h?: string) => new Request("http://x/", { method: "POST", headers: h === undefined ? {} : { "content-length": h } });

describe("cuerpoExcede", () => {
  it("acepta hasta el tope", () => { expect(cuerpoExcede(req("1000"), 1000)).toBe(false); });
  it("rechaza por encima del tope", () => { expect(cuerpoExcede(req("1001"), 1000)).toBe(true); });
  it("rechaza si falta o no es numérico", () => {
    expect(cuerpoExcede(req(), 1000)).toBe(true);
    expect(cuerpoExcede(req("abc"), 1000)).toBe(true);
  });
});
