import { describe, expect, it } from "vitest";
import { debeActualizarUso, evaluarToken, MENSAJE_401 } from "./api-auth";
import { claveValida, decidirIdempotencia, huellaPeticion, VIDA_CLAVE_MS } from "./api-idempotencia";
import { contarPeticion } from "./api-limite";
import { codificarCursor, decodificarCursor, despuesDe, limiteValido, paginar } from "./api-paginacion";
import { esquemaCitaApi, esquemaOrdenApi, esquemaPacienteApi, esquemaPacientePatch } from "./api-esquemas";

describe("paginación por cursor", () => {
  const f = (i: number) => ({ id: `id${i}`, creadoEn: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) });
  it("el cursor va y vuelve, y se rechaza basura", () => {
    const c = { creadoEn: new Date("2026-01-01T00:00:05.123Z"), id: "abc" };
    expect(decodificarCursor(codificarCursor(c))).toEqual(c);
    for (const malo of ["", "zzz", Buffer.from("[1,2]").toString("base64url"), Buffer.from('["no-fecha","x"]').toString("base64url")]) expect(decodificarCursor(malo)).toBeNull();
  });
  it("limite: 50 por defecto, 1..100, entero", () => {
    expect(limiteValido(null)).toBe(50);
    expect(limiteValido("100")).toBe(100);
    for (const malo of ["0", "101", "-1", "2.5", "abc"]) expect(limiteValido(malo)).toBeNull();
  });
  it("pide limite+1 y devuelve cursor solo si hay más; recorrer páginas no repite ni salta", () => {
    const todas = Array.from({ length: 7 }, (_, i) => f(i));
    const vistos: string[] = [];
    let cursor: ReturnType<typeof decodificarCursor> = null;
    for (let n = 0; n < 10; n++) {
      const desde = cursor ? todas.filter((x) => x.creadoEn > cursor!.creadoEn || (x.creadoEn.getTime() === cursor!.creadoEn.getTime() && x.id > cursor!.id)) : todas;
      const { datos, siguiente } = paginar(desde.slice(0, 4), 3, (x) => x.creadoEn);
      vistos.push(...datos.map((d) => d.id));
      if (!siguiente) break;
      cursor = decodificarCursor(siguiente);
    }
    expect(vistos).toEqual(todas.map((x) => x.id));
    expect(paginar(todas.slice(0, 3), 3, (x) => x.creadoEn).siguiente).toBeNull();
  });
  it("desempata por id cuando la fecha coincide", () => {
    const c = { creadoEn: new Date(0), id: "m" };
    expect(despuesDe(c)).toEqual({ OR: [{ creadoEn: { gt: c.creadoEn } }, { creadoEn: c.creadoEn, id: { gt: "m" } }] });
  });
});

describe("límite de peticiones", () => {
  it("permite 120 por ventana, rechaza la 121 con tiempo de espera y reinicia después", () => {
    const m = new Map();
    for (let i = 1; i <= 120; i++) expect(contarPeticion(m, "t", 1000).permitido).toBe(true);
    const r = contarPeticion(m, "t", 1000 + 10_000);
    expect(r).toMatchObject({ permitido: false, restantes: 0, restablecerEnSeg: 50 });
    expect(contarPeticion(m, "t", 1000 + 60_000)).toMatchObject({ permitido: true, restantes: 119 });
  });
  it("cada token tiene su propio contador", () => {
    const m = new Map();
    for (let i = 0; i < 5; i++) contarPeticion(m, "a", 0, 5);
    expect(contarPeticion(m, "a", 0, 5).permitido).toBe(false);
    expect(contarPeticion(m, "b", 0, 5).permitido).toBe(true);
  });
});

describe("idempotencia", () => {
  const h = huellaPeticion("POST", "/api/v1/ordenes", { a: 1 });
  const guardado = (creadoEn: Date, metodoRuta = h) => ({ metodoRuta, creadoEn });
  it("sin registro → nueva; misma petición → repetir; otro cuerpo → conflicto", () => {
    const ahora = new Date("2026-01-02T00:00:00Z");
    expect(decidirIdempotencia(null, h, ahora)).toBe("NUEVA");
    expect(decidirIdempotencia(guardado(ahora), h, ahora)).toBe("REPETIR");
    expect(decidirIdempotencia(guardado(ahora), huellaPeticion("POST", "/api/v1/ordenes", { a: 2 }), ahora)).toBe("CONFLICTO");
    expect(decidirIdempotencia(guardado(ahora), huellaPeticion("POST", "/api/v1/citas", { a: 1 }), ahora)).toBe("CONFLICTO");
  });
  it("una clave de más de 24 h ya no cuenta", () => {
    const ahora = new Date("2026-01-02T00:00:00Z");
    expect(decidirIdempotencia(guardado(new Date(ahora.getTime() - VIDA_CLAVE_MS)), h, ahora)).toBe("NUEVA");
  });
  it("valida la clave (≤ 80, imprimible)", () => {
    expect(claveValida("a".repeat(80))).toBe(true);
    for (const mala of ["", "a".repeat(81), "con espacio", "ñ"]) expect(claveValida(mala)).toBe(false);
  });
});

describe("decisión de autenticación", () => {
  const ahora = new Date("2026-06-01T00:00:00Z");
  const ok = { permisos: ["pacientes:leer"], vence: null, revocadoEn: null };
  it("token válido con permiso pasa", () => expect(evaluarToken(ok, "pacientes:leer", ahora)).toBeNull());
  it("inexistente, vencido y revocado dan el mismo 401", () => {
    const casos = [null, { ...ok, vence: new Date("2026-05-01T00:00:00Z") }, { ...ok, revocadoEn: new Date("2026-05-01T00:00:00Z") }];
    const errores = casos.map((c) => evaluarToken(c, "pacientes:leer", ahora)!);
    for (const e of errores) expect([e.status, e.codigo, e.message]).toEqual([401, "no_autenticado", MENSAJE_401]);
  });
  it("sin el permiso → 403 (leer no implica escribir)", () => {
    const e = evaluarToken(ok, "pacientes:escribir", ahora)!;
    expect([e.status, e.codigo]).toEqual([403, "sin_permiso"]);
  });
  it("ultimoUso se actualiza como máximo una vez por minuto", () => {
    expect(debeActualizarUso(null, ahora)).toBe(true);
    expect(debeActualizarUso(new Date(ahora.getTime() - 30_000), ahora)).toBe(false);
    expect(debeActualizarUso(new Date(ahora.getTime() - 60_000), ahora)).toBe(true);
  });
});

describe("validación de cuerpos (zod)", () => {
  it("paciente: rechaza campos desconocidos y normaliza el documento", () => {
    const base = { tipoDocumento: "CC", numeroDocumento: "1.053-123", nombre: "Ana Pérez" };
    expect(esquemaPacienteApi.parse(base).numeroDocumento).toBe("1053123");
    expect(esquemaPacienteApi.safeParse({ ...base, rol: "admin" }).success).toBe(false);
    expect(esquemaPacienteApi.safeParse({ ...base, correo: "no-es-correo" }).success).toBe(false);
  });
  it("PATCH: solo contacto; el documento y el nombre no se pueden enviar; vacío no vale", () => {
    expect(esquemaPacientePatch.safeParse({ celular: "300" }).success).toBe(true);
    expect(esquemaPacientePatch.safeParse({ numeroDocumento: "999" }).success).toBe(false);
    expect(esquemaPacientePatch.safeParse({ nombre: "Otro" }).success).toBe(false);
    expect(esquemaPacientePatch.safeParse({}).success).toBe(false);
  });
  it("orden: nunca acepta precios del cliente", () => {
    const base = { pacienteId: "p", servicios: [{ servicioId: "s" }] };
    expect(esquemaOrdenApi.parse(base).entrega).toBe("DIGITAL");
    expect(esquemaOrdenApi.safeParse({ ...base, precio: 1 }).success).toBe(false);
    expect(esquemaOrdenApi.safeParse({ ...base, total: 1 }).success).toBe(false);
    expect(esquemaOrdenApi.safeParse({ pacienteId: "p", servicios: [{ servicioId: "s", precio: 1 }] }).success).toBe(false);
    expect(esquemaOrdenApi.safeParse({ ...base, servicios: [] }).success).toBe(false);
    expect(esquemaOrdenApi.safeParse({ ...base, doctorId: "d", doctorCorreo: "a@b.co" }).success).toBe(false);
  });
  it("cita: instante ISO, duración en rango, sin campos extra", () => {
    const base = { salaId: "s", pacienteId: "p", inicio: "2026-11-23T15:00:00Z", duracion: 30 };
    expect(esquemaCitaApi.safeParse(base).success).toBe(true);
    expect(esquemaCitaApi.safeParse({ ...base, inicio: "mañana" }).success).toBe(false);
    expect(esquemaCitaApi.safeParse({ ...base, estado: "ATENDIDA" }).success).toBe(false);
  });
});

describe("la API REST rechaza tokens MCP (H1)", () => {
  it("un token con el marcador mcp recibe el mismo 401 aunque tenga el permiso", async () => {
    const { evaluarToken } = await import("./api-auth");
    const base = { vence: null, revocadoEn: null };
    expect(evaluarToken({ ...base, permisos: ["pacientes:leer"] }, "pacientes:leer")).toBeNull();
    const e = evaluarToken({ ...base, permisos: ["pacientes:leer", "mcp"] }, "pacientes:leer");
    expect(e?.status).toBe(401);
    expect(e?.codigo).toBe("no_autenticado");
  });
});
