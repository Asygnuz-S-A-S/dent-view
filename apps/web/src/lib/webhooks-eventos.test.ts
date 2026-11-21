import { describe, expect, it } from "vitest";
import { aEventoPublico, armarPayload, EVENTOS_PUBLICOS, GRUPOS_EVENTOS } from "./webhooks-eventos";

describe("catálogo de eventos públicos", () => {
  it("traduce los tipos internos a nombres públicos con datos mínimos", () => {
    expect(aEventoPublico("orden.estado", { ordenId: "o1", orden: "ORD-1", de: "AGENDADA", a: "TOMADA", origen: "x" })).toEqual({
      evento: "orden.estado_cambiado", datos: { ordenId: "o1", estadoAnterior: "AGENDADA", estado: "TOMADA" },
    });
    expect(aEventoPublico("cita.estado", { citaId: "c1", de: "PROGRAMADA", a: "LLEGO" })?.evento).toBe("cita.estado_cambiado");
    expect(aEventoPublico("factura.pago", { facturaId: "f", valor: 5, medio: "EFECTIVO", estado: "PAGADA", factura: "F-1", nota: "x" })?.datos)
      .toEqual({ facturaId: "f", valor: 5, medio: "EFECTIVO", estado: "PAGADA" });
  });
  it("no filtra campos fuera de la lista blanca (enlaces, códigos, motivos)", () => {
    const r = aEventoPublico("resultados.entregados", { enlaceId: "e", informeId: "i", estudios: 2, vence: "x", enviado: true });
    expect(r?.datos).toEqual({ informeId: "i", estudios: 2 });
    expect(aEventoPublico("informe.emitido", { informeId: "i", version: 1, codigo: "SECRETO" })?.datos).toEqual({ informeId: "i", version: 1 });
  });
  it("ignora tipos internos no públicos y nombres heredados de Object", () => {
    for (const t of ["nota.creada", "historia.antecedentes", "constructor", "toString", "integracion.webhook_creado"]) expect(aEventoPublico(t)).toBeNull();
  });
  it("los grupos de la UI cubren todos los eventos salvo la prueba", () => {
    expect(GRUPOS_EVENTOS.flatMap((g) => g.eventos).sort()).toEqual(EVENTOS_PUBLICOS.filter((e) => e !== "webhook.prueba").sort());
  });
  it("el payload es versionado y solo agrega tipo y número de documento del paciente", () => {
    const p = armarPayload({
      id: "x", evento: "orden.creada", creadoEn: new Date("2026-01-01T00:00:00Z"), centro: { id: "c", slug: "s" }, datos: { ordenId: "o" },
      paciente: { id: "p", tipoDocumento: "CC", numeroDocumento: "123" },
    });
    expect(p).toEqual({
      id: "x", evento: "orden.creada", version: 1, creadoEn: "2026-01-01T00:00:00.000Z", centro: { id: "c", slug: "s" },
      datos: { ordenId: "o", pacienteId: "p", paciente: { tipoDocumento: "CC", numeroDocumento: "123" } },
    });
  });
});
