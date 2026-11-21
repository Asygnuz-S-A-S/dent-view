import { prisma } from "@dent-view/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cifrar } from "../cifrado";
import { BASE_DENTALINK, citaDeDentalink, crearDentalink, pacienteDeDentalink } from "./dentalink";
import { firmarEntrada, TOLERANCIA_S, verificarEntrada } from "./entrada";
import { obtenerJson } from "./http";
import { normalizarCita, normalizarPaciente } from "./normalizar";
import { ADAPTADORES, obtenerAdaptador } from "./registro";
import { clinicaSimulada, crearSimulado } from "./simulado";
import { aplicarCita, aplicarPaciente, conteosVacios, mensajeSeguro, sincronizar, type IntegracionFila } from "./sincronizar";
import { ErrorConector } from "./tipos";

describe("adaptador simulado (contrato)", () => {
  const sim = crearSimulado();
  it("expone el contrato del Conector y devuelve datos normalizables", async () => {
    expect(sim).toMatchObject({ clave: "simulado", verificado: true });
    expect((await sim.probarConexion({ codigo: "x" })).ok).toBe(true);
    expect((await sim.probarConexion({ codigo: "fallar" })).ok).toBe(false);
    const pacientes = await sim.listarPacientes({}, null);
    expect(pacientes).toHaveLength(3);
    expect(pacientes.every((p) => normalizarPaciente(p))).toBe(true);
    expect((await sim.listarCitas({}, null)).every((c) => normalizarCita(c))).toBe(true);
    expect(JSON.stringify(pacientes)).not.toContain("actualizadoEn");
  });
  it("filtra por fecha de la última sincronización", async () => {
    expect(await sim.listarPacientes({}, new Date())).toHaveLength(0);
    expect((await sim.listarPacientes({}, new Date(Date.now() - 2 * 3_600_000))).map((p) => p.idExterno)).toEqual(["SIM-3"]);
  });
  it("el registro solo conoce adaptadores propios", () => {
    expect(Object.keys(ADAPTADORES).sort()).toEqual(["dentalink", "simulado"]);
    expect(obtenerAdaptador("__proto__")).toBeNull();
    expect(obtenerAdaptador("constructor")).toBeNull();
  });
});

describe("normalización de datos externos", () => {
  it("descarta inválidos y recorta/limpia", () => {
    expect(normalizarPaciente({ idExterno: "1", numeroDocumento: "1", nombre: "A" })).toBeNull();
    const p = normalizarPaciente({ idExterno: "1", numeroDocumento: "1.053-123", nombre: "Ana\u0000 X", correo: "no-es-correo", tipoDocumento: "zz", fechaNacimiento: "0000-00-00" });
    expect(p).toMatchObject({ numeroDocumento: "1053123", nombre: "Ana X", correo: null, tipoDocumento: "CC", fechaNacimiento: null });
    expect(normalizarCita({ idExterno: "c", idPacienteExterno: "1", inicio: "2030-01-01T10:00:00Z", fin: "2030-01-01T09:00:00Z" })).toBeNull();
  });
});

describe("Dentalink (según la documentación oficial)", () => {
  it("mapea los campos documentados de pacientes", () => {
    const p = pacienteDeDentalink({ id: 2, rut: "20-7", tipo_documento: 0, nombre: "Daniel", apellidos: "Rojas", fecha_nacimiento: "0000-00-00", celular: "4387483", telefono: "123", email: "daniel@test.com", direccion: "" });
    expect(p).toMatchObject({ idExterno: "2", numeroDocumento: "207", nombre: "Daniel Rojas", fechaNacimiento: null, celular: "4387483", correo: "daniel@test.com" });
  });
  it("mapea los campos documentados de citas (anulada, confirmada, programada)", () => {
    const base = { id: 4, id_paciente: 1, fecha: "2016-06-24", hora_inicio: "09:15:00", hora_fin: "09:30:00", nombre_sillon: "Sillón 1" };
    expect(citaDeDentalink({ ...base, estado_anulacion: 1, estado_confirmacion: 0 })).toMatchObject({ idExterno: "4", idPacienteExterno: "1", estado: "CANCELADA", sala: "Sillón 1" });
    expect(citaDeDentalink({ ...base, estado_anulacion: 0, estado_confirmacion: 1 })?.estado).toBe("CONFIRMADA");
    expect(citaDeDentalink({ ...base, estado_anulacion: 0, estado_confirmacion: 0 })?.estado).toBe("PROGRAMADA");
    expect(citaDeDentalink({ ...base, hora_fin: "09:00:00" })).toBeNull();
  });
  it("usa siempre la URL base fija, la cabecera Token y solo toma el cursor de links.next (sin SSRF)", async () => {
    const urls: string[] = [];
    const cab: string[] = [];
    const paginas = [
      { data: [{ id: 1, rut: "111", nombre: "A", apellidos: "B" }], links: { next: "https://evil.example/api/v1/pacientes?cursor=ABC==" } },
      { data: [{ id: 2, rut: "222", nombre: "C", apellidos: "D" }] },
    ];
    const f = (async (url: string, init: RequestInit) => {
      urls.push(url);
      cab.push((init.headers as Record<string, string>).Authorization!);
      return Response.json(paginas.shift());
    }) as unknown as typeof fetch;
    const r = await crearDentalink({ fetch: f }).listarPacientes({ token: "tk" }, null);
    expect(r.map((p) => p.idExterno)).toEqual(["1", "2"]);
    expect(urls).toEqual([`${BASE_DENTALINK}/pacientes`, `${BASE_DENTALINK}/pacientes?cursor=ABC%3D%3D`]);
    expect(cab).toEqual(["Token tk", "Token tk"]);
  });
  it("un 401 no se reintenta y el mensaje no incluye el token", async () => {
    let n = 0;
    const f = (async () => (n++, new Response("token secreto-xyz inválido", { status: 401 }))) as unknown as typeof fetch;
    const r = await crearDentalink({ fetch: f }).probarConexion({ token: "secreto-xyz" });
    expect(r).toEqual({ ok: false, mensaje: "El proveedor respondió 401" });
    expect(n).toBe(1);
  });
});

describe("cliente HTTP", () => {
  it("reintenta 5xx y 429 y luego tiene éxito; falla con mensaje seguro al agotar intentos", async () => {
    let n = 0;
    const ok = (async () => (++n < 3 ? new Response("x", { status: n === 1 ? 503 : 429 }) : Response.json({ ok: 1 }))) as unknown as typeof fetch;
    expect(await obtenerJson("https://x.test", {}, { fetch: ok, esperaMs: 1 })).toEqual({ ok: 1 });
    n = 0;
    const mal = (async () => (n++, new Response("detalle interno", { status: 500 }))) as unknown as typeof fetch;
    await expect(obtenerJson("https://x.test", {}, { fetch: mal, esperaMs: 1, intentos: 2 })).rejects.toThrow("El proveedor respondió 500");
    expect(n).toBe(2);
  });
});

describe("firma del webhook de entrada", () => {
  const secreto = "whsec_prueba";
  const cuerpo = JSON.stringify({ id: "e1", tipo: "paciente", datos: {} });
  const ahora = 1_900_000_000_000;
  const marca = String(ahora / 1000);
  const firma = firmarEntrada(secreto, marca, cuerpo);
  it("válida", () => expect(verificarEntrada({ secreto, marca, firma, cuerpo, ahora })).toBe(true));
  it("cuerpo alterado", () => expect(verificarEntrada({ secreto, marca, firma, cuerpo: cuerpo + " ", ahora })).toBe(false));
  it("secreto distinto, firma ausente o de otra longitud", () => {
    expect(verificarEntrada({ secreto: "otro", marca, firma, cuerpo, ahora })).toBe(false);
    expect(verificarEntrada({ secreto, marca, firma: null, cuerpo, ahora })).toBe(false);
    expect(verificarEntrada({ secreto, marca, firma: "sha256=abc", cuerpo, ahora })).toBe(false);
  });
  it("vencida (más de 5 minutos, en ambos sentidos) y marca mal formada", () => {
    expect(verificarEntrada({ secreto, marca, firma, cuerpo, ahora: ahora + (TOLERANCIA_S + 1) * 1000 })).toBe(false);
    expect(verificarEntrada({ secreto, marca, firma, cuerpo, ahora: ahora - (TOLERANCIA_S + 1) * 1000 })).toBe(false);
    expect(verificarEntrada({ secreto, marca, firma, cuerpo, ahora: ahora + (TOLERANCIA_S - 1) * 1000 })).toBe(true);
    expect(verificarEntrada({ secreto, marca: "abc", firma, cuerpo, ahora })).toBe(false);
  });
  it("la marca está firmada: cambiarla invalida la firma", () => expect(verificarEntrada({ secreto, marca: String(ahora / 1000 + 1), firma, cuerpo, ahora })).toBe(false));
});

describe("mensajeSeguro", () => {
  it("no filtra mensajes arbitrarios ni credenciales", () => {
    expect(mensajeSeguro(new Error("DB password=hunter2 falló"), { token: "hunter2" })).toBe("Error inesperado durante la sincronización");
    expect(mensajeSeguro(new ErrorConector("token hunter2 inválido"), { token: "hunter2" })).toBe("token *** inválido");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("sincronización con BD", () => {
  const sufijo = `${Date.now()}`;
  const secreto = "secreto-de-prueba-para-cifrar";
  const orgs = [`inta-${sufijo}`, `intb-${sufijo}`];
  const integ: IntegracionFila[] = [];
  const docs = ["900100201", "900100202", "900100203"].map((d) => `${d}${sufijo.slice(-4)}`);
  // Clínica con documentos únicos para esta corrida.
  const datos = () => {
    const c = clinicaSimulada();
    c.pacientes.forEach((p, i) => (p.numeroDocumento = docs[i]!));
    return c;
  };

  beforeAll(async () => {
    for (const id of orgs) {
      await prisma.organization.create({ data: { id, name: id, slug: id } });
      const i = await prisma.integracion.create({ data: { organizationId: id, proveedor: "simulado", nombre: "Sim", credencialesCifradas: cifrar(JSON.stringify({ codigo: "ok" }), secreto) } });
      integ.push({ id: i.id, organizationId: id, proveedor: "simulado", credencialesCifradas: i.credencialesCifradas, ultimaSync: null });
    }
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    await prisma.persona.deleteMany({ where: { numeroDocumento: { in: docs } } });
    await prisma.$disconnect();
  });

  const conteoOrg = (org: string) => Promise.all([prisma.pacienteTenant.count({ where: { organizationId: org } }), prisma.cita.count({ where: { organizationId: org } }), prisma.vinculoExterno.count({ where: { integracion: { organizationId: org } } })]);

  it("trae pacientes y citas; dos corridas completas no duplican nada", async () => {
    const a = crearSimulado(datos());
    const r1 = await sincronizar(integ[0]!, a, secreto);
    expect(r1).toMatchObject({ ok: true, conteos: { pacientesCreados: 3, citasCreadas: 3 } });
    expect(await conteoOrg(orgs[0]!)).toEqual([3, 3, 3 + 3]);
    const r2 = await sincronizar(integ[0]!, a, secreto); // sin ultimaSync: vuelve a leer todo
    expect(r2).toMatchObject({ ok: true, conteos: { pacientesCreados: 0, citasCreadas: 0 } });
    expect(await conteoOrg(orgs[0]!)).toEqual([3, 3, 6]);
    const fila = await prisma.integracion.findUniqueOrThrow({ where: { id: integ[0]!.id } });
    expect(fila).toMatchObject({ estadoSync: "OK", errorSync: null });
    expect(fila.ultimaSync).not.toBeNull();
    expect(await prisma.evento.count({ where: { organizationId: orgs[0], tipo: "integracion.sync" } })).toBe(2);
  });

  it("aislamiento: otro centro no ve ni se vincula con lo del primero", async () => {
    expect(await conteoOrg(orgs[1]!)).toEqual([0, 0, 0]);
    expect((await sincronizar(integ[1]!, crearSimulado(datos()), secreto)).ok).toBe(true);
    expect(await conteoOrg(orgs[1]!)).toEqual([3, 3, 6]);
    const vinculosA = await prisma.vinculoExterno.findMany({ where: { integracionId: integ[0]!.id, entidad: "paciente" } });
    const pacientesA = new Set((await prisma.pacienteTenant.findMany({ where: { organizationId: orgs[0] } })).map((p) => p.id));
    expect(vinculosA.every((v) => pacientesA.has(v.idInterno))).toBe(true);
  });

  it("un paciente que ya existía solo se vincula: no recibe el contacto del sistema externo", async () => {
    const doc = `700${sufijo.slice(-8)}`;
    docs.push(doc);
    const persona = await prisma.persona.create({ data: { tipoDocumento: "CC", numeroDocumento: doc } });
    const previo = await prisma.pacienteTenant.create({ data: { organizationId: orgs[0]!, personaId: persona.id, nombre: "Nombre local", celular: "3999999999", correo: null, direccion: "" } });
    const ext = { idExterno: "X-1", tipoDocumento: "CC", numeroDocumento: doc, nombre: "Nombre externo", fechaNacimiento: new Date("1980-01-01T00:00:00Z"), celular: "3000000000", correo: "ext@example.com", direccion: "Calle externa" };
    const c = conteosVacios();
    await aplicarPaciente(integ[0]!, ext, c);
    await aplicarPaciente(integ[0]!, ext, c); // repetir tampoco lo completa
    const p = await prisma.pacienteTenant.findUniqueOrThrow({ where: { id: previo.id } });
    expect(p).toMatchObject({ nombre: "Nombre local", celular: "3999999999", correo: null, direccion: "", fechaNacimiento: null });
    expect(c).toMatchObject({ vinculadosSinCambios: 1, pacientesCompletados: 0, pacientesCreados: 0 });
  });

  it("un paciente creado por la integración sí se completa después (solo campos vacíos)", async () => {
    const doc = `701${sufijo.slice(-8)}`;
    docs.push(doc);
    const base = { idExterno: "X-2", tipoDocumento: "CC", numeroDocumento: doc, nombre: "Nombre externo", fechaNacimiento: null, celular: null, correo: null, direccion: null };
    const c = conteosVacios();
    await aplicarPaciente(integ[0]!, base, c);
    expect(c.pacientesCreados).toBe(1);
    await aplicarPaciente(integ[0]!, { ...base, nombre: "Otro", celular: "3000000000", correo: "ext@example.com" }, c);
    const v = await prisma.vinculoExterno.findUniqueOrThrow({ where: { integracionId_entidad_idExterno: { integracionId: integ[0]!.id, entidad: "paciente", idExterno: "X-2" } } });
    expect(await prisma.pacienteTenant.findUniqueOrThrow({ where: { id: v.idInterno } })).toMatchObject({ nombre: "Nombre externo", celular: "3000000000", correo: "ext@example.com" });
    expect(c.pacientesCompletados).toBe(1);
    const c2 = conteosVacios();
    await aplicarPaciente(integ[0]!, { ...base, correo: "otro@example.com", celular: "1" }, c2);
    expect(c2.pacientesCompletados).toBe(0);
  });

  it("las citas importadas usan una sola sala «Importada» y el sillón externo va limpio a notas", async () => {
    const org = orgs[1]!;
    const doc = `702${sufijo.slice(-8)}`;
    docs.push(doc);
    const c = conteosVacios();
    await aplicarPaciente(integ[1]!, { idExterno: "X-3", tipoDocumento: "CC", numeroDocumento: doc, nombre: "N", fechaNacimiento: null, celular: null, correo: null, direccion: null }, c);
    const mk = (id: string, sala: string | null) => aplicarCita(integ[1]!, { idExterno: id, idPacienteExterno: "X-3", inicio: new Date("2031-01-01T10:00:00Z"), fin: new Date("2031-01-01T11:00:00Z"), estado: "PROGRAMADA", sala }, c);
    await mk("C-1", `Sillón\nmuy ${"largo".repeat(40)}`);
    await mk("C-2", "Otro sillón");
    await mk("C-3", null);
    expect(await prisma.sala.findMany({ where: { organizationId: org }, select: { nombre: true } })).toEqual([{ nombre: "Importada" }]);
    const citas = await prisma.cita.findMany({ where: { organizationId: org, pacienteId: { not: null }, inicio: new Date("2031-01-01T10:00:00Z") }, orderBy: { creadoEn: "asc" } });
    expect(citas.map((x) => x.notas?.includes("\n"))).not.toContain(true);
    expect(citas.find((x) => x.notas?.startsWith("Sillón externo: Sillón muy"))!.notas!.length).toBeLessThanOrEqual(80 + "Sillón externo: ".length);
    expect(citas.some((x) => x.notas === null)).toBe(true);
  });

  it("un fallo del proveedor marca ERROR sin credenciales ni datos clínicos en el error", async () => {
    const malo = { ...integ[0]!, credencialesCifradas: cifrar(JSON.stringify({ codigo: "fallar" }), secreto) };
    const r = await sincronizar(malo, crearSimulado(datos()), secreto);
    expect(r).toEqual({ ok: false, error: "La clínica simulada rechazó las credenciales" });
    const fila = await prisma.integracion.findUniqueOrThrow({ where: { id: integ[0]!.id } });
    expect(fila.estadoSync).toBe("ERROR");
    expect(JSON.stringify(fila.errorSync)).not.toContain("fallar");
    const sinSecreto = await sincronizar(integ[0]!, crearSimulado(datos()), "otra-clave");
    expect(sinSecreto).toEqual({ ok: false, error: "Error inesperado durante la sincronización" });
  });
});
