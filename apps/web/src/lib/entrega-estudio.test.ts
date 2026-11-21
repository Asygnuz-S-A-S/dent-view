import { describe, expect, it } from "vitest";
import { puedeDescargarEstudio, decidirAccesoVisor } from "./acceso";
import { claveEnvioEstudio, nombreZip, VENTANA_ENVIO_MS } from "./entrega-estudio";

const est = { organizationId: "o1", doctorRemitenteId: "d1" };

describe("puedeDescargarEstudio", () => {
  it("permite al personal del centro", () => {
    for (const rol of ["admin_tenant", "recepcion", "especialista"]) expect(puedeDescargarEstudio("u", rol, est)).toBe(true);
  });
  it("niega al doctor remitente, a no miembros y a estudios inexistentes", () => {
    expect(puedeDescargarEstudio("d1", "doctor_remitente", est)).toBe(false);
    expect(puedeDescargarEstudio("u", null, est)).toBe(false);
    expect(puedeDescargarEstudio("u", "admin_tenant", null)).toBe(false);
  });
});

describe("visor con estudio compartido", () => {
  const base = { usuarioId: "d2", metodo: "GET", uid: "1.2", estudio: est, rol: "doctor_remitente" };
  it("el doctor ajeno solo entra si hay enlace compartido activo", () => {
    expect(decidirAccesoVisor(base)).toBe(403);
    expect(decidirAccesoVisor({ ...base, compartido: true })).toBe(200);
  });
  it("compartido no aplica a otros roles ni a métodos de escritura", () => {
    expect(decidirAccesoVisor({ ...base, rol: null, compartido: true })).toBe(403);
    expect(decidirAccesoVisor({ ...base, metodo: "POST", compartido: true })).toBe(403);
  });
});

describe("claveEnvioEstudio (idempotencia)", () => {
  const t = 1_800_000_000_000;
  it("es igual para el mismo estudio, destino y ventana (sin importar mayúsculas)", () => {
    expect(claveEnvioEstudio("e1", "A@x.co", t)).toBe(claveEnvioEstudio("e1", " a@x.co ", t + 1000));
  });
  it("cambia con otro destino, otro estudio o pasada la ventana", () => {
    const k = claveEnvioEstudio("e1", "a@x.co", t);
    expect(claveEnvioEstudio("e1", "b@x.co", t)).not.toBe(k);
    expect(claveEnvioEstudio("e2", "a@x.co", t)).not.toBe(k);
    expect(claveEnvioEstudio("e1", "a@x.co", t + 2 * VENTANA_ENVIO_MS)).not.toBe(k);
  });
  it("no contiene el correo", () => expect(claveEnvioEstudio("e1", "a@x.co", t)).not.toContain("a@x.co"));
});

describe("nombreZip", () => {
  it("no incluye datos del paciente", () => {
    expect(nombreZip({ id: "clxyz123abc", fechaEstudio: new Date("2026-03-04T00:00:00Z") })).toBe("estudio-20260304-123abc.zip");
    expect(nombreZip({ id: "clxyz123abc", fechaEstudio: null })).toBe("estudio-sinfecha-123abc.zip");
  });
});
