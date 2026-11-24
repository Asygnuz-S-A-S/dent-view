// Integración del motor de secuencias contra la BD de desarrollo (hace falta DATABASE_URL). Se omite si no hay BD.
// Crea su propio centro "QA motor CRM ..." y lo borra al final (las filas cuelgan de la organización con ON DELETE CASCADE).
// Cubre los disparadores de paciente (CUMPLEANOS, CONTROL_PERIODICO, PACIENTE_INACTIVO, ORDEN_ENTREGADA, TRATAMIENTO_TERMINADO),
// la ventana horaria de Bogotá, el domingo, el tope diario, 1 correo/24 h, consentimiento, «no contactar» y la baja.
import { prisma } from "@dent-view/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { partesBogota } from "./crm-motor";

const hayBD = !!process.env.DATABASE_URL;
const SUF = Date.now().toString(36);
const ORG = `qa-motor-${SUF}`;

// Bogotá = UTC−5. 2026-11-25 es miércoles; 29 es domingo; 30 lunes; 28 sábado.
const MIE_10 = new Date("2026-11-25T15:00:00Z");
const MIE_20 = new Date("2026-11-26T01:00:00Z"); // miércoles 20:00 en Bogotá
const SAB_20 = new Date("2026-11-29T01:00:00Z"); // sábado 28 20:00 en Bogotá
const DOM_10 = new Date("2026-11-29T15:00:00Z");
const LUN_8 = new Date("2026-11-30T13:00:00Z");
const DIA = 86_400_000;

describe.skipIf(!hayBD)("motor CRM contra la BD", () => {
  let motor: typeof import("./crm-motor-datos");
  let n = 0;
  const unico = () => `${SUF}${++n}`;

  async function paciente(o: { nombre: string; correo?: string | null; consiente?: boolean; noContactar?: boolean; nacimiento?: Date; ultimaVisita?: Date; proximoControl?: Date }) {
    const persona = await prisma.persona.create({ data: { tipoDocumento: "CC", numeroDocumento: `QM${unico()}` } });
    const p = await prisma.pacienteTenant.create({
      data: {
        organizationId: ORG, personaId: persona.id, nombre: o.nombre, correo: o.correo === undefined ? `${o.nombre.toLowerCase().replace(/\W+/g, "-")}-${SUF}@example.test` : o.correo,
        fechaNacimiento: o.nacimiento, ultimaVisitaEn: o.ultimaVisita, proximoControlEn: o.proximoControl,
      },
    });
    if (o.consiente) await prisma.autorizacion.create({ data: { organizationId: ORG, pacienteId: p.id, tipo: "DATOS", finalidad: "mercadeo", otorgada: true, otorgadaEn: new Date() } });
    if (o.noContactar) await prisma.preferenciaContacto.create({ data: { pacienteId: p.id, organizationId: ORG, noContactar: true } });
    return p;
  }
  const secuencia = (disparador: string, extra: { diasInactividad?: number; activa?: boolean } = {}) =>
    prisma.secuenciaCRM.create({
      data: {
        organizationId: ORG, nombre: `QA ${disparador} ${unico()}`, disparador: disparador as never, diasInactividad: extra.diasInactividad, activa: extra.activa ?? true,
        pasos: { create: [{ organizationId: ORG, orden: 0, esperaDias: 0, accion: "CORREO", asunto: "Hola {{nombre}}", cuerpo: "Mensaje de {{centro}}" }] },
      },
    });
  const inscritos = async (secuenciaId: string) => (await prisma.inscripcionSecuencia.findMany({ where: { secuenciaId } })).map((i) => i.pacienteId ?? i.leadId);
  // Entre pruebas se borra todo lo del centro (los conteos del motor son por centro): citas y órdenes no cuelgan en cascada del paciente.
  const limpiarSecuencias = async () => {
    await prisma.secuenciaCRM.deleteMany({ where: { organizationId: ORG } });
    await prisma.cita.deleteMany({ where: { organizationId: ORG } });
    await prisma.orden.deleteMany({ where: { organizationId: ORG } });
    await prisma.pacienteTenant.deleteMany({ where: { organizationId: ORG } });
    await prisma.preferenciaContacto.deleteMany({ where: { organizationId: ORG } });
    await prisma.autorizacion.deleteMany({ where: { organizationId: ORG } });
  };
  // Ventana abierta todo el día y todos los días: los conteos (tope, 24 h) usan la hora real de la BD, así que esas pruebas usan «ahora» real.
  const abierta = () => { process.env.CRM_VENTANA_DESDE = "0"; process.env.CRM_VENTANA_HASTA = "24"; process.env.CRM_ENVIAR_DOMINGOS = "1"; delete process.env.CRM_VENTANA_LIBRE; delete process.env.CRM_TOPE_DIARIO; };
  const cumpleHoy = (ahora: Date) => { const b = partesBogota(ahora); return new Date(Date.UTC(1990, b.mes - 1, b.dia)); };

  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET ??= "qa-motor-crm-secreto-solo-pruebas"; // firma el enlace de baja
    delete process.env.SMTP_HOST; // sin SMTP el conector marca el correo como simulado
    motor = await import("./crm-motor-datos");
    await prisma.organization.create({ data: { id: ORG, name: `QA motor CRM ${SUF}`, slug: ORG } });
    await prisma.configCentro.create({ data: { organizationId: ORG, tipoCentro: "CENTRO_ODONTOLOGICO" } });
    await prisma.configFidelizacion.create({ data: { organizationId: ORG, activa: true, diasControl: 90, recordarCumpleanos: true } });
  });
  afterEach(async () => { await limpiarSecuencias(); });
  afterAll(async () => {
    for (const k of ["CRM_TOPE_DIARIO", "CRM_VENTANA_DESDE", "CRM_VENTANA_HASTA", "CRM_ENVIAR_DOMINGOS"]) delete process.env[k];
    await prisma.evento.deleteMany({ where: { organizationId: ORG } }).catch(() => {}); // con el rol de la app no hay permiso: la cascada del centro lo limpia
    await prisma.organization.delete({ where: { id: ORG } }).catch(() => {});
    const personas = await prisma.persona.findMany({ where: { numeroDocumento: { startsWith: "QM" }, pacientes: { none: {} } }, select: { id: true } });
    await prisma.persona.deleteMany({ where: { id: { in: personas.map((p) => p.id) } } }).catch(() => {});
  });

  it("CUMPLEANOS: inscribe solo a quien cumple hoy (hora de Bogotá), una vez, y no sin fidelización", async () => {
    const hoy = await paciente({ nombre: "Cumple Hoy", nacimiento: new Date("1990-11-25T00:00:00Z") });
    const manana = await paciente({ nombre: "Cumple Manana", nacimiento: new Date("1990-11-26T00:00:00Z") });
    const sinFecha = await paciente({ nombre: "Sin Fecha" });
    const s = await secuencia("CUMPLEANOS");
    expect(await motor.detectarDisparos(ORG, MIE_10)).toBe(1);
    expect(await inscritos(s.id)).toEqual([hoy.id]);
    expect(await motor.detectarDisparos(ORG, MIE_10)).toBe(0); // idempotente: no duplica
    // a las 23:00 de Bogotá (04:00Z del día siguiente en UTC) sigue siendo el 25
    expect(await motor.detectarDisparos(ORG, new Date("2026-11-26T04:00:00Z"))).toBe(0);
    expect([manana.id, sinFecha.id]).not.toContain((await inscritos(s.id))[0]);
    await prisma.configFidelizacion.update({ where: { organizationId: ORG }, data: { activa: false } });
    await prisma.inscripcionSecuencia.deleteMany({ where: { secuenciaId: s.id } });
    expect(await motor.detectarDisparos(ORG, MIE_10)).toBe(0); // fidelización apagada: nada
    await prisma.configFidelizacion.update({ where: { organizationId: ORG }, data: { activa: true } });
    await prisma.configFidelizacion.update({ where: { organizationId: ORG }, data: { recordarCumpleanos: false } });
    expect(await motor.detectarDisparos(ORG, MIE_10)).toBe(0); // sin «recordar cumpleaños»: nada
    await prisma.configFidelizacion.update({ where: { organizationId: ORG }, data: { recordarCumpleanos: true } });
  });

  it("CONTROL_PERIODICO: solo a quien ya le tocaba y no ha vuelto desde entonces", async () => {
    const toca = await paciente({ nombre: "Control Toca", ultimaVisita: new Date(MIE_10.getTime() - 100 * DIA), proximoControl: new Date(MIE_10.getTime() - 10 * DIA) });
    await paciente({ nombre: "Control Ya Volvio", ultimaVisita: new Date(MIE_10.getTime() - 2 * DIA), proximoControl: new Date(MIE_10.getTime() - 10 * DIA) });
    await paciente({ nombre: "Control Futuro", ultimaVisita: new Date(MIE_10.getTime() - 10 * DIA), proximoControl: new Date(MIE_10.getTime() + 80 * DIA) });
    const s = await secuencia("CONTROL_PERIODICO");
    expect(await motor.detectarDisparos(ORG, MIE_10)).toBe(1);
    expect(await inscritos(s.id)).toEqual([toca.id]);
    expect(await motor.detectarDisparos(ORG, MIE_10)).toBe(0);
  });

  it("PACIENTE_INACTIVO: sin visita hace N días; quien nunca ha venido o vino hace poco no entra", async () => {
    const viejo = await paciente({ nombre: "Inactivo Viejo", ultimaVisita: new Date(MIE_10.getTime() - 200 * DIA) });
    await paciente({ nombre: "Inactivo Reciente", ultimaVisita: new Date(MIE_10.getTime() - 20 * DIA) });
    await paciente({ nombre: "Inactivo Nunca" });
    const s = await secuencia("PACIENTE_INACTIVO", { diasInactividad: 180 });
    expect(await motor.detectarDisparos(ORG, MIE_10)).toBe(1);
    expect(await inscritos(s.id)).toEqual([viejo.id]);
    expect(await motor.detectarDisparos(ORG, MIE_10)).toBe(0);
  });

  it("ORDEN_ENTREGADA: una inscripción por orden entregada reciente, no por otros estados", async () => {
    const p = await paciente({ nombre: "Orden Entregada" });
    const q = await paciente({ nombre: "Orden Abierta" });
    const mk = (pacienteId: string, numero: number, estado: "ENTREGADA" | "SOLICITADA") => prisma.orden.create({ data: { organizationId: ORG, numero, pacienteId, estado } });
    await mk(p.id, 1, "ENTREGADA");
    await mk(q.id, 2, "SOLICITADA");
    const s = await secuencia("ORDEN_ENTREGADA");
    expect(await motor.detectarDisparos(ORG, new Date())).toBe(1);
    expect(await inscritos(s.id)).toEqual([p.id]);
    expect(await motor.detectarDisparos(ORG, new Date())).toBe(0);
  });

  it("TRATAMIENTO_TERMINADO: plan sin pendientes + cita atendida reciente; un mismo cierre no se inscribe dos veces al cambiar de mes", async () => {
    const sala = await prisma.sala.create({ data: { organizationId: ORG, nombre: "Sala QA" } });
    const listo = await paciente({ nombre: "Trat Terminado" });
    const pendiente = await paciente({ nombre: "Trat Pendiente" });
    const sinCita = await paciente({ nombre: "Trat Sin Cita" });
    const item = (pacienteId: string, estado: "REALIZADO" | "PLANEADO") => prisma.planTratamientoItem.create({ data: { pacienteId, descripcion: "QA", estado } });
    await item(listo.id, "REALIZADO");
    await item(pendiente.id, "REALIZADO"); await item(pendiente.id, "PLANEADO");
    await item(sinCita.id, "REALIZADO");
    const atendida = new Date("2026-11-25T14:00:00Z");
    for (const [i, p] of [listo, pendiente].entries()) {
      const inicio = new Date(atendida.getTime() + i * 3600_000);
      await prisma.cita.create({ data: { organizationId: ORG, salaId: sala.id, pacienteId: p.id, inicio, fin: new Date(inicio.getTime() + 1800_000), estado: "ATENDIDA" } });
    }
    const s = await secuencia("TRATAMIENTO_TERMINADO");
    // 31 de diciembre y 2 de enero de Bogotá: el mismo cierre de tratamiento (cita del 25/11 movida a diciembre para que siga dentro de 30 días).
    await prisma.cita.updateMany({ where: { pacienteId: listo.id }, data: { inicio: new Date("2026-12-28T14:00:00Z"), fin: new Date("2026-12-28T14:30:00Z") } });
    expect(await motor.detectarDisparos(ORG, new Date("2026-12-31T15:00:00Z"))).toBe(1);
    expect(await inscritos(s.id)).toEqual([listo.id]);
    expect(await motor.detectarDisparos(ORG, new Date("2027-01-02T15:00:00Z"))).toBe(0); // mismo tratamiento, otro mes: no se repite
    await item(listo.id, "REALIZADO"); // un plan nuevo ya terminado sí es otro cierre
    expect(await motor.detectarDisparos(ORG, new Date("2027-01-02T15:00:00Z"))).toBe(1);
  });

  it("no inscribe con la secuencia inactiva", async () => {
    await paciente({ nombre: "Inactiva Cumple", nacimiento: new Date("1991-11-25T00:00:00Z") });
    await secuencia("CUMPLEANOS", { activa: false });
    expect(await motor.detectarDisparos(ORG, MIE_10)).toBe(0);
  });

  describe("envío (sin SMTP: queda como simulado)", () => {
    const estados = async (inscId: string) => (await prisma.ejecucionPaso.findMany({ where: { inscripcionId: inscId }, orderBy: { creadoEn: "asc" } })).map((e) => e.estado);
    const inscripcionDe = (secuenciaId: string, pacienteId: string) => prisma.inscripcionSecuencia.findFirstOrThrow({ where: { secuenciaId, pacienteId } });
    const ventana = () => { delete process.env.CRM_VENTANA_LIBRE; delete process.env.CRM_TOPE_DIARIO; };

    it("consentimiento: con consentimiento envía; sin él omite el paso; con «no contactar» cancela", async () => {
      ventana();
      const si = await paciente({ nombre: "Env Consiente", consiente: true, nacimiento: new Date("1990-11-25T00:00:00Z") });
      const no = await paciente({ nombre: "Env SinConsent", nacimiento: new Date("1990-11-25T00:00:00Z") });
      const nc = await paciente({ nombre: "Env NoContactar", consiente: true, noContactar: true, nacimiento: new Date("1990-11-25T00:00:00Z") });
      const s = await secuencia("CUMPLEANOS");
      await motor.detectarDisparos(ORG, MIE_10);
      expect((await motor.ejecutarVencidas(ORG, MIE_10)).errores).toBe(0);
      expect(await estados((await inscripcionDe(s.id, si.id)).id)).toEqual(["ENVIADO"]);
      const insNo = await inscripcionDe(s.id, no.id);
      expect(await estados(insNo.id)).toEqual(["OMITIDO"]);
      const insNc = await inscripcionDe(s.id, nc.id);
      expect(await estados(insNc.id)).toEqual(["OMITIDO"]);
      expect(insNc.estado).toBe("CANCELADA");
      expect((await prisma.inscripcionSecuencia.findUniqueOrThrow({ where: { id: insNc.id } })).motivoFin).toBe("no_contactar");
    });

    it("ventana horaria de Bogotá: de noche y en domingo reprograma a la próxima apertura (8:00) y no envía", async () => {
      ventana();
      const p = await paciente({ nombre: "Ventana", consiente: true, nacimiento: new Date("1990-11-25T00:00:00Z") });
      const s = await secuencia("CUMPLEANOS");
      await motor.detectarDisparos(ORG, MIE_20); // 20:00 miércoles: fuera de ventana
      await motor.ejecutarVencidas(ORG, MIE_20);
      let ins = await inscripcionDe(s.id, p.id);
      expect(await estados(ins.id)).toEqual([]);
      expect(ins.proximaEjecucion.toISOString()).toBe("2026-11-26T13:00:00.000Z"); // jueves 8:00
      // sábado 20:00 → lunes 8:00 (salta el domingo)
      await prisma.inscripcionSecuencia.update({ where: { id: ins.id }, data: { proximaEjecucion: SAB_20 } });
      await motor.ejecutarVencidas(ORG, SAB_20);
      ins = await inscripcionDe(s.id, p.id);
      expect(ins.proximaEjecucion.toISOString()).toBe(LUN_8.toISOString());
      // domingo 10:00 → lunes 8:00
      await prisma.inscripcionSecuencia.update({ where: { id: ins.id }, data: { proximaEjecucion: DOM_10 } });
      await motor.ejecutarVencidas(ORG, DOM_10);
      ins = await inscripcionDe(s.id, p.id);
      expect(await estados(ins.id)).toEqual([]);
      expect(ins.proximaEjecucion.toISOString()).toBe(LUN_8.toISOString());
      // lunes 8:00: envía
      await motor.ejecutarVencidas(ORG, LUN_8);
      expect(await estados(ins.id)).toEqual(["ENVIADO"]);
    });

    it("tope diario del centro: el excedente pasa al día siguiente", async () => {
      abierta();
      process.env.CRM_TOPE_DIARIO = "1";
      const ahora = new Date();
      const a = await paciente({ nombre: "Tope A", consiente: true, nacimiento: cumpleHoy(ahora) });
      const b = await paciente({ nombre: "Tope B", consiente: true, nacimiento: cumpleHoy(ahora) });
      const s = await secuencia("CUMPLEANOS");
      await motor.detectarDisparos(ORG, ahora);
      await motor.ejecutarVencidas(ORG, ahora);
      const filas = await Promise.all([a, b].map(async (p) => { const i = await inscripcionDe(s.id, p.id); return { enviado: (await estados(i.id)).length, prox: i.proximaEjecucion }; }));
      expect(filas.reduce((t, f) => t + f.enviado, 0)).toBe(1);
      // el excedente queda para el día siguiente a la apertura configurada (00:00 de Bogotá con la ventana abierta)
      const medianoche = new Date(Date.UTC(partesBogota(ahora).anio, partesBogota(ahora).mes - 1, partesBogota(ahora).dia + 1, 5));
      expect(filas.find((f) => f.enviado === 0)!.prox.toISOString()).toBe(medianoche.toISOString());
    });

    it("un correo cada 24 h por destinatario, aunque lo pidan dos secuencias", async () => {
      abierta();
      const ahora = new Date();
      const p = await paciente({ nombre: "Doble", consiente: true, nacimiento: cumpleHoy(ahora), ultimaVisita: new Date(ahora.getTime() - 100 * DIA), proximoControl: new Date(ahora.getTime() - 5 * DIA) });
      const s1 = await secuencia("CUMPLEANOS");
      const s2 = await secuencia("CONTROL_PERIODICO");
      await motor.detectarDisparos(ORG, ahora);
      await motor.ejecutarVencidas(ORG, ahora);
      const filas = [await inscripcionDe(s1.id, p.id), await inscripcionDe(s2.id, p.id)];
      const enviados = (await Promise.all(filas.map((i) => estados(i.id)))).flat().filter((e) => e === "ENVIADO").length;
      expect(enviados).toBe(1);
      const espera = filas.find((i) => i.estado === "ACTIVA")!;
      expect(espera.proximaEjecucion.getTime()).toBeGreaterThan(ahora.getTime() + 23 * 3600_000); // el segundo espera 24 h
    });

    it("baja firmada: cancela las secuencias activas, retira el consentimiento y bloquea envíos futuros", async () => {
      ventana();
      const p = await paciente({ nombre: "Baja", consiente: true, nacimiento: new Date("1990-11-25T00:00:00Z") });
      const s = await secuencia("CUMPLEANOS");
      await motor.detectarDisparos(ORG, MIE_20);
      expect(await motor.aplicarBaja({ o: ORG, t: "p", i: p.id })).toMatchObject({ ok: true });
      const ins = await inscripcionDe(s.id, p.id);
      expect(ins.estado).toBe("CANCELADA");
      expect(ins.motivoFin).toBe("no_contactar");
      const sujeto = await motor.cargarSujeto(prisma, ORG, { pacienteId: p.id });
      expect(sujeto).toMatchObject({ noContactar: true, consentimientoMercadeo: false });
      expect(await motor.aplicarBaja({ o: ORG, t: "p", i: "no-existe" })).toEqual({ error: "Enlace no válido" });
      expect(await motor.aplicarBaja({ o: "otro-centro", t: "p", i: p.id })).toEqual({ error: "Enlace no válido" });
    });

    it("aislamiento: ejecutar un centro no toca inscripciones de otro", async () => {
      ventana();
      const otro = `qa-motor-otro-${SUF}`;
      await prisma.organization.create({ data: { id: otro, name: `QA motor otro ${SUF}`, slug: otro } });
      try {
        const persona = await prisma.persona.create({ data: { tipoDocumento: "CC", numeroDocumento: `QM${unico()}` } });
        const po = await prisma.pacienteTenant.create({ data: { organizationId: otro, personaId: persona.id, nombre: "Ajeno", correo: `ajeno-${SUF}@example.test` } });
        const so = await prisma.secuenciaCRM.create({ data: { organizationId: otro, nombre: "Ajena", disparador: "MANUAL", activa: true, pasos: { create: [{ organizationId: otro, orden: 0, accion: "CORREO", asunto: "x", cuerpo: "y" }] } } });
        const insA = await prisma.inscripcionSecuencia.create({ data: { organizationId: otro, secuenciaId: so.id, pacienteId: po.id, claveUnica: `man:${po.id}`, proximaEjecucion: MIE_10 } });
        await motor.ejecutarVencidas(ORG, MIE_10);
        expect((await prisma.inscripcionSecuencia.findUniqueOrThrow({ where: { id: insA.id } })).estado).toBe("ACTIVA");
        expect(await prisma.ejecucionPaso.count({ where: { inscripcionId: insA.id } })).toBe(0);
        // y un id de otro centro pasado a procesarInscripcion no avanza
        expect(await motor.procesarInscripcion(ORG, insA.id, MIE_10, { desde: 0, hasta: 24, domingos: true, topeDiarioCentro: 100, minHorasPorDestinatario: 24 }, { nombre: "x", color: "#000", logo: null } as never)).toBe("nada");
      } finally {
        await prisma.organization.delete({ where: { id: otro } }).catch(() => {});
      }
    });
  });
});
