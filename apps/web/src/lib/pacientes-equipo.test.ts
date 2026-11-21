import { describe, expect, it } from "vitest";
import { derivarEquipo } from "./pacientes-equipo";

describe("derivarEquipo", () => {
  it("agrupa por doctor con fechas, servicios y estudios; ignora lo sin doctor", () => {
    const r = derivarEquipo(
      [
        { doctorRemitenteId: "a", creadoEn: new Date("2026-03-01"), items: [{ nombre: "Panorámica" }] },
        { doctorRemitenteId: "a", creadoEn: new Date("2026-01-01"), items: [{ nombre: "Panorámica" }, { nombre: "Cefalometría" }] },
        { doctorRemitenteId: "b", creadoEn: new Date("2026-02-01"), items: [] },
        { doctorRemitenteId: null, creadoEn: new Date("2026-02-01"), items: [{ nombre: "X" }] },
      ],
      [{ doctorRemitenteId: "a" }, { doctorRemitenteId: "c" }, { doctorRemitenteId: null }],
    );
    expect(r.map((x) => x.doctorId)).toEqual(["a", "b", "c"]);
    expect(r[0]).toMatchObject({ ordenes: 2, estudios: 1, servicios: ["Panorámica", "Cefalometría"] });
    expect(r[0].primera).toEqual(new Date("2026-01-01"));
    expect(r[0].ultima).toEqual(new Date("2026-03-01"));
    expect(r[2]).toMatchObject({ ordenes: 0, estudios: 1, primera: null });
  });
});
