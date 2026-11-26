import { describe, expect, it } from "vitest";
import {
  CAMPOS_ESTANDAR, componerContenido, esquemaAdenda, esquemaBorrador, esquemaCamposPlantilla, esquemaDiagnostico, esquemaToma, PLANTILLAS_BASE,
  puedeFirmar, puedeLeerEvolucion, textoAdenda, tieneContenido,
} from "./evolucion";
import { hashAdenda, hashEvolucion, jsonCanonico, sha256, type ContenidoFirmado } from "./evolucion-hash";

const base: ContenidoFirmado = {
  organizationId: "o1", pacienteId: "p1", folio: 1, ordenId: null, citaId: null, plantillaId: null, plantillaVersion: null,
  motivoConsulta: "Dolor", hallazgos: "Caries 16", procedimiento: null, diagnosticosCie10: [{ codigo: "K021", descripcion: "Caries" }], plan: null, indicaciones: null,
  proximaCita: new Date("2026-12-01T00:00:00Z"), odontogramaSnapshot: [{ diente: 16, superficie: null, condicion: "caries", notas: null }],
  firmanteId: "u1", firmanteNombre: "Dra. Prueba", firmanteTarjeta: "123", firmadaEn: new Date("2026-11-25T15:00:00.000Z"),
};

describe("jsonCanonico y hash", () => {
  it("ordena claves y es independiente del orden de inserción", () => {
    expect(jsonCanonico({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } })).toBe(jsonCanonico({ a: { c: null, d: [2, { x: 2, y: 1 }] }, b: 1 }));
    expect(jsonCanonico({ a: 1, b: undefined })).toBe('{"a":1}');
  });
  it("el hash es determinístico (vector SHA-256 conocido)", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashEvolucion(base)).toBe(hashEvolucion({ ...base, diagnosticosCie10: [{ descripcion: "Caries", codigo: "K021" }] }));
  });
  it("una fila completa de la base (con id, hash y método) da el mismo hash que el contenido", () => {
    expect(hashEvolucion({ ...base, id: "x", hashContenido: "y", metodoFirma: "CLAVE" } as ContenidoFirmado)).toBe(hashEvolucion(base));
  });
  it("cualquier cambio del contenido cambia el hash; la fecha de próxima cita se normaliza al día", () => {
    const h = hashEvolucion(base);
    expect(hashEvolucion({ ...base, hallazgos: "Caries 17" })).not.toBe(h);
    expect(hashEvolucion({ ...base, folio: 2 })).not.toBe(h);
    expect(hashEvolucion({ ...base, proximaCita: "2026-12-01" })).toBe(h);
  });
  it("la adenda queda atada al hash de la evolución", () => {
    const a = { organizationId: "o1", evolucionId: "e1", hashEvolucion: "h1", texto: "x", firmanteId: "u1", firmanteNombre: "n", firmanteTarjeta: null, firmadaEn: new Date("2026-11-25T16:00:00Z") };
    expect(hashAdenda(a)).not.toBe(hashAdenda({ ...a, hashEvolucion: "h2" }));
  });
});

describe("permisos", () => {
  it("solo admin y especialista leen; recepción y doctor remitente no", () => {
    expect(puedeLeerEvolucion("admin_tenant")).toBe(true);
    expect(puedeLeerEvolucion("especialista")).toBe(true);
    expect(puedeLeerEvolucion("recepcion")).toBe(false);
    expect(puedeLeerEvolucion("doctor_remitente")).toBe(false);
  });
  it("firma: especialista, o admin que es odontólogo", () => {
    expect(puedeFirmar("especialista", false)).toBe(true);
    expect(puedeFirmar("admin_tenant", true)).toBe(true);
    expect(puedeFirmar("admin_tenant", false)).toBe(false);
    expect(puedeFirmar("recepcion", true)).toBe(false);
  });
});

describe("plantillas", () => {
  it("las 7 plantillas base son válidas y con claves únicas", () => {
    expect(PLANTILLAS_BASE).toHaveLength(7);
    for (const p of PLANTILLAS_BASE) {
      expect(esquemaCamposPlantilla.safeParse({ campos: p.campos }).success, p.nombre).toBe(true);
      expect(new Set(p.campos.map((c) => c.clave)).size, p.nombre).toBe(p.campos.length);
    }
  });
  it("compone los campos guiados en las columnas de la evolución", () => {
    const campos = PLANTILLAS_BASE.find((p) => p.nombre === "Endodoncia")!.campos;
    const r = componerContenido(campos, { motivo: "Dolor", pulpar: "Pulpitis irreversible", pruebas: " Frío +  ", plan: "" });
    expect(r.motivoConsulta).toBe("Dolor");
    expect(r.hallazgos).toBe("Diagnóstico pulpar y periapical: Pulpitis irreversible\nPruebas (frío, percusión, palpación): Frío +");
    expect(r.plan).toBeNull();
  });
  it("sin plantilla usa los cinco campos estándar tal cual", () => {
    expect(componerContenido(CAMPOS_ESTANDAR, { hallazgos: "a", plan: "b" })).toMatchObject({ hallazgos: "a", plan: "b", motivoConsulta: null });
  });
  it("rechaza plantillas sin campos o con clave inválida", () => {
    expect(esquemaCamposPlantilla.safeParse({ campos: [] }).success).toBe(false);
    expect(esquemaCamposPlantilla.safeParse({ campos: [{ clave: "A B", etiqueta: "x", destino: "plan" }] }).success).toBe(false);
  });
});

describe("validaciones", () => {
  it("CIE-10: normaliza y valida", () => {
    expect(esquemaDiagnostico.parse({ codigo: " k02.1 ", descripcion: "Caries" }).codigo).toBe("K021");
    expect(esquemaDiagnostico.safeParse({ codigo: "K0" }).success).toBe(false);
    expect(esquemaDiagnostico.safeParse({ codigo: "1234" }).success).toBe(false);
    expect(esquemaDiagnostico.safeParse({ codigo: "K02<script>" }).success).toBe(false);
  });
  it("borrador: límites de texto y de adjuntos", () => {
    const ok = { valores: { plan: "x" }, diagnosticos: [], proximaCita: "", adjuntoIds: [] };
    expect(esquemaBorrador.safeParse(ok).success).toBe(true);
    expect(esquemaBorrador.safeParse({ ...ok, valores: { plan: "x".repeat(5001) } }).success).toBe(false);
    expect(esquemaBorrador.safeParse({ ...ok, proximaCita: "01/12/2026" }).success).toBe(false);
  });
  it("una evolución vacía no tiene contenido; con diagnóstico sí", () => {
    const vacio = componerContenido(CAMPOS_ESTANDAR, { plan: "   " });
    expect(tieneContenido(vacio, [])).toBe(false);
    expect(tieneContenido(vacio, [{ codigo: "K02" }])).toBe(true);
  });
  it("adenda: motivo mínimo y texto obligatorio; el motivo va en el texto guardado", () => {
    expect(esquemaAdenda.safeParse({ motivo: "err", texto: "x" }).success).toBe(false);
    expect(esquemaAdenda.safeParse({ motivo: "Error de digitación", texto: "" }).success).toBe(false);
    expect(textoAdenda(" Error de digitación ", " Era el diente 26 ")).toBe("Motivo: Error de digitación\nEra el diente 26");
  });
  it("toma: la repetición exige motivo", () => {
    expect(esquemaToma.safeParse({ ordenId: "o", repeticiones: "0" }).success).toBe(true);
    expect(esquemaToma.safeParse({ ordenId: "o", repeticiones: "2" }).success).toBe(false);
    expect(esquemaToma.safeParse({ ordenId: "o", repeticiones: "2", motivoRepeticion: "Movimiento" }).success).toBe(true);
    expect(esquemaToma.safeParse({ ordenId: "o", repeticiones: "99", motivoRepeticion: "x" }).success).toBe(false);
  });
});
