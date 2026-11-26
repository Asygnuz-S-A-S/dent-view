import { describe, expect, it } from "vitest";
import { generarRips, type EntradaRips } from "./generar";

const base = (): EntradaRips => ({
  prestador: { nit: "900123456", codigoPrestador: "110010000001", modalidad: "01", grupoServicios: "01" },
  numFactura: null,
  orden: {
    numero: 28, fechaAtencion: new Date("2026-11-20T15:30:00Z"), total: 150_000, tipoUsuario: "05", numAutorizacion: null, finalidad: "15",
    causaMotivoAtencion: "13", viaIngreso: "01", diagnosticoPrincipal: "K021", diagnosticosRelacionados: ["K053"], tipoDiagnostico: "01",
  },
  paciente: { tipoDocumento: "CC", numeroDocumento: "1053123456", fechaNacimiento: new Date("1990-05-10T00:00:00Z"), sexo: "M", codPaisResidencia: "170", codMunicipio: "17001", zonaTerritorial: "U", codPaisOrigen: "170" },
  profesional: { tipoDocumento: "CC", numeroDocumento: "79123456" },
  items: [
    { nombre: "Consulta", codigoCups: "890203", tipoRips: "CONSULTA", precio: 50_000, codServicioReps: 334, finalidad: null, diagnostico: null },
    { nombre: "Panorámica", codigoCups: "870114", tipoRips: "PROCEDIMIENTO", precio: 100_000, codServicioReps: 302, finalidad: null, diagnostico: null },
  ],
  hoy: new Date("2026-11-26T12:00:00Z"),
});
const campos = (l: { campo: string }[]) => l.map((h) => h.campo);

describe("generarRips", () => {
  it("mixto: consulta y procedimiento sin errores y con todos los campos", () => {
    const r = generarRips(base());
    expect(r.errores).toEqual([]);
    const u = r.json.usuarios[0]!;
    expect(r.json.numDocumentoIdObligado).toBe("900123456");
    expect(r.json.numFactura).toBeNull();
    expect(u.fechaNacimiento).toBe("1990-05-10");
    expect(u.servicios.consultas).toHaveLength(1);
    expect(u.servicios.procedimientos).toHaveLength(1);
    expect(u.servicios.otrosServicios).toEqual([]);
    expect(u.servicios.consultas[0]).toMatchObject({
      codConsulta: "890203", fechaInicioAtencion: "2026-11-20 10:30", codDiagnosticoPrincipal: "K021", codDiagnosticoRelacionado1: "K053",
      codDiagnosticoRelacionado2: null, codDiagnosticoRelacionado3: null, tipoDiagnosticoPrincipal: "01", causaMotivoAtencion: "13", vrServicio: 50_000, consecutivo: 1, valorPagoModerador: 0,
    });
    expect(u.servicios.procedimientos[0]).toMatchObject({ codProcedimiento: "870114", viaIngresoServicioSalud: "01", codComplicacion: null, vrServicio: 100_000, consecutivo: 2 });
    expect(r.advertencias.map((a) => a.campo)).toContain("numFactura");
  });

  it("solo consulta: no exige vía de ingreso", () => {
    const e = base();
    e.items = [e.items[0]!]; e.orden.total = 50_000; e.orden.viaIngreso = null;
    expect(generarRips(e).errores).toEqual([]);
  });

  it("solo procedimiento: no exige causa ni tipo de diagnóstico", () => {
    const e = base();
    e.items = [e.items[1]!]; e.orden.total = 100_000; e.orden.causaMotivoAtencion = null; e.orden.tipoDiagnostico = null;
    expect(generarRips(e).errores).toEqual([]);
  });

  it("otro servicio va a otrosServicios con advertencia", () => {
    const e = base();
    e.items = [{ ...e.items[1]!, tipoRips: "OTRO_SERVICIO" }]; e.orden.total = 100_000;
    const r = generarRips(e);
    expect(r.errores).toEqual([]);
    expect(r.json.usuarios[0]!.servicios.otrosServicios).toHaveLength(1);
    expect(campos(r.advertencias)).toContain("items.0.tipoRips");
  });

  it("campos faltantes: errores con destino y JSON con null", () => {
    const e = base();
    e.prestador = { nit: null, codigoPrestador: "123", modalidad: null, grupoServicios: null };
    e.paciente = { ...e.paciente, sexo: null, codMunicipio: null, zonaTerritorial: null, fechaNacimiento: null };
    e.orden = { ...e.orden, tipoUsuario: null, diagnosticoPrincipal: null, diagnosticosRelacionados: [], finalidad: null };
    e.items[0]!.codigoCups = null;
    const r = generarRips(e);
    expect(campos(r.errores)).toEqual(expect.arrayContaining(["nit", "codigoPrestador", "sexo", "codMunicipio", "zonaTerritorial", "fechaNacimiento", "tipoUsuario", "diagnosticoPrincipal", "finalidad", "items.0.codigoCups"]));
    expect(r.errores.find((x) => x.campo === "sexo")!.destino).toBe("paciente");
    expect(r.errores.find((x) => x.campo === "nit")!.destino).toBe("centro");
    expect(r.json.usuarios[0]!.codSexo).toBeNull();
    expect(r.json.numDocumentoIdObligado).toBeNull();
  });

  it("diagnósticos repetidos entre sí, con el principal, o con formato inválido", () => {
    const e = base();
    e.orden.diagnosticosRelacionados = ["K053", "K053"];
    expect(generarRips(e).errores.map((x) => x.mensaje)).toContain("Hay diagnósticos relacionados repetidos.");
    e.orden.diagnosticosRelacionados = ["K021"];
    expect(generarRips(e).errores.map((x) => x.mensaje)).toContain("Un diagnóstico relacionado repite el principal.");
    e.orden.diagnosticosRelacionados = ["K05"];
    expect(generarRips(e).errores.map((x) => x.mensaje).join()).toContain("relacionado inválido");
    e.orden.diagnosticosRelacionados = []; e.orden.diagnosticoPrincipal = "k021x";
    expect(campos(generarRips(e).errores)).toContain("diagnosticoPrincipal");
  });

  it("más de 3 relacionados: advertencia y solo 3 en la consulta", () => {
    const e = base();
    e.orden.diagnosticosRelacionados = ["K050", "K051", "K053", "K073"];
    const r = generarRips(e);
    expect(r.errores).toEqual([]);
    expect(campos(r.advertencias)).toContain("diagnosticosRelacionados");
    expect(r.json.usuarios[0]!.servicios.consultas[0]).toMatchObject({ codDiagnosticoRelacionado3: "K053" });
  });

  it("fecha futura y fecha anterior al nacimiento", () => {
    const e = base();
    e.orden.fechaAtencion = new Date("2026-12-01T00:00:00Z");
    expect(generarRips(e).errores.map((x) => x.mensaje)).toContain("La fecha de atención está en el futuro.");
    e.orden.fechaAtencion = new Date("1980-01-01T00:00:00Z");
    expect(generarRips(e).errores.map((x) => x.mensaje)).toContain("La fecha de atención es anterior a la fecha de nacimiento.");
  });

  it("documento, municipio y CUPS inválidos", () => {
    const e = base();
    e.paciente.tipoDocumento = "XX"; e.paciente.numeroDocumento = "1"; e.paciente.codMunicipio = "1700";
    e.items[1]!.codigoCups = "8701";
    expect(campos(generarRips(e).errores)).toEqual(expect.arrayContaining(["tipoDocumento", "numeroDocumento", "codMunicipio", "items.1.codigoCups"]));
  });

  it("CUPS de 6 dígitos fuera del catálogo embebido: solo advertencia", () => {
    const e = base();
    e.items[1]!.codigoCups = "999999";
    const r = generarRips(e);
    expect(r.errores).toEqual([]);
    expect(campos(r.advertencias)).toContain("items.1.codigoCups");
  });

  it("la suma de servicios debe igualar el total de la orden", () => {
    const e = base();
    e.orden.total = 1;
    expect(campos(generarRips(e).errores)).toContain("total");
  });

  it("sin profesional avisa y envía null; con factura electrónica no avisa de numFactura", () => {
    const e = base();
    e.profesional = null; e.numFactura = "SETT-1";
    const r = generarRips(e);
    expect(campos(r.advertencias)).toContain("profesional");
    expect(campos(r.advertencias)).not.toContain("numFactura");
    expect(r.json.numFactura).toBe("SETT-1");
    expect(r.json.usuarios[0]!.servicios.consultas[0]).toMatchObject({ tipoDocumentoIdentificacion: null, numDocumentoIdentificacion: null });
  });

  it("sin servicios es un error", () => {
    const e = base();
    e.items = []; e.orden.total = 0;
    expect(campos(generarRips(e).errores)).toContain("items");
  });
});
