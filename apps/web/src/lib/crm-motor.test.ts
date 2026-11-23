import { describe, expect, it } from "vitest";
import { renderCorreo } from "./correo/plantilla";
import { claveLead, clavePacienteAnio, clavePacienteValoracion, CONFIG_ENVIO, configEnvioDeEntorno, decidirCorreo, enVentana, esCumpleanosHoy, inicioDiaBogota, motivoCancelacionPorEtapa, partesBogota, proximaEjecucion, renderVariables, siguienteVentana, type EntradaDecision } from "./crm-motor";
import { firmarBaja, verificarBaja } from "./crm-baja";

// Bogotá = UTC−5. Lunes 23/11/2026 10:00 en Bogotá = 15:00Z.
const LUN_10 = new Date("2026-11-23T15:00:00Z");
const base: EntradaDecision = {
  sujeto: { correo: "a@b.co", noContactar: false, consentimientoMercadeo: true }, disparador: "LEAD_NUEVO", transaccional: false,
  ahora: LUN_10, config: CONFIG_ENVIO, enviadosHoyCentro: 0, ultimoEnvioDestinatario: null,
};

describe("ventana horaria (America/Bogota)", () => {
  it("usa la hora de Bogotá, no la UTC", () => {
    expect(partesBogota(new Date("2026-11-23T03:00:00Z"))).toMatchObject({ dia: 22, hora: 22, diaSemana: 0 });
    expect(enVentana(new Date("2026-11-23T13:00:00Z"))).toBe(true); // 8:00
    expect(enVentana(new Date("2026-11-23T12:59:00Z"))).toBe(false); // 7:59
    expect(enVentana(new Date("2026-11-24T00:00:00Z"))).toBe(false); // 19:00 ya cerró
    expect(enVentana(new Date("2026-11-23T23:59:00Z"))).toBe(true); // 18:59
  });
  it("no envía los domingos y pasa al lunes", () => {
    const dom = new Date("2026-11-22T17:00:00Z"); // domingo 12:00
    expect(enVentana(dom)).toBe(false);
    expect(siguienteVentana(dom).toISOString()).toBe("2026-11-23T13:00:00.000Z");
  });
  it("de noche pasa a las 8:00 del día siguiente y del sábado noche al lunes", () => {
    expect(siguienteVentana(new Date("2026-11-24T02:00:00Z")).toISOString()).toBe("2026-11-24T13:00:00.000Z"); // lun 21:00 -> mar 8:00
    expect(siguienteVentana(new Date("2026-11-22T02:00:00Z")).toISOString()).toBe("2026-11-23T13:00:00.000Z"); // sáb 21:00 -> lun 8:00
    expect(siguienteVentana(new Date("2026-11-23T11:00:00Z")).toISOString()).toBe("2026-11-23T13:00:00.000Z"); // lun 6:00 -> lun 8:00
  });
  it("respeta ventana configurable y la variable de pruebas", () => {
    expect(configEnvioDeEntorno({ CRM_VENTANA_DESDE: "9", CRM_VENTANA_HASTA: "17", CRM_TOPE_DIARIO: "5" })).toMatchObject({ desde: 9, hasta: 17, topeDiarioCentro: 5, domingos: false });
    expect(configEnvioDeEntorno({ CRM_VENTANA_DESDE: "abc" }).desde).toBe(8);
    expect(enVentana(new Date("2026-11-22T05:00:00Z"), configEnvioDeEntorno({ CRM_VENTANA_LIBRE: "1" }))).toBe(true);
  });
  it("inicio del día en Bogotá", () => {
    expect(inicioDiaBogota(new Date("2026-11-23T03:00:00Z")).toISOString()).toBe("2026-11-22T05:00:00.000Z");
  });
});

describe("decidirCorreo: salvaguardas", () => {
  it("envía cuando todo está en regla", () => expect(decidirCorreo(base)).toEqual({ accion: "enviar" }));
  it("noContactar nunca envía y cancela la secuencia, incluso si es transaccional", () => {
    const e = { ...base, sujeto: { ...base.sujeto, noContactar: true }, disparador: "VALORACION_COMPLETADA" as const, transaccional: true };
    expect(decidirCorreo(e)).toMatchObject({ accion: "omitir", cancelar: true });
  });
  it("sin consentimiento de mercadeo omite el paso", () => {
    const r = decidirCorreo({ ...base, sujeto: { ...base.sujeto, consentimientoMercadeo: false } });
    expect(r).toMatchObject({ accion: "omitir" });
    expect((r as { motivo: string }).motivo).toMatch(/^sin_consentimiento/);
  });
  it("transaccional solo se respeta en VALORACION_COMPLETADA", () => {
    const sin = { ...base.sujeto, consentimientoMercadeo: false };
    expect(decidirCorreo({ ...base, sujeto: sin, disparador: "VALORACION_COMPLETADA", transaccional: true })).toEqual({ accion: "enviar" });
    expect(decidirCorreo({ ...base, sujeto: sin, disparador: "LEAD_NUEVO", transaccional: true })).toMatchObject({ accion: "omitir" });
  });
  it("sin correo omite", () => expect(decidirCorreo({ ...base, sujeto: { ...base.sujeto, correo: null } })).toMatchObject({ accion: "omitir" }));
  it("fuera de ventana reprograma a la próxima apertura (aunque sea transaccional)", () => {
    const r = decidirCorreo({ ...base, ahora: new Date("2026-11-22T17:00:00Z") });
    expect(r).toMatchObject({ accion: "reprogramar" });
    expect((r as { hasta: Date }).hasta.toISOString()).toBe("2026-11-23T13:00:00.000Z");
  });
  it("tope diario del centro reprograma para el día siguiente", () => {
    const r = decidirCorreo({ ...base, enviadosHoyCentro: 100 });
    expect(r).toMatchObject({ accion: "reprogramar" });
    expect((r as { hasta: Date }).hasta.toISOString()).toBe("2026-11-24T13:00:00.000Z");
    expect(decidirCorreo({ ...base, enviadosHoyCentro: 99 })).toEqual({ accion: "enviar" });
  });
  it("máximo un correo cada 24 h por destinatario", () => {
    const hace2h = new Date(LUN_10.getTime() - 2 * 3600_000);
    const r = decidirCorreo({ ...base, ultimoEnvioDestinatario: hace2h });
    expect(r).toMatchObject({ accion: "reprogramar" });
    // 22 h después de las 10:00 de hoy = 8:00 de mañana, ya dentro de la ventana
    expect((r as { hasta: Date }).hasta.toISOString()).toBe("2026-11-24T13:00:00.000Z");
    expect(decidirCorreo({ ...base, ultimoEnvioDestinatario: new Date(LUN_10.getTime() - 25 * 3600_000) })).toEqual({ accion: "enviar" });
  });
});

describe("pasos, claves y cancelación", () => {
  it("proximaEjecucion suma días y horas", () => {
    expect(proximaEjecucion(LUN_10, { esperaDias: 1, esperaHoras: 2 }).toISOString()).toBe("2026-11-24T17:00:00.000Z");
  });
  it("claves de idempotencia según el doc del esquema", () => {
    expect(claveLead("x")).toBe("lead:x");
    expect(clavePacienteValoracion("p", "v")).toBe("pac:p:val:v");
    expect(clavePacienteAnio("p", 2026)).toBe("pac:p:2026");
  });
  it("responder (CONTACTADO+) cancela SIN_RESPUESTA; ganar o perder cancela todo", () => {
    expect(motivoCancelacionPorEtapa("LEAD_SIN_RESPUESTA", "CONTACTADO", "NUEVO")).toBe("respondio");
    expect(motivoCancelacionPorEtapa("LEAD_NUEVO", "CONTACTADO", "NUEVO")).toBeNull();
    expect(motivoCancelacionPorEtapa("LEAD_NUEVO", "GANADO")).toBe("ganado");
    expect(motivoCancelacionPorEtapa("MANUAL", "PERDIDO")).toBe("perdido");
  });
});

describe("cumpleaños", () => {
  const nac = (iso: string) => new Date(`${iso}T00:00:00Z`);
  it("compara mes y día con la fecha de Bogotá", () => {
    expect(esCumpleanosHoy(nac("1990-11-23"), LUN_10)).toBe(true);
    expect(esCumpleanosHoy(nac("1990-11-24"), LUN_10)).toBe(false);
    // 01:00Z del 24 todavía es 23 en Bogotá
    expect(esCumpleanosHoy(nac("1990-11-23"), new Date("2026-11-24T01:00:00Z"))).toBe(true);
  });
  it("29 de febrero se celebra el 28 en años no bisiestos", () => {
    expect(esCumpleanosHoy(nac("1992-02-29"), new Date("2026-02-28T15:00:00Z"))).toBe(true);
    expect(esCumpleanosHoy(nac("1992-02-29"), new Date("2028-02-28T15:00:00Z"))).toBe(false);
    expect(esCumpleanosHoy(nac("1992-02-29"), new Date("2028-02-29T15:00:00Z"))).toBe(true);
  });
});

describe("variables", () => {
  const v = { nombre: "Ana", centro: "Clínica Sol", enlace: "https://x.co/r" };
  it("renderiza las tres variables y quita las desconocidas", () => {
    expect(renderVariables("Hola {{nombre}} de {{ centro }} {{enlace}} {{otra}}!", v)).toBe("Hola Ana de Clínica Sol https://x.co/r !");
  });
  it("no re-expande ni deja saltos de línea en los valores", () => {
    expect(renderVariables("{{nombre}}", { ...v, nombre: "{{centro}}\r\nBcc: x" })).toBe("{{centro}} Bcc: x");
  });
  it("el HTML del correo escapa valores maliciosos", () => {
    const cuerpo = renderVariables("Hola {{nombre}}", { ...v, nombre: '<script>alert(1)</script>"' });
    const { html } = renderCorreo({ cuerpo, asunto: renderVariables("{{nombre}}", { ...v, nombre: "<b>x</b>" }) });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>x</b>");
  });
});

describe("enlace de baja firmado", () => {
  const s = { o: "org1", t: "l" as const, i: "lead1" };
  it("ida y vuelta", () => expect(verificarBaja(firmarBaja(s, "secreto"), "secreto")).toEqual(s));
  it("rechaza firma alterada, otro secreto y basura", () => {
    const t = firmarBaja(s, "secreto");
    const [c, f] = t.split(".");
    const otro = Buffer.from(JSON.stringify({ ...s, i: "lead2" })).toString("base64url");
    expect(verificarBaja(`${otro}.${f}`, "secreto")).toBeNull();
    expect(verificarBaja(`${c}.${f}x`, "secreto")).toBeNull();
    expect(verificarBaja(t, "otro")).toBeNull();
    expect(verificarBaja("basura", "secreto")).toBeNull();
    expect(verificarBaja(`${t}.extra`, "secreto")).toBeNull();
  });
});
