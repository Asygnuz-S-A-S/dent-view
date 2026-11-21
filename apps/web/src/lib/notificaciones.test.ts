// Implementación independiente (sala limpia) a partir de docs/sala-limpia/04-notificaciones.md
import { describe, expect, it } from "vitest";
import { decidirEnvio, esperaMinutos, renderPlantilla, type Preferencia } from "./notificaciones";

const pref = (p: Partial<NonNullable<Preferencia>>): Preferencia => ({ noContactar: false, correo: true, sms: true, whatsapp: true, tiposRechazados: [], ...p });
const contacto = { correo: "a@b.co", celular: "3001112233" };

describe("decidirEnvio", () => {
  it("sin preferencias, el correo es viable", () => {
    expect(decidirEnvio({ tipo: "CITA_CREADA", pref: null, contacto })).toEqual({ ok: true, canal: "CORREO", destinatario: "a@b.co" });
  });
  it("no contactar bloquea todo", () => {
    const d = decidirEnvio({ tipo: "CITA_CREADA", pref: pref({ noContactar: true }), contacto, canales: ["CORREO", "SMS"] });
    expect(d.ok).toBe(false);
  });
  it("tipo rechazado bloquea", () => {
    expect(decidirEnvio({ tipo: "CITA_RECORDATORIO", pref: pref({ tiposRechazados: ["CITA_RECORDATORIO"] }), contacto }).ok).toBe(false);
  });
  it("correo desactivado cae al siguiente canal; sin canal, se omite", () => {
    expect(decidirEnvio({ tipo: "X", pref: pref({ correo: false }), contacto, canales: ["CORREO", "SMS"] })).toMatchObject({ ok: true, canal: "SMS" });
    expect(decidirEnvio({ tipo: "X", pref: pref({ correo: false }), contacto: { correo: "a@b.co" }, canales: ["CORREO", "SMS"] }).ok).toBe(false);
  });
  it("sin dato de contacto no es viable", () => {
    expect(decidirEnvio({ tipo: "X", pref: null, contacto: {} }).ok).toBe(false);
  });
  it("un destinatario ajeno (doctor) ignora las preferencias del paciente", () => {
    expect(decidirEnvio({ tipo: "X", pref: pref({ noContactar: true }), contacto: {}, direccion: "dr@x.co", ajeno: true })).toMatchObject({ ok: true, destinatario: "dr@x.co" });
  });
});

describe("esperaMinutos", () => {
  it("exponencial con tope de 60", () => {
    expect([1, 2, 3, 4].map(esperaMinutos)).toEqual([1, 2, 4, 8]);
    expect(esperaMinutos(20)).toBe(60);
  });
});

describe("renderPlantilla", () => {
  it("reemplaza y deja vacías las ausentes", () => {
    expect(renderPlantilla("Hola {{ a }} {{b}}!", { a: "Ana" })).toBe("Hola Ana !");
  });
});
