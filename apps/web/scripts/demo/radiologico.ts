// Centros radiológicos (Lumia y Radia): remitentes, órdenes, agenda, estudios DICOM, informes con PDF, entregas, cartera, caja y seguimiento.
import { prisma } from "@dent-view/db";
import { cifrar } from "../../src/lib/cifrado";
import { fechaLarga } from "../../src/lib/fechas";
import { generarCodigo } from "../../src/lib/informes";
import { generarPdfInforme, type DatosPdf } from "../../src/lib/informe-pdf";
import { generarTokenApi, SOLO_LECTURA } from "../../src/lib/api-token";
import { resolverPrecio } from "../../src/lib/precios";
import { generarSecreto } from "../../src/lib/webhooks";
import { calcularEdad } from "../../src/lib/pacientes";
import { cupsDe, DX_POR_ESTUDIO, HALLAZGOS, OBSERVACIONES, tipoRipsDe, type SrvDef } from "./catalogos";
import { digitoVerificacionNit } from "../../src/lib/fe/dian";
import { generarYGuardarRips } from "../../src/lib/rips/servicio";
import { Acum, asegurarMiembro, caja, consentimientos, crearCentro, crearUsuarios, egresosMensuales, facturar, mensajesHistoricos, type DefCentro, type DefUsuario, type DocFactura } from "./nucleo";
import { crearPacientes, historiaClinica, registrarPacientes, type Pac } from "./pacientes";
import { fechaDicom, nombreDicom, planEstudio, uidEstudio, type PlanEstudio, type TipoDicom } from "./estudios";
import { bog, conConcurrencia, crearRng, DIA, diaSemana, diaUtc, enMin, hashFicticio, log, mesDe, type Entorno, type Persona } from "./util";

export type DefDoctor = { nombre: string; email: string; especialidad: string; ciudad: string; peso: number; inicio: number; ultimo: number; semaforo: string };
export type ParamsRad = {
  def: DefCentro; catalogo: SrvDef[]; salas: [string, string, "cbct" | "pano" | "intra"][]; nPacientes: number; nOrdenes: number; histDias: number;
  doctores: DefDoctor[]; radiologos: { email: string; nombre: string; tarjeta: string }[]; recepcion: { email: string; nombre: string }[]; adminNombre: string;
  convenios: { nombre: string; nit: string; contacto: string; descuento: number | null; tarifas: [string, number][] }[];
  nEstudios: Partial<Record<TipoDicom, number>>; ventanaEstudios: number; rips: { codMunicipio: string; nit: string; codigoPrestador: string; prefijo: string; emiteFev: boolean }; hoy: ("A" | "E" | "L" | "C" | "P")[]; futuras: [number, number]; solicitadas: number; cajaDias: number; mensajes: number; solicitudes: number; esGrande: boolean;
};

type Doc = DefDoctor & { id: string };
type It = { srv: SrvDef; servicioId: string; precio: number; opciones: string | null };
type Ord = {
  id: string; numero: number; creado: Date; dia: number; doctor: Doc | null; pac: Pac; items: It[]; entrega: "DIGITAL" | "IMPRESA"; convenio: { id: string; nombre: string; descuento: number | null } | null;
  estado: "SOLICITADA" | "AGENDADA" | "TOMADA" | "INFORMADA" | "ENTREGADA" | "CANCELADA"; obs: string | null; cita?: { estado: string; inicio: Date; fin: Date; salaId: string; id: string };
  estudio?: PlanEstudio & { id: string }; informeId?: string;
};

const ESTACION = [0.85, 1.0, 1.1, 1.05, 1.05, 0.95, 0.9, 1.1, 1.15, 1.1, 1.05, 0.8];
const URL_BASE = () => process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:8080";

export async function construirRadiologico(env: Entorno, hash: string, P: ParamsRad, g: { nombre: () => Persona; documento: () => string; superId: string }, soloBasico = false) {
  const rng = crearRng(`rad:${P.def.slug}`);
  const slug = P.def.slug;
  const A = new Acum();
  const org = await crearCentro(P.def);
  const orgId = org.id;

  // ---- Usuarios ----
  const usuarios: DefUsuario[] = [
    { email: `admin@${slug}.ejemplo.invalid`, nombre: P.adminNombre, rol: "admin_tenant" },
    ...P.recepcion.map((r) => ({ email: r.email, nombre: r.nombre, rol: "recepcion" })),
    ...P.radiologos.map((r) => ({ email: r.email, nombre: r.nombre, rol: "especialista", perfil: { tarjeta: r.tarjeta, especialidad: "Radiología oral y maxilofacial", telefono: "3185550101", consultorio: P.def.ciudad } })),
    ...P.doctores.map((d, i) => ({ email: d.email, nombre: d.nombre, rol: "doctor_remitente", perfil: { tarjeta: `TP-${34000 + i * 137 + (slug === "radia" ? 500 : 0)}`, especialidad: d.especialidad, telefono: `31${i}5550${200 + i}`, consultorio: `Consultorio ${301 + i}, ${d.ciudad}` } })),
  ];
  const uid = await crearUsuarios(orgId, usuarios, hash);
  await asegurarMiembro(orgId, g.superId, "admin_tenant");
  if (soloBasico) return null;
  const admin = uid.get(`admin@${slug}.ejemplo.invalid`)!;
  const cajeros = P.recepcion.map((r) => uid.get(r.email)!);
  const radiologos = P.radiologos.map((r) => ({ ...r, id: uid.get(r.email)! }));
  const doctores: Doc[] = P.doctores.map((d) => ({ ...d, id: uid.get(d.email)! }));

  // ---- Catálogo, salas, horarios ----
  const servicios = P.catalogo.map((s, i) => ({ ...s, id: `${slug}-srv-${i + 1}` }));
  const salaId: Record<string, string> = {};
  P.salas.forEach(([nombre, color, tipo], i) => { salaId[tipo] = `${slug}-sala-${i + 1}`; });
  await prisma.servicio.createMany({
    data: servicios.map((s) => ({
      id: s.id, organizationId: orgId, categoria: s.categoria, nombre: s.nombre, descripcion: s.tecnica ?? null, precioImpreso: s.impreso, precioDigital: s.digital, descuento: s.descuento,
      codigoCups: cupsDe(s.nombre), tipoRips: tipoRipsDe(s.nombre),
      duracionMin: s.min, holguraMin: 0, reservableEnLinea: false, requiereOrden: true,
    })),
  });
  await prisma.sala.createMany({ data: P.salas.map(([nombre, color, tipo]) => ({ id: salaId[tipo]!, organizationId: orgId, nombre, color })) });
  await prisma.servicioSala.createMany({ data: servicios.map((s) => ({ organizationId: orgId, servicioId: s.id, salaId: salaId[s.sala]! })).filter((x) => x.salaId) });
  A.add("horarioAtencion", ...[1, 2, 3, 4, 5].map((d) => ({ id: `${slug}-hor-${d}`, organizationId: orgId, diaSemana: d, inicioMin: 420, finMin: 1080 })), { id: `${slug}-hor-6`, organizationId: orgId, diaSemana: 6, inicioMin: 480, finMin: 780 });
  await prisma.configFinanzas.create({ data: { organizationId: orgId } });
  // Facturación electrónica: NUNCA con proveedor SIMULADO (no existe en producción). Se deja el RIPS activo y, si el centro lo declara,
  // la columna FEV visible SIN conexión ni documentos: las cuentas de cobro quedan "no enviadas" a la DIAN. Ver README.
  await prisma.configFacturacion.create({ data: {
    organizationId: orgId, nit: P.rips.nit, dv: digitoVerificacionNit(P.rips.nit), razonSocial: `${P.def.nombre} S.A.S. (demo)`, nombreComercial: P.def.nombre, codigoPrestador: P.rips.codigoPrestador,
    generaRips: true, emiteFev: P.rips.emiteFev, modalidadDefecto: "01", grupoServiciosDefecto: "02", prefijoFactura: P.rips.prefijo, regimen: "COMUN", responsabilidadFiscal: "O-13", actualizadoEn: new Date(),
  } });
  await prisma.configSeguimientoDoctor.create({ data: { organizationId: orgId } });

  // ---- Convenios y tarifas ----
  const convs = P.convenios.map((c, i) => ({ ...c, id: `${slug}-conv-${i + 1}` }));
  await prisma.convenio.createMany({ data: convs.map((c) => ({ id: c.id, organizationId: orgId, nombre: c.nombre, nit: c.nit, contacto: c.contacto, descuentoGeneral: c.descuento, activo: true, vigenteDesde: diaUtc(-400), vigenteHasta: null })) });
  const tarifaConv = new Map<string, Map<string, number>>();
  const tarifas: Record<string, unknown>[] = [];
  convs.forEach((c) => {
    const m = new Map<string, number>();
    c.tarifas.forEach(([nombre, precio], k) => {
      const s = servicios.find((x) => x.nombre === nombre);
      if (!s) return;
      m.set(s.id, precio);
      tarifas.push({ id: `${c.id}-t${k + 1}`, organizationId: orgId, servicioId: s.id, convenioId: c.id, precioImpreso: precio, precioDigital: precio });
    });
    tarifaConv.set(c.id, m);
  });
  // Tarifas especiales por doctor: los remitentes de más volumen tienen precio preferencial en tres servicios.
  const tarifaDoc = new Map<string, Map<string, number>>();
  doctores.filter((d) => d.peso >= 1.5).slice(0, 4).forEach((d, di) => {
    const m = new Map<string, number>();
    [0, 4, 11].forEach((si, k) => {
      const s = servicios[si % servicios.length]!;
      const precio = Math.round(((s.digital ?? s.impreso ?? 0) * (0.88 - di * 0.02)) / 1000) * 1000;
      m.set(s.id, precio);
      tarifas.push({ id: `${slug}-td-${di}-${k}`, organizationId: orgId, servicioId: s.id, doctorId: d.id, precioImpreso: precio, precioDigital: precio });
    });
    tarifaDoc.set(d.id, m);
  });
  await prisma.tarifaEspecial.createMany({ data: tarifas as never });

  // ---- Pacientes ----
  const pacs = crearPacientes({ slug, rng, n: P.nPacientes, nombre: g.nombre, documento: g.documento, ciudad: P.def.ciudad });

  // ---- Órdenes del pasado ----
  // La última semana pesa la mitad: parte de sus órdenes ya la cubren las de hoy y la agenda de las próximas dos semanas (si no, el último mes se dispara en los reportes).
  const pesoDia = (d: number) => (diaSemana(-d) === 7 ? 0.03 : diaSemana(-d) === 6 ? 0.45 : 1) * (0.7 + 0.3 * (1 - d / P.histDias)) * ESTACION[mesDe(-d) - 1]! * (d <= 8 ? 0.5 : 1);
  const dias = Array.from({ length: P.histDias }, (_, i) => i + 1);
  const pesos = dias.map(pesoDia);
  const hoyN = P.hoy.length;
  const futN = Math.round((P.futuras[0] + P.futuras[1]) / 2 * 12);
  const nPresentes = hoyN + futN + P.solicitadas;
  const nPasadas = P.nOrdenes - nPresentes;
  const habil = (d: number) => (diaSemana(-d) === 7 ? d + 1 : d);
  const elegibles = (d: number) => doctores.filter((x) => x.peso > 0 && x.ultimo <= d && d <= x.inicio);
  const sinOrden: { dia: number; doctor: Doc | null }[] = [];
  // Anclas: cada remitente tiene su primera y su última orden en las fechas que fijan su semáforo.
  for (const d of doctores) {
    sinOrden.push({ dia: habil(d.ultimo), doctor: d });
    if (d.peso > 0) sinOrden.push({ dia: habil(Math.min(d.inicio, P.histDias)), doctor: d });
    if (d.peso === 0) sinOrden.push({ dia: habil(d.ultimo + 14), doctor: d });
  }
  while (sinOrden.length < nPasadas) {
    const dia = rng.weighted(dias, pesos);
    if (rng.chance(0.12)) { sinOrden.push({ dia, doctor: null }); continue; }
    const el = elegibles(dia);
    sinOrden.push({ dia, doctor: el.length ? rng.weighted(el, el.map((x) => x.peso)) : null });
  }
  const popular = servicios.map((s) => s.peso);
  const nuevosItems = (fechaIso: string, doctor: Doc | null, convenio: { id: string; descuento: number | null } | null, entrega: "DIGITAL" | "IMPRESA") => {
    const k = rng.weighted([1, 2, 3], [62, 28, 10]);
    const elegidos = new Set<SrvDef & { id: string }>();
    while (elegidos.size < k) elegidos.add(rng.weighted(servicios, popular));
    return [...elegidos].map((s) => itemPara(s, fechaIso, doctor, convenio, entrega));
  };
  const itemPara = (s: SrvDef & { id: string }, fechaIso: string, doctor: Doc | null, convenio: { id: string; descuento: number | null } | null, entrega: "DIGITAL" | "IMPRESA"): It => {
    {
      const tD = doctor ? tarifaDoc.get(doctor.id)?.get(s.id) : undefined;
      const tC = convenio ? tarifaConv.get(convenio.id)?.get(s.id) : undefined;
      const r = resolverPrecio({
        servicio: { precioImpreso: s.impreso, precioDigital: s.digital, descuento: s.descuento }, entrega,
        tarifaDoctor: tD ? { precioImpreso: tD, precioDigital: tD } : null,
        convenio: convenio ? { activo: true, descuentoGeneral: convenio.descuento, vigenteDesde: null, vigenteHasta: null, tarifa: tC ? { precioImpreso: tC, precioDigital: tC } : null } : null, fecha: fechaIso,
      });
      const opciones = s.categoria === "TOMOGRAFIA" || s.dicom === "IO" ? `Zona ${rng.pick(["36-37", "46-47", "11-21", "16", "26", "38", "48", "14-15"])}${s.categoria === "TOMOGRAFIA" ? " · FOV 5x5" : ""}` : null;
      return { srv: s, servicioId: s.id, precio: r.precio ?? 0, opciones };
    }
  };
  const fechaIso = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
  const nuevaOrden = (dia: number, doctor: Doc | null, estado: Ord["estado"], hora?: number): Ord => {
    const creado = bog(-dia, hora ?? rng.int(7, 16), rng.int(0, 59));
    const conv = rng.chance(0.17) ? rng.pick(convs) : null;
    const entrega = rng.chance(0.85) ? "DIGITAL" : "IMPRESA";
    const items = nuevosItems(fechaIso(creado), doctor, conv, entrega);
    return { id: "", numero: 0, creado, dia, doctor, pac: pacs[0]!, items, entrega, convenio: conv ? { id: conv.id, nombre: conv.nombre, descuento: conv.descuento } : null, estado, obs: rng.chance(0.55) ? rng.pick(OBSERVACIONES) : null };
  };
  const estadoPasado = (d: number): Ord["estado"] =>
    d >= 21 ? rng.weighted(["ENTREGADA", "INFORMADA", "CANCELADA", "TOMADA"] as const, [82, 6, 9, 3])
      : d >= 7 ? rng.weighted(["ENTREGADA", "INFORMADA", "TOMADA", "CANCELADA"] as const, [52, 28, 9, 9])
      : d >= 3 ? rng.weighted(["ENTREGADA", "INFORMADA", "TOMADA", "CANCELADA"] as const, [25, 40, 25, 10])
      : rng.weighted(["ENTREGADA", "INFORMADA", "TOMADA", "CANCELADA"] as const, [8, 32, 50, 10]);
  const ordenes: Ord[] = sinOrden.map((x) => nuevaOrden(x.dia, x.doctor, estadoPasado(x.dia)));

  // ---- Órdenes presentes: citas de hoy y de las próximas dos semanas ----
  const abiertas = doctores.filter((d) => d.peso > 0 && d.ultimo <= 1);
  const doctorAbierto = () => (rng.chance(0.15) || !abiertas.length ? null : rng.weighted(abiertas, abiertas.map((x) => x.peso)));
  const presentes: { o: Ord; estadoCita: string; pref: number; dia: number }[] = [];
  P.hoy.forEach((k, i) => {
    const estadoCita = { A: "ATENDIDA", E: "EN_ATENCION", L: "LLEGO", C: "CONFIRMADA", P: "PROGRAMADA" }[k];
    const o = nuevaOrden(rng.int(1, 5), doctorAbierto(), k === "A" ? "TOMADA" : "AGENDADA");
    presentes.push({ o, estadoCita, pref: { A: 450, E: 600, L: 630, C: 750, P: 840 }[k] + i * 15, dia: 0 });
  });
  for (let off = 1; off <= 14; off++) {
    if (diaSemana(off) === 7) continue;
    const n = rng.int(P.futuras[0], P.futuras[1]);
    for (let k = 0; k < n; k++) {
      const o = nuevaOrden(rng.int(1, 8), doctorAbierto(), "AGENDADA");
      presentes.push({ o, estadoCita: off <= 3 && rng.chance(0.7) ? "CONFIRMADA" : off > 3 && rng.chance(0.25) ? "CONFIRMADA" : "PROGRAMADA", pref: rng.int(450, 960), dia: off });
    }
  }
  for (let k = 0; k < P.solicitadas; k++) ordenes.push(nuevaOrden(rng.int(1, 8), doctorAbierto(), "SOLICITADA"));
  ordenes.push(...presentes.map((x) => x.o));
  ordenes.sort((a, b) => a.creado.getTime() - b.creado.getTime());
  const recepcionId = cajeros[0]!;
  ordenes.forEach((o, i) => { o.numero = i + 1; o.id = `${slug}-ord-${i + 1}`; });

  // Pacientes: cada uno con al menos una orden y el resto repartido con preferencia a los recurrentes.
  const orden0 = rng.shuffle(ordenes.map((_, i) => i));
  const barajados = rng.shuffle(pacs);
  const recurrentes = barajados.slice(0, Math.round(pacs.length * 0.25));
  orden0.forEach((idx, k) => { ordenes[idx]!.pac = k < pacs.length ? barajados[k]! : rng.chance(0.4) ? rng.pick(recurrentes) : rng.pick(pacs); });
  // Órdenes de hoy y de la agenda: pacientes distintos entre sí no hace falta, pero un paciente no puede tener dos citas a la misma hora (lo resuelve la sala).

  // ---- Agenda: citas sin cruces por sala ----
  const ocupado = new Map<string, [number, number][]>();
  const hueco = (sala: string, dia: number, dur: number, pref: number) => {
    const k = `${sala}|${dia}`;
    const l = ocupado.get(k) ?? [];
    const libre = (s: number) => !l.some(([a, b]) => s < b && s + dur > a);
    for (const rango of [[pref, 17 * 60 + 30 - dur], [7 * 60, pref]] as const) for (let s = rango[0]; s <= rango[1]; s += 15) if (libre(s)) { l.push([s, s + dur]); ocupado.set(k, l); return s; }
    throw new Error(`Sin hueco en ${sala} el día ${dia}`);
  };
  let citaN = 0;
  const esPresente = new Set(presentes.map((x) => x.o));
  const salaDe = (o: Ord) => salaId[o.items[0]!.srv.sala]!;
  const durDe = (o: Ord) => Math.min(90, Math.max(15, o.items.reduce((t, i) => t + i.srv.min, 0)));
  const citaRows: Record<string, unknown>[] = [];
  const crearCita = (o: Ord, estado: string, dia: number, pref: number, origen = "INTERNA") => {
    const dur = durDe(o), sala = salaDe(o);
    const cancelada = estado === "CANCELADA" || estado === "NO_ASISTIO";
    const inicioMin = cancelada ? pref : hueco(sala, dia, dur, pref);
    const inicio = bog(dia, 0, inicioMin), fin = bog(dia, 0, inicioMin + dur);
    const c = { id: `${slug}-cita-${++citaN}`, estado, inicio, fin, salaId: sala };
    o.cita = c;
    citaRows.push({
      id: c.id, organizationId: orgId, salaId: sala, pacienteId: o.pac.id, ordenId: o.id, inicio, fin, estado, servicioId: o.items[0]!.servicioId, origen, creadoEn: new Date(Math.min(o.creado.getTime(), inicio.getTime() - 3600_000)),
      notas: estado === "CANCELADA" ? "Canceló el paciente" : estado === "NO_ASISTIO" ? "No asistió a la cita" : null,
    });
  };
  for (const o of ordenes) {
    if (esPresente.has(o)) continue;
    const pref = (o.creado.getUTCHours() - 5) * 60 + o.creado.getUTCMinutes() + rng.int(10, 50);
    if (o.estado === "CANCELADA") { if (rng.chance(0.7)) crearCita(o, rng.chance(0.5) ? "CANCELADA" : "NO_ASISTIO", -o.dia, pref); continue; }
    if (o.estado === "SOLICITADA") continue;
    crearCita(o, "ATENDIDA", -o.dia, pref, rng.chance(0.08) ? "PUBLICA" : "INTERNA");
  }
  for (const p of presentes) crearCita(p.o, p.estadoCita, p.dia, p.pref, p.dia > 0 && rng.chance(0.1) ? "PUBLICA" : "INTERNA");
  // Inasistencias sueltas (sin orden): pacientes que no llegaron.
  const extra = Math.round(P.nOrdenes * 0.025);
  for (let k = 0; k < extra; k++) {
    const dia = rng.weighted(dias, pesos), srv = rng.weighted(servicios, popular), sala = salaId[srv.sala]!, pac = rng.pick(pacs);
    const inicio = bog(-dia, 0, rng.int(450, 960));
    citaRows.push({ id: `${slug}-cita-${++citaN}`, organizationId: orgId, salaId: sala, pacienteId: pac.id, ordenId: null, inicio, fin: enMin(inicio, srv.min), estado: "NO_ASISTIO", servicioId: srv.id, origen: "INTERNA", notas: "No asistió a la cita", creadoEn: enMin(inicio, -2 * 1440) });
  }
  A.add("cita", ...citaRows);

  // ---- Fechas de pacientes ----
  for (const p of pacs) {
    const suyas = ordenes.filter((o) => o.pac === p);
    const primera = suyas.reduce((m, o) => (o.creado < m ? o.creado : m), bog(-1));
    p.creadoEn = enMin(primera, -rng.int(0, 600));
    const ult = suyas.filter((o) => o.cita?.estado === "ATENDIDA").map((o) => o.cita!.inicio).sort((a, b) => b.getTime() - a.getTime())[0];
    p.ultimaVisitaEn = ult ?? null;
    if (ult && rng.chance(0.25)) p.proximoControlEn = enMin(ult, 60 * 24 * rng.int(150, 190));
    if (rng.chance(0.06)) p.alertas = "Alergia al látex.";
  }
  registrarPacientes(A, { orgId, slug, pacientes: pacs, actor: recepcionId, rips: { codMunicipio: P.rips.codMunicipio } });
  historiaClinica(A, { orgId, slug, rng, pacientes: pacs, fraccion: 0.18, actor: admin });
  pacs.slice(0, Math.round(pacs.length * 0.9)).forEach((p) => A.add("preferenciaContacto", { pacienteId: p.id, organizationId: orgId, noContactar: false, correo: true, sms: true, whatsapp: true, tiposRechazados: [] }));

  // ---- Estudios DICOM sintéticos asignados a órdenes tomadas recientes ----
  const planes: PlanEstudio[] = [];
  const candidatos = ordenes.filter((o) => ["TOMADA", "INFORMADA", "ENTREGADA"].includes(o.estado) && o.pac.tipoDoc === "CC" && o.cita?.estado === "ATENDIDA").sort((a, b) => b.cita!.inicio.getTime() - a.cita!.inicio.getTime());
  const usados = new Set<Ord>();
  const diaDe = (d: Date) => Math.max(0, Math.floor((bog(0).getTime() - d.getTime()) / DIA) + 1);
  let seed = 100;
  const intentar = (o: Ord, tipo: TipoDicom, forzar = false) => {
    if (usados.has(o)) return false;
    let it = o.items.find((i) => i.srv.dicom === tipo);
    if (!it) {
      // Fuerza el servicio que falta (p. ej. escaneo facial) en la orden para que el estudio tenga sentido.
      const s = servicios.find((x) => x.dicom === tipo);
      if (!forzar || !s) return false;
      it = itemPara(s, fechaIso(o.creado), o.doctor, o.convenio, o.entrega);
      o.items = [...o.items.slice(0, 1), it];
    }
    usados.add(o);
    const n = planes.length + 1;
    const p = planEstudio({
      key: `${slug}-${tipo.toLowerCase()}-${n}`, tipo, patientId: o.pac.doc, patientName: nombreDicom(o.pac.nombre), birthDate: fechaDicom(o.pac.nac), sex: o.pac.sexo, studyDate: fechaDicom(diaUtc(-diaDe(o.cita!.inicio))),
      studyUid: uidEstudio(slug, n), desc: it.srv.nombre, seed: seed++, centro: P.def.nombre, remitente: o.doctor?.nombre ?? "", accession: `${slug.toUpperCase().slice(0, 3)}-${o.numero}`,
      cortes: tipo === "CBCT" ? 24 + (n % 3) * 8 : undefined, superficieKey: tipo === "FACIAL" ? `tenants/${orgId}/superficies/${uidEstudio(slug, n)}.ply` : undefined,
    });
    planes.push(p);
    o.estudio = { ...p, id: `${slug}-est-${n}` };
    return true;
  };
  // El inicio y el seguimiento de doctores miran el último estudio de cada doctor: los que llevan semanas sin remitir
  // necesitan un estudio antiguo (su última remisión) para que el tablero los muestre como inactivos.
  for (const d of doctores.filter((x) => x.ultimo >= 25 && x.peso > 0)) {
    const o = candidatos.find((c) => c.doctor?.id === d.id && diaDe(c.cita!.inicio) <= 150);
    if (o) intentar(o, "PX", true);
  }
  for (const [tipo, cuantos] of Object.entries(P.nEstudios) as [TipoDicom, number][]) {
    const hechos = () => planes.filter((x) => x.tipo === tipo).length;
    // Reparto parejo en toda la ventana (los reportes comparan periodos: no pueden quedar todos juntos en el último mes).
    const lista = candidatos.filter((o) => !usados.has(o) && o.items.some((i) => i.srv.dicom === tipo) && diaDe(o.cita!.inicio) <= P.ventanaEstudios);
    // Para cada estudio se busca la orden más cercana a su "edad objetivo" (puntos equidistantes en la ventana).
    const faltan = cuantos - hechos();
    for (let i = 0; i < faltan; i++) {
      const objetivo = ((i + 0.5) * P.ventanaEstudios) / faltan;
      const mejor = lista.filter((o) => !usados.has(o)).sort((a, b) => Math.abs(diaDe(a.cita!.inicio) - objetivo) - Math.abs(diaDe(b.cita!.inicio) - objetivo))[0];
      if (mejor) intentar(mejor, tipo);
    }
    for (const o of candidatos) { if (hechos() >= cuantos) break; if (diaDe(o.cita!.inicio) <= P.ventanaEstudios) intentar(o, tipo, true); }
  }
  // ---- Órdenes (filas) ----
  const vinculosEq = new Set<string>();
  // Datos RIPS de la orden (tablas de lib/catalogos/referencias-rips.ts). ~10 % quedan sin diagnóstico para que la lista muestre órdenes "incompletas".
  const ripsDe = (o: Ord) => {
    if (o.estado === "CANCELADA") return {};
    const incompleta = rng.chance(0.1);
    const dxs = DX_POR_ESTUDIO[o.items.find((i) => i.srv.dicom)?.srv.dicom ?? "DEFECTO"]!;
    const principal = rng.pick(dxs);
    const otros = dxs.filter((d) => d !== principal);
    return {
      tipoUsuario: o.convenio ? "01" : "05", finalidad: "15", causaMotivoAtencion: "13", viaIngreso: "01", tipoDiagnostico: "01",
      diagnosticoPrincipal: incompleta ? null : principal, diagnosticosRelacionados: incompleta || !otros.length || !rng.chance(0.4) ? [] : [rng.pick(otros)],
      profesionalAtiendeId: radiologos[o.numero % radiologos.length]!.id, ripsActualizadoEn: enMin(o.creado, 90),
    };
  };
  for (const o of ordenes) {
    A.add("orden", { id: o.id, organizationId: orgId, numero: o.numero, pacienteId: o.pac.id, doctorRemitenteId: o.doctor?.id ?? null, estado: o.estado, entrega: o.entrega, convenioId: o.convenio?.id ?? null, observaciones: o.obs, embarazo: false, creadoPorId: recepcionId, creadoEn: o.creado, actualizadoEn: o.creado, ...ripsDe(o) });
    o.items.forEach((it, k) => A.add("ordenItem", { id: `${o.id}-i${k + 1}`, ordenId: o.id, servicioId: it.servicioId, nombre: it.srv.nombre, opciones: it.opciones, precio: it.precio, descuento: 0, codigoCups: cupsDe(it.srv.nombre), tipoRips: tipoRipsDe(it.srv.nombre) }));
    A.add("evento", { id: `${o.id}-ev`, organizationId: orgId, pacienteId: o.pac.id, actorId: recepcionId, tipo: "orden.creada", detalle: { ordenId: o.id, numero: o.numero }, creadoEn: o.creado });
    if (o.doctor && !vinculosEq.has(`${o.doctor.id}|${o.pac.id}`) && rng.chance(0.05)) {
      vinculosEq.add(`${o.doctor.id}|${o.pac.id}`);
      A.add("doctorPaciente", { id: `${o.id}-dp`, organizationId: orgId, pacienteId: o.pac.id, doctorId: o.doctor.id, especialidad: o.doctor.especialidad, desde: diaUtc(-o.dia), nota: "Equipo tratante registrado por recepción", creadoPorId: recepcionId });
    }
  }

  for (const o of ordenes) {
    if (!o.estudio) continue;
    const e = o.estudio;
    A.add("estudio", {
      id: e.id, organizationId: orgId, pacienteId: o.pac.id, doctorRemitenteId: o.doctor?.id ?? null, studyInstanceUid: e.studyUid, orthancId: e.orthancId, modalidad: ({ PX: "PX", CEFALO: "DX", IO: "IO", BW: "IO", CBCT: "CT", FACIAL: "OT" } as const)[e.tipo],
      descripcion: e.desc, fechaEstudio: diaUtc(-diaDe(o.cita!.inicio)), ordenId: o.id, superficieKey: e.superficieKey ?? null, estado: o.estado === "TOMADA" ? "ASIGNADO" : "PUBLICADO", creadoEn: enMin(o.cita!.inicio, 20), actualizadoEn: enMin(o.cita!.inicio, 20),
    });
    A.add("evento", { id: `${e.id}-ev`, organizationId: orgId, pacienteId: o.pac.id, actorId: null, tipo: "estudio.vinculado", detalle: { estudioId: e.id, ordenId: o.id, origen: "ingesta" }, creadoEn: enMin(o.cita!.inicio, 21) });
  }
  // Toma de cada estudio atendido (técnico, sala, repeticiones).
  let tomaN = 0;
  for (const o of ordenes) {
    if (o.cita?.estado !== "ATENDIDA") continue;
    tomaN++;
    const rep = rng.chance(0.05) ? 1 : 0;
    A.add("registroToma", { id: `${slug}-toma-${tomaN}`, organizationId: orgId, pacienteId: o.pac.id, estudioId: o.estudio?.id ?? null, ordenId: o.id, tecnicoId: rng.pick(cajeros), salaId: o.cita.salaId, tomadoEn: o.cita.inicio, repeticiones: rep, motivoRepeticion: rep ? "Movimiento del paciente" : null });
  }

  // ---- Informes con PDF ----
  const informadas = ordenes.filter((o) => o.estado === "INFORMADA" || o.estado === "ENTREGADA");
  const config = { nombre: P.def.nombre, direccion: `${P.def.direccion}, ${P.def.ciudad}`, telefono: P.def.telefono, correo: P.def.correo, registro: P.def.registro };
  const logo = (await prisma.configCentro.findUniqueOrThrow({ where: { organizationId: orgId } })).logo;
  const codigos = new Set<string>();
  const informes = informadas.map((o, k) => {
    const tipo = (o.items.find((i) => i.srv.dicom)?.srv.dicom ?? "PX") as TipoDicom;
    const tpl = HALLAZGOS[tipo] ?? HALLAZGOS.PX!;
    const j = rng.int(0, tpl.hallazgos.length - 1);
    let codigo = generarCodigo((m) => rng.int(0, m - 1));
    while (codigos.has(codigo)) codigo = generarCodigo((m) => rng.int(0, m - 1));
    codigos.add(codigo);
    const rad = radiologos[k % radiologos.length]!;
    const emitido = new Date(Math.min(o.creado.getTime() + rng.int(3, 36) * 3600_000, bog(0).getTime() - 3600_000));
    return { o, tipo, id: `${slug}-inf-${k + 1}`, rad, codigo, emitido, hallazgos: tpl.hallazgos[j]!, impresion: tpl.impresion[j % tpl.impresion.length]!, recomendaciones: rng.pick(tpl.recomendaciones) };
  });
  const corregidos = new Set(informes.filter((x) => x.o.dia > 5 && x.o.dia < 120).filter(() => rng.chance(0.02)).map((x) => x.id));
  const cod2s = new Map(informes.filter((x) => corregidos.has(x.id)).map((x) => [x.id, generarCodigo((m) => rng.int(0, m - 1))]));
  const t0 = Date.now();
  const pdfs = await conConcurrencia(informes, 4, async (x) => {
    const base = (version: number, emitido: Date, codigo: string) => ({
      membrete: { ...config, logo },
      paciente: { nombre: x.o.pac.nombre, documento: `${x.o.pac.tipoDoc} ${x.o.pac.doc}`, nacimiento: x.o.pac.nac.toLocaleDateString("es-CO", { timeZone: "UTC" }), edad: calcularEdad(x.o.pac.nac, bog(0)) },
      orden: `#${String(x.o.numero).padStart(4, "0")}`, remitente: x.o.doctor?.nombre ?? null, estudioFecha: fechaLarga(x.o.creado), motivo: x.o.obs ?? "Valoración", tecnica: x.o.items[0]!.srv.tecnica ?? x.o.items[0]!.srv.nombre,
      hallazgos: x.hallazgos, impresion: x.impresion, recomendaciones: x.recomendaciones, alertas: x.o.pac.alertas?.startsWith("Embarazo") ? [x.o.pac.alertas] : [], capturas: [], colorPrimario: P.def.color,
      firmante: { nombre: x.rad.nombre, tarjeta: x.rad.tarjeta }, emitidoEn: fechaLarga(emitido), version, codigo, urlVerificacion: `${URL_BASE()}/verificar/${codigo}`,
    } satisfies DatosPdf);
    const v1 = await generarPdfInforme(base(1, x.emitido, x.codigo));
    let v2: Buffer | null = null, cod2 = "";
    if (corregidos.has(x.id)) { cod2 = cod2s.get(x.id)!; v2 = await generarPdfInforme(base(2, enMin(x.emitido, 60 * 30), cod2)); }
    return { v1, v2, cod2 };
  });
  console.log(`   PDFs de informes: ${informes.length + corregidos.size} en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  informes.forEach((x, k) => {
    const { v1, v2, cod2 } = pdfs[k]!;
    x.o.informeId = x.id;
    const comun = { organizationId: orgId, pacienteId: x.o.pac.id, ordenId: x.o.id, estudioId: x.o.estudio?.id ?? null, motivo: x.o.obs ?? "Valoración", tecnica: x.o.items[0]!.srv.tecnica ?? x.o.items[0]!.srv.nombre, hallazgos: x.hallazgos, impresion: x.impresion, recomendaciones: x.recomendaciones, firmanteId: x.rad.id, firmanteNombre: x.rad.nombre, firmanteTarjeta: x.rad.tarjeta, creadoPorId: x.rad.id, estado: "EMITIDO" };
    A.add("informe", { ...comun, id: x.id, grupoId: x.id, version: 1, vigente: !v2, codigo: x.codigo, pdf: new Uint8Array(v1), emitidoEn: x.emitido, creadoEn: enMin(x.emitido, -120), actualizadoEn: x.emitido });
    A.add("evento", { id: `${x.id}-ev`, organizationId: orgId, pacienteId: x.o.pac.id, actorId: x.rad.id, tipo: "informe.emitido", detalle: { informeId: x.id, version: 1, codigo: x.codigo }, creadoEn: x.emitido });
    if (v2) A.add("informe", { ...comun, id: `${x.id}-v2`, grupoId: x.id, version: 2, vigente: true, codigo: cod2, pdf: new Uint8Array(v2), motivoCorreccion: "Corrección de la lateralidad de un hallazgo", emitidoEn: enMin(x.emitido, 60 * 30), creadoEn: enMin(x.emitido, 60 * 28), actualizadoEn: enMin(x.emitido, 60 * 30) });
  });
  // Borradores en curso (órdenes tomadas recientes sin informe).
  const sinInforme = ordenes.filter((o) => o.estado === "TOMADA" && o.dia <= 10).slice(0, 8);
  sinInforme.forEach((o, k) => {
    const tipo = (o.items.find((i) => i.srv.dicom)?.srv.dicom ?? "PX") as TipoDicom;
    const tpl = HALLAZGOS[tipo] ?? HALLAZGOS.PX!;
    const rad = radiologos[k % radiologos.length]!;
    A.add("informe", { id: `${slug}-bor-${k + 1}`, organizationId: orgId, grupoId: `${slug}-bor-${k + 1}`, version: 1, vigente: true, estado: "BORRADOR", pacienteId: o.pac.id, ordenId: o.id, estudioId: o.estudio?.id ?? null, motivo: o.obs, tecnica: o.items[0]!.srv.tecnica, hallazgos: tpl.hallazgos[0]!, impresion: k % 2 ? "" : tpl.impresion[0]!, creadoPorId: rad.id, creadoEn: enMin(o.creado, 60 * 8), actualizadoEn: enMin(o.creado, 60 * 9) });
  });

  // ---- Entregas con enlace ----
  informes.filter((x) => x.o.estado === "ENTREGADA" && x.o.dia < 120 && rng.chance(0.4)).forEach((x, k) => {
    const creado = enMin(x.emitido, 90);
    const paraDoctor = !!x.o.doctor && rng.chance(0.3);
    const vigente = creado.getTime() + 30 * DIA > bog(0).getTime();
    const bloqueado = rng.chance(0.04);
    const visto = rng.chance(vigente ? 0.35 : 0.7);
    A.add("enlaceEntrega", {
      id: `${slug}-ent-${k + 1}`, organizationId: orgId, pacienteId: x.o.pac.id, informeId: x.id, estudioUids: x.o.estudio ? [x.o.estudio.studyUid] : [], destinatarioTipo: paraDoctor ? "DOCTOR" : "PACIENTE",
      destinatarioNombre: paraDoctor ? x.o.doctor!.nombre : x.o.pac.nombre, destinatarioCorreo: null, tokenHash: hashFicticio(`${slug}-ent-${k}`), codigoHash: hashFicticio(`${slug}-cod-${k}`),
      intentosFallidos: bloqueado ? 5 : 0, venceEn: new Date(creado.getTime() + 30 * DIA), revocadoEn: !bloqueado && rng.chance(0.05) ? enMin(creado, 600) : null,
      accesos: visto ? rng.int(1, 5) : 0, ultimoAccesoEn: visto ? enMin(creado, rng.int(30, 60 * 40)) : null, creadoPorId: recepcionId, creadoEn: creado,
    });
  });

  // ---- Facturación y cartera ----
  const docs: DocFactura[] = [];
  for (const o of ordenes) {
    if (!["TOMADA", "INFORMADA", "ENTREGADA"].includes(o.estado)) continue;
    const aCargo = !o.convenio && o.doctor && rng.chance(0.22);
    docs.push({
      id: `${slug}-fac-${o.numero}`, fecha: enMin(o.creado, 30), pacienteId: o.pac.id, ordenId: o.id,
      items: o.items.map((i) => ({ descripcion: i.srv.nombre, valorUnitario: i.precio, servicioId: i.servicioId })),
      responsable: o.convenio ? "CONVENIO" : aCargo ? "DOCTOR" : "PACIENTE", responsableId: aCargo ? o.doctor!.id : null, convenio: o.convenio,
    });
  }
  // Anticipos: los aplicados se ligan a una cuenta pagada con medio ANTICIPO.
  const fac = facturar(A, { orgId, rng, docs, cajeros, admin });
  caja(A, { orgId, rng, pagos: fac.pagos, dias: P.cajaDias, cajero: cajeros[0]!, admin, egresosPorDia: (d) => (d % 9 === 0 ? [{ categoria: "Insumos", descripcion: "Compra de insumos de bioseguridad", valor: 85000 + (d % 5) * 15000, medio: "EFECTIVO" }] : []) });
  egresosMensuales(A, { orgId, rng, meses: Math.round(P.histDias / 30), escala: P.esGrande ? 1 : 0.55, admin });
  // Anticipos de pacientes con cita futura (disponibles), uno aplicado, uno reembolsado y uno anulado.
  const conCitaFutura = ordenes.filter((o) => o.cita && o.cita.inicio > bog(0) && o.estado === "AGENDADA").slice(0, 6);
  const estAnt = ["DISPONIBLE", "DISPONIBLE", "DISPONIBLE", "REEMBOLSADO", "ANULADO", "RETENIDO"] as const;
  conCitaFutura.forEach((o, k) => {
    const estado = estAnt[k % estAnt.length]!;
    A.add("anticipo", {
      id: `${slug}-ant-${k + 1}`, organizationId: orgId, estado, pacienteId: o.pac.id, citaId: o.cita!.id, valor: 50000, valorAplicado: 0, medio: "TRANSFERENCIA", referencia: `TRF-${100200 + k}`, reembolsable: true, horasLimiteReembolso: 24, retieneSiNoAsiste: true,
      motivo: estado === "REEMBOLSADO" ? "El paciente canceló con más de 24 horas" : estado === "ANULADO" ? "Registrado por error" : estado === "RETENIDO" ? "No asistió: se retiene según la política" : null,
      resueltoEn: estado === "DISPONIBLE" ? null : bog(-1, 11), registradoPorId: recepcionId, creadoEn: bog(-2, 15),
    });
  });

  // ---- Seguimiento de pacientes ----
  const mesObj = new Date(Date.UTC(diaUtc(0).getUTCFullYear(), diaUtc(0).getUTCMonth(), 1));
  const mesSig = new Date(Date.UTC(diaUtc(0).getUTCFullYear(), diaUtc(0).getUTCMonth() + 1, 1));
  const elegir = (f: (o: Ord) => boolean, n: number) => rng.shuffle(ordenes.filter(f)).slice(0, n);
  const segs: [Ord, string, string, string, Date, number][] = [
    ...elegir((o) => o.estado === "INFORMADA" && o.dia > 7, 5).map((o) => [o, "ENTREGA_PENDIENTE", "NORMAL", rng.pick(["PENDIENTE", "SIN_RESPUESTA", "PENDIENTE"]), mesObj, rng.int(0, 2)] as [Ord, string, string, string, Date, number]),
    ...elegir((o) => o.estado === "ENTREGADA" && o.dia > 120 && o.dia < 200, 5).map((o) => [o, "CONTROL", rng.pick(["ALTA", "NORMAL", "BAJA"]), rng.pick(["PENDIENTE", "AGENDADO", "PENDIENTE", "DECLINO"]), mesObj, rng.int(0, 2)] as [Ord, string, string, string, Date, number]),
    ...elegir((o) => o.estado === "CANCELADA", 3).map((o) => [o, "ESTUDIO_SIN_TOMAR", "NORMAL", "PENDIENTE", mesObj, 0] as [Ord, string, string, string, Date, number]),
    ...elegir((o) => o.estado === "ENTREGADA" && o.dia > 20, 2).map((o) => [o, "REPETICION", "ALTA", "COMPLETADO", mesObj, 1] as [Ord, string, string, string, Date, number]),
    ...elegir((o) => o.estado === "ENTREGADA" && o.dia > 100, 2).map((o) => [o, "CONTROL", "BAJA", "PENDIENTE", mesSig, 0] as [Ord, string, string, string, Date, number]),
  ];
  segs.forEach(([o, motivo, prioridad, estado, mes, intentos], k) => {
    const id = `${slug}-seg-${k + 1}`;
    A.add("seguimiento", { id, organizationId: orgId, pacienteId: o.pac.id, motivo, prioridad, estado, mesObjetivo: mes, nota: motivo === "REPETICION" ? "Se repitió la toma por movimiento del paciente" : null, ordenId: o.id, intentos, ultimoIntentoEn: intentos ? bog(-rng.int(1, 6), 11) : null, completadoEn: estado === "COMPLETADO" ? bog(-2, 10) : null, creadoPorId: recepcionId, creadoEn: bog(-rng.int(5, 20), 9) });
    for (let i = 0; i < intentos; i++) A.add("intentoContacto", { id: `${id}-in${i}`, organizationId: orgId, seguimientoId: id, canal: rng.pick(["TELEFONO", "WHATSAPP"]), resultado: rng.pick(["SIN_RESPUESTA", "BUZON"]), creadoPorId: recepcionId, creadoEn: bog(-rng.int(1, 8), 10 + i) });
  });

  // ---- Seguimiento de doctores (semáforo variado con gestiones coherentes) ----
  const gest: Record<string, { estado: string; motivo: string }[]> = {
    EN_RIESGO: [{ estado: "PENDIENTE", motivo: "CAIDA_FRECUENCIA" }, { estado: "CONTACTADO", motivo: "CAIDA_FRECUENCIA" }],
    INACTIVO: [{ estado: "PROGRAMADO", motivo: "SIN_REMISIONES" }], CRITICO: [{ estado: "PENDIENTE", motivo: "SIN_REMISIONES" }], NUEVO: [{ estado: "CONTACTADO", motivo: "NUEVO" }],
    ACTIVO: [{ estado: "RECUPERADO", motivo: "SIN_REMISIONES" }],
  };
  const vistos = new Map<string, number>();
  let segDocN = 0;
  for (const d of doctores) {
    const i = vistos.get(d.semaforo) ?? 0;
    vistos.set(d.semaforo, i + 1);
    if (d.semaforo === "ACTIVO" && i > 0) continue;
    const gs = gest[d.semaforo]!;
    const gestion = gs[i % gs.length]!;
    const id = `${slug}-sd-${++segDocN}`;
    const cerrado = gestion.estado === "RECUPERADO";
    A.add("seguimientoDoctor", { id, organizationId: orgId, doctorId: d.id, estado: gestion.estado, motivo: gestion.motivo, responsableId: admin, proximoContacto: !cerrado && gestion.estado !== "PENDIENTE" ? bog(rng.int(2, 9), 9) : null, nota: cerrado ? "Retomó las remisiones tras la visita" : `Seguimiento comercial (${d.semaforo.toLowerCase().replace("_", " ")})`, creadoEn: d.semaforo === "NUEVO" ? bog(-2, 9) : bog(-rng.int(8, 25), 9), cerradoEn: cerrado ? bog(-3, 10) : null });
    const contactos = gestion.estado === "PENDIENTE" ? 0 : rng.int(1, 3);
    for (let c = 0; c < contactos; c++) A.add("contactoDoctor", { id: `${id}-c${c}`, organizationId: orgId, doctorId: d.id, seguimientoId: id, canal: rng.pick(["LLAMADA", "VISITA", "WHATSAPP", "CORREO"]), resultado: rng.pick(["Se compromete a remitir la próxima semana", "Solicita información de tarifas", "No contestó, se reintenta", "Visita realizada, entrega de material"]), nota: null, fecha: bog(-rng.int(1, 18), rng.int(8, 16)), registradoPorId: admin });
  }

  // ---- Integraciones: estaciones, token API, webhook y conectores (todo inactivo o de solo lectura) ----
  await prisma.estacionIngesta.createMany({ data: [
    { id: `${slug}-est-1`, organizationId: orgId, nombre: "Recepción · PC Panorámico", tokenHash: hashFicticio(`${slug}-estacion-1`), activa: true, ultimoContacto: new Date(Date.now() - 4 * 60_000), creadoPorId: admin, creadoEn: bog(-200) },
    { id: `${slug}-est-2`, organizationId: orgId, nombre: "Sala CBCT · PC Tomógrafo", tokenHash: hashFicticio(`${slug}-estacion-2`), activa: true, ultimoContacto: new Date(Date.now() - 3 * DIA), creadoPorId: admin, creadoEn: bog(-150) },
  ] });
  const tok = generarTokenApi();
  await prisma.tokenApi.create({ data: { id: `${slug}-tok-1`, organizationId: orgId, nombre: "Lectura para el sistema de gestión (solo lectura)", prefijo: tok.prefijo, tokenHash: tok.tokenHash, permisos: SOLO_LECTURA, vence: bog(180), ultimoUso: bog(-2, 9), creadoPorId: admin, creadoEn: bog(-60) } });
  await prisma.webhook.create({ data: { id: `${slug}-wh-1`, organizationId: orgId, nombre: "Aviso de estudios recibidos (ejemplo, desactivado)", url: "https://hooks.ejemplo.invalid/dent-view/estudios", secretoCifrado: cifrar(generarSecreto(), env.secreto), eventos: ["estudio.recibido", "informe.emitido"], activo: false, creadoPorId: admin } });
  await prisma.integracion.createMany({ data: [
    { id: `${slug}-int-1`, organizationId: orgId, proveedor: "dentalink", nombre: "Dentalink (ejemplo sin conectar)", credencialesCifradas: cifrar(JSON.stringify({ token: "ejemplo-no-valido" }), env.secreto), activa: false, creadoPorId: admin },
    { id: `${slug}-int-2`, organizationId: orgId, proveedor: "simulado", nombre: "Conector simulado (pruebas)", credencialesCifradas: cifrar(JSON.stringify({ codigo: "demo" }), env.secreto), activa: false, creadoPorId: admin },
  ] });

  // ---- Mensajes históricos, plantillas y protección de datos ----
  mensajesHistoricos(A, { orgId, slug, rng, n: P.mensajes, pacientes: pacs, dias: Math.min(90, P.histDias), centro: P.def.nombre });
  consentimientos(A, { orgId, slug, rng, pacientes: pacs, solicitudes: P.solicitudes });

  // Tras volcar las filas: RIPS ya generados (JSON en S3 + EnvioRips) para unas pocas órdenes completas, con el mismo código que usa la app.
  const despues = async () => {
    let n = 0;
    for (const o of [...ordenes].reverse()) {
      if (n >= 8) break;
      if (o.estado !== "ENTREGADA" && o.estado !== "INFORMADA") continue;
      if ((await generarYGuardarRips({ organizationId: orgId, actorId: admin, ordenId: o.id })).estado === "ok") n++;
    }
    log(`  ${slug}: ${n} RIPS generados (JSON en S3).`);
  };
  const doctoresResumen = doctores.map((d) => ({ nombre: d.nombre, semaforo: d.semaforo, ordenes: ordenes.filter((o) => o.doctor?.id === d.id && o.estado !== "CANCELADA").length }));
  return { A, org, planes, despues, doctoresResumen, resumen: { ordenes: ordenes.length, informes: informes.length + corregidos.size, estudiosDicom: planes.length, facturas: docs.length, notasCredito: fac.ncs, citas: citaRows.length } };
}
