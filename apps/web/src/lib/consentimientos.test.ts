// Implementación independiente (sala limpia) a partir de docs/sala-limpia/02-consentimientos-y-proteccion-de-datos.md
import { describe, expect, it } from "vitest";
import { diasRestantes, estadoVigente, fechaLimite, normalizarFinalidad, sumarDiasHabiles, transicionSolicitudValida } from "./consentimientos";

describe("normalizarFinalidad", () => {
  it("unifica variantes", () => {
    expect(normalizarFinalidad("SMS ")).toBe(normalizarFinalidad("sms"));
    expect(normalizarFinalidad("  Contacto   por WhatsApp")).toBe("contacto por whatsapp");
    expect(normalizarFinalidad("   ")).toBe("");
  });
});

describe("estadoVigente", () => {
  it("otorgar, revocar y otorgar deja vigente la última", () => {
    const t = (n: number) => new Date(2026, 0, n);
    const r = [
      { id: "a", finalidad: "x", otorgada: true, creadoEn: t(1) },
      { id: "b", finalidad: "x", otorgada: false, creadoEn: t(2) },
      { id: "c", finalidad: "x", otorgada: true, creadoEn: t(3) },
    ];
    expect(estadoVigente(r).get("x")?.otorgada).toBe(true);
    expect(estadoVigente(r.slice(0, 2)).get("x")?.otorgada).toBe(false);
  });
  it("desempata por id con la misma fecha", () => {
    const f = new Date();
    const r = [{ id: "2", finalidad: "x", otorgada: false, creadoEn: f }, { id: "1", finalidad: "x", otorgada: true, creadoEn: f }];
    expect(estadoVigente(r).get("x")?.id).toBe("2");
  });
});

describe("plazos", () => {
  it("10 días hábiles desde un lunes caen dos semanas después", () => {
    expect(sumarDiasHabiles(new Date("2026-11-16T12:00:00Z"), 10).toISOString().slice(0, 10)).toBe("2026-11-30");
  });
  it("salta fin de semana", () => {
    expect(sumarDiasHabiles(new Date("2026-11-20T12:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-11-23");
  });
  it("consulta 10 y reclamo 15", () => {
    const d = new Date("2026-11-16T12:00:00Z");
    expect(fechaLimite("RECLAMO", d) > fechaLimite("CONSULTA", d)).toBe(true);
  });
  it("días restantes negativos si vencida", () => {
    expect(diasRestantes(new Date("2026-01-01"), new Date("2026-01-05"))).toBeLessThan(0);
  });
});

describe("transiciones de solicitud", () => {
  it("las cerradas no cambian", () => {
    expect(transicionSolicitudValida("COMPLETADA", "RECIBIDA")).toBe(false);
    expect(transicionSolicitudValida("RECIBIDA", "EN_TRAMITE")).toBe(true);
  });
});
