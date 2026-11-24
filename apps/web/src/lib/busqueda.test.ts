import { describe, expect, it } from "vitest";
import { patronNombre } from "./busqueda";

describe("patronNombre", () => {
  it("quita tildes y la eñe", () => expect(patronNombre("María Peña Gómez")).toBe("%Maria Pena Gomez%"));
  it("escapa los comodines de LIKE para buscarlos como texto", () => expect(patronNombre("100%_a\\b")).toBe("%100\\%\\_a\\\\b%"));
  it("deja apóstrofes y emojis tal cual", () => expect(patronNombre("O'Brien 😀")).toBe("%O'Brien 😀%"));
});
