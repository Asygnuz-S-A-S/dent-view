import { describe, expect, it } from "vitest";
import { coincideFiltro, embudo, enlaceWhatsapp, leerFiltro, numeroWhatsapp, parsearCsvLeads, PLANTILLAS_SECUENCIA, segmentosDe, textoDuracion, tiempoMedioRespuestaHoras } from "./crm";

describe("WhatsApp manual", () => {
  it("normaliza celulares colombianos", () => {
    expect(numeroWhatsapp("300 123 4567")).toBe("573001234567");
    expect(numeroWhatsapp("+57 (300) 123-4567")).toBe("573001234567");
    expect(numeroWhatsapp("123")).toBeNull();
    expect(numeroWhatsapp(null)).toBeNull();
  });
  it("arma el enlace con el mensaje codificado", () => {
    expect(enlaceWhatsapp("3001234567", "Hola Ana & cía")).toBe("https://wa.me/573001234567?text=Hola%20Ana%20%26%20c%C3%ADa");
    expect(enlaceWhatsapp("x", "hola")).toBeNull();
  });
});

describe("importación CSV", () => {
  it("valida cada fila y reporta errores", () => {
    const r = parsearCsvLeads('Nombre,Teléfono,Correo,Origen\nAna Pérez,300 123 4567,ANA@x.co,web\n"López, Juan",,juan@x.co,referido\nSin contacto,,,\nMal Correo,,no-es-correo,\nOrigen Raro,3001234567,,marte\nAna Pérez,,ana@x.co,\n');
    expect(r.validos.map((v) => [v.nombre, v.correo, v.origen])).toEqual([["Ana Pérez", "ana@x.co", "WEB"], ["López, Juan", "juan@x.co", "REFERIDO"]]);
    expect(r.errores.map((e) => e.fila)).toEqual([4, 5, 6, 7]);
    expect(r.errores[3]!.motivo).toMatch(/Repetido/);
  });
  it("acepta punto y coma y rechaza sin encabezado de nombre", () => {
    expect(parsearCsvLeads("nombre;celular\nAna;3001234567").validos).toHaveLength(1);
    expect(parsearCsvLeads("a,b\n1,2").errores[0]!.motivo).toMatch(/nombre/);
  });
  it("topa el número de filas", () => {
    const csv = "nombre,correo\n" + Array.from({ length: 6 }, (_, i) => `N${i}x,n${i}@x.co`).join("\n");
    expect(parsearCsvLeads(csv, 5).errores[0]!.motivo).toMatch(/Máximo 5/);
  });
});

describe("filtro de secuencia", () => {
  it("lee solo campos válidos y enlaces http(s)", () => {
    expect(leerFiltro({ origen: "WEB", enlace: "javascript:alert(1)", x: 1 })).toEqual({ origen: "WEB" });
    expect(leerFiltro({ enlace: "https://g.page/r/abc", transaccional: true })).toEqual({ enlace: "https://g.page/r/abc", transaccional: true });
    expect(leerFiltro(null)).toEqual({});
  });
  it("origen exacto e interés contiene", () => {
    expect(coincideFiltro({ origen: "WEB", interes: "orto" }, { origen: "WEB", interes: "Ortodoncia" })).toBe(true);
    expect(coincideFiltro({ origen: "WEB" }, { origen: "REDES", interes: null })).toBe(false);
    expect(coincideFiltro({ interes: "x" }, { origen: "WEB", interes: null })).toBe(false);
  });
});

describe("indicadores", () => {
  it("embudo acumulado con conversión entre etapas", () => {
    const e = embudo({ NUEVO: 4, CONTACTADO: 3, VALORACION_AGENDADA: 1, GANADO: 2, PERDIDO: 5 });
    expect(e.map((x) => x.llegaron)).toEqual([15, 6, 3, 2, 2]);
    expect(e[1]!.conversion).toBe(40);
    expect(e[0]!.conversion).toBeNull();
  });
  it("tiempo medio de respuesta", () => {
    const c = new Date("2026-11-01T10:00:00Z");
    expect(tiempoMedioRespuestaHoras([{ creado: c, primerContacto: new Date("2026-11-01T12:00:00Z") }, { creado: c, primerContacto: new Date("2026-11-01T16:00:00Z") }])).toBe(4);
    expect(tiempoMedioRespuestaHoras([])).toBeNull();
    expect(textoDuracion(0.5)).toBe("30 min");
    expect(textoDuracion(72)).toBe("3 días");
  });
  it("segmentos de fidelización", () => {
    const ahora = new Date("2026-11-23T12:00:00Z");
    const hace = (d: number) => new Date(ahora.getTime() - d * 86_400_000);
    expect(segmentosDe({ ultimaVisitaEn: hace(10), creadoEn: hace(400), gasto12m: 0, visitas12m: 1 }, ahora)).toEqual(["ACTIVO"]);
    expect(segmentosDe({ ultimaVisitaEn: hace(120), creadoEn: hace(400), gasto12m: 3_000_000, visitas12m: 1 }, ahora)).toEqual(["EN_RIESGO", "VIP"]);
    expect(segmentosDe({ ultimaVisitaEn: hace(300), creadoEn: hace(400), gasto12m: 0, visitas12m: 0 }, ahora)).toEqual(["INACTIVO"]);
    expect(segmentosDe({ ultimaVisitaEn: null, creadoEn: hace(5), gasto12m: 0, visitas12m: 0 }, ahora)).toEqual(["NUEVO"]);
  });
});

describe("plantillas predefinidas", () => {
  it("son coherentes: pasos válidos, sin PHI y solo variables conocidas", () => {
    for (const p of PLANTILLAS_SECUENCIA) {
      expect(p.pasos.length).toBeGreaterThan(0);
      for (const s of p.pasos) {
        for (const v of `${s.asunto ?? ""} ${s.cuerpo ?? ""}`.matchAll(/\{\{(\w+)\}\}/g)) expect(["nombre", "centro", "enlace"]).toContain(v[1]);
        if (s.accion === "CORREO") expect(s.asunto && s.cuerpo).toBeTruthy();
        expect(`${s.asunto} ${s.cuerpo}`).not.toMatch(/diagn|caries|endodoncia|ortodoncia|implante|cirug/i);
      }
    }
    expect(PLANTILLAS_SECUENCIA.find((p) => p.disparador === "VALORACION_COMPLETADA")?.filtro?.transaccional).toBe(true);
    expect(new Set(PLANTILLAS_SECUENCIA.map((p) => p.clave)).size).toBe(PLANTILLAS_SECUENCIA.length);
  });
});
