// Orion Laboratorio Dental: laboratorio de prótesis que atiende a odontólogos clientes. Cada trabajo es una orden + un caso de laboratorio.
// EstadoLab del esquema solo tiene 5 valores; la etapa fina (diseño, proceso, prueba, repetir) va en las notas del caso.
import { prisma } from "@dent-view/db";
import { resolverPrecio } from "../../src/lib/precios";
import { CATALOGO_ORION } from "./catalogos";
import { DEF } from "./centros";
import { Acum, asegurarMiembro, caja, consentimientos, crearCentro, crearUsuarios, egresosMensuales, facturar, mensajesHistoricos, type DefUsuario, type DocFactura } from "./nucleo";
import { crearPacientes, registrarPacientes } from "./pacientes";
import { bog, crearAgendador, crearRng, DIA, diaSemana, diaUtc, enMin, type Entorno, type Persona } from "./util";

type Etapa = "recibido" | "diseno" | "proceso" | "prueba" | "terminado" | "entregado" | "repetir" | "cancelado";
const ETAPA_LAB: Record<Etapa, { lab: "PENDIENTE" | "ENVIADO" | "RECIBIDO" | "ENTREGADO" | "CANCELADO"; orden: "SOLICITADA" | "AGENDADA" | "TOMADA" | "INFORMADA" | "ENTREGADA" | "CANCELADA"; texto: string }> = {
  recibido: { lab: "PENDIENTE", orden: "SOLICITADA", texto: "Recibido, en revisión de la prescripción" },
  diseno: { lab: "PENDIENTE", orden: "AGENDADA", texto: "En diseño CAD" },
  proceso: { lab: "ENVIADO", orden: "AGENDADA", texto: "En proceso (fresado, sinterizado o encerado)" },
  prueba: { lab: "ENVIADO", orden: "TOMADA", texto: "En prueba en boca" },
  terminado: { lab: "RECIBIDO", orden: "INFORMADA", texto: "Terminado, listo para entregar" },
  entregado: { lab: "ENTREGADO", orden: "ENTREGADA", texto: "Entregado al odontólogo" },
  repetir: { lab: "PENDIENTE", orden: "AGENDADA", texto: "REPETIR: ajuste solicitado por el odontólogo" },
  cancelado: { lab: "CANCELADO", orden: "CANCELADA", texto: "Cancelado por el cliente" },
};
const PLANTA: Record<string, string> = { corona: "Planta de cerámica", carilla: "Planta de cerámica", puente: "Planta de cerámica", incrust: "Planta de cerámica", total: "Planta de acrílicos", parcial: "Planta de acrílicos", guarda: "Planta de acrílicos", modelo: "Centro de impresión 3D", guía: "Centro de impresión 3D", provisional: "Centro de impresión 3D", retenedor: "Planta de acrílicos", pilar: "Planta de implantes" };
const plantaDe = (n: string) => PLANTA[Object.keys(PLANTA).find((k) => n.toLowerCase().includes(k)) ?? ""] ?? "Planta Orion";
const DIAS_PRODUCCION = (n: string) => (/modelo|provisional/i.test(n) ? 2 : /guarda|retenedor/i.test(n) ? 4 : /total|parcial|puente/i.test(n) ? 10 : /gu[ií]a/i.test(n) ? 3 : 6);

export async function construirOrion(env: Entorno, hash: string, g: { nombre: () => Persona; documento: () => string; superId: string }, soloBasico = false) {
  const D = DEF["orion-laboratorio"];
  const slug = D.slug;
  const rng = crearRng(`lab:${slug}`);
  const A = new Acum();
  const org = await crearCentro(D);
  const orgId = org.id;
  const clientes: { nombre: string; email: string; esp: string; ciudad: string; peso: number; plan: number }[] = [
    { nombre: "Dra. Mónica Valencia Jaramillo", email: "monica.valencia@orion-laboratorio.ejemplo.invalid", esp: "Rehabilitación oral", ciudad: "Medellín", peso: 4, plan: 0 },
    { nombre: "Dr. Rodrigo Mesa Cano", email: "rodrigo.mesa@orion-laboratorio.ejemplo.invalid", esp: "Odontología general", ciudad: "Envigado", peso: 3.2, plan: 0 },
    { nombre: "Dra. Lorena Zapata Ruiz", email: "lorena.zapata@orion-laboratorio.ejemplo.invalid", esp: "Prostodoncia", ciudad: "Medellín", peso: 2.6, plan: 1 },
    { nombre: "Dr. Iván Correa Osorio", email: "ivan.correa@orion-laboratorio.ejemplo.invalid", esp: "Implantología", ciudad: "Sabaneta", peso: 2, plan: 1 },
    { nombre: "Dra. Paula Agudelo Vélez", email: "paula.agudelo@orion-laboratorio.ejemplo.invalid", esp: "Estética dental", ciudad: "Itagüí", peso: 1.4, plan: 2 },
    { nombre: "Dr. Samuel Henao Muñoz", email: "samuel.henao@orion-laboratorio.ejemplo.invalid", esp: "Odontología general", ciudad: "Bello", peso: 1, plan: 2 },
  ];
  const usuarios: DefUsuario[] = [
    { email: `admin@${slug}.ejemplo.invalid`, nombre: "Carolina Escobar Duque", rol: "admin_tenant" },
    { email: `tecnico1@${slug}.ejemplo.invalid`, nombre: "Jhon Fredy Tobón Rendón", rol: "recepcion" },
    { email: `tecnico2@${slug}.ejemplo.invalid`, nombre: "Daniela Patiño Giraldo", rol: "recepcion" },
    ...clientes.map((c, i) => ({ email: c.email, nombre: c.nombre, rol: "doctor_remitente", perfil: { tarjeta: `TP-${52000 + i * 211}`, especialidad: c.esp, telefono: `31${i}5550${300 + i}`, consultorio: `Consultorio ${201 + i}, ${c.ciudad}` } })),
  ];
  const uid = await crearUsuarios(orgId, usuarios, hash);
  await asegurarMiembro(orgId, g.superId, "admin_tenant");
  if (soloBasico) return null;
  const admin = uid.get(`admin@${slug}.ejemplo.invalid`)!;
  const tecnicos = [uid.get(`tecnico1@${slug}.ejemplo.invalid`)!, uid.get(`tecnico2@${slug}.ejemplo.invalid`)!];
  const cli = clientes.map((c) => ({ ...c, id: uid.get(c.email)! }));

  // ---- Catálogo, sala de pruebas, convenios por volumen y tarifas por cliente ----
  const servicios = CATALOGO_ORION.map((s, i) => ({ ...s, id: `${slug}-srv-${i + 1}` }));
  await prisma.servicio.createMany({ data: servicios.map((s) => ({ id: s.id, organizationId: orgId, categoria: s.categoria, nombre: s.nombre, precioImpreso: null, precioDigital: s.digital, descuento: 0, duracionMin: 30 })) });
  const sala = `${slug}-sala-1`;
  await prisma.sala.create({ data: { id: sala, organizationId: orgId, nombre: "Atención a clientes (pruebas y entregas)", color: "violet" } });
  await prisma.configFinanzas.create({ data: { organizationId: orgId } });
  const planes = [
    { id: `${slug}-conv-1`, nombre: "Plan Volumen Oro (más de 20 trabajos al mes)", nit: "900.555.701-1", contacto: "Cuenta clave · 604 555 0201", descuento: 15 },
    { id: `${slug}-conv-2`, nombre: "Plan Volumen Plata (10 a 20 trabajos al mes)", nit: "900.555.702-2", contacto: "Cuenta clave · 604 555 0202", descuento: 10 },
    { id: `${slug}-conv-3`, nombre: "Consultorios aliados", nit: "900.555.703-3", contacto: "Comercial · 604 555 0203", descuento: 5 },
  ];
  await prisma.convenio.createMany({ data: planes.map((p) => ({ id: p.id, organizationId: orgId, nombre: p.nombre, nit: p.nit, contacto: p.contacto, descuentoGeneral: p.descuento, activo: true, vigenteDesde: diaUtc(-300) })) });
  const tarifaDoc = new Map<string, Map<string, number>>();
  const tarifas: Record<string, unknown>[] = [];
  cli.slice(0, 3).forEach((c, di) => {
    const m = new Map<string, number>();
    [1, 4, 16].forEach((si, k) => {
      const s = servicios[si]!;
      const precio = Math.round((s.digital! * (0.9 - di * 0.02)) / 1000) * 1000;
      m.set(s.id, precio);
      tarifas.push({ id: `${slug}-td-${di}-${k}`, organizationId: orgId, servicioId: s.id, doctorId: c.id, precioImpreso: null, precioDigital: precio });
    });
    tarifaDoc.set(c.id, m);
  });
  await prisma.tarifaEspecial.createMany({ data: tarifas as never });

  // ---- Pacientes de los odontólogos clientes ----
  const pacs = crearPacientes({ slug, rng, n: 70, nombre: g.nombre, documento: g.documento, ciudad: "Medellín", menores: 4 });

  // ---- 440 trabajos: orden + caso de laboratorio, con fechas y vencimientos coherentes ----
  const etapaPorEdad = (edad: number): Etapa =>
    edad > 28 ? rng.weighted<Etapa>(["entregado", "repetir", "cancelado"], [93, 2, 5])
      : edad > 12 ? rng.weighted<Etapa>(["entregado", "terminado", "prueba", "proceso", "repetir"], [56, 18, 10, 11, 5])
      : edad > 4 ? rng.weighted<Etapa>(["proceso", "prueba", "terminado", "diseno", "entregado", "repetir"], [30, 18, 20, 14, 14, 4])
      : rng.weighted<Etapa>(["recibido", "diseno", "proceso"], [40, 40, 20]);
  const HIST = 210; // siete meses: los reportes comparan periodos y necesitan un volumen parejo antes del mes en curso
  const dias = Array.from({ length: HIST }, (_, i) => i + 1);
  const pesoDia = (d: number) => (diaSemana(-d) === 7 ? 0.02 : diaSemana(-d) === 6 ? 0.4 : 1) * (0.65 + 0.35 * (1 - d / HIST));
  type Trabajo = { n: number; cli: (typeof cli)[number]; pac: (typeof pacs)[number]; srv: (typeof servicios)[number]; dientes: string; recibido: Date; esperada: Date; terminado: Date | null; etapa: Etapa; precio: number; conv: (typeof planes)[number] };
  const trabajos: Trabajo[] = [];
  const N = 440;
  const dienteTxt = () => rng.pick(["36", "46", "11", "21", "14", "24", "37", "13-23", "34-36", "44-46", "16", "26", "47"]);
  // Trabajos en curso fijados a propósito (todas las etapas visibles), nueve atrasados y el resto histórico ya entregado.
  const forzados: [Etapa, number, number, number][] = [["recibido", 1, 2, 4], ["diseno", 1, 4, 6], ["proceso", 2, 9, 7], ["prueba", 4, 12, 5], ["terminado", 5, 14, 5], ["repetir", 8, 30, 3]];
  const cola = forzados.flatMap(([e, a, b, n]) => Array.from({ length: n }, () => ({ e, a, b, atrasado: false })));
  for (let i = 0; i < 9; i++) cola.push({ e: rng.pick<Etapa>(["proceso", "prueba", "diseno"]), a: 8, b: 20, atrasado: true });
  const historicos = dias.filter((d) => d > 20); // los trabajos de las últimas tres semanas son los "en curso" de arriba (si no, el último mes se dispara en los reportes)
  const pesosHist = historicos.map(pesoDia);
  for (let i = 0; i < N; i++) {
    const f = cola[i];
    const edad = f ? rng.int(f.a, f.b) : rng.weighted(historicos, pesosHist);
    const c = rng.weighted(cli, cli.map((x) => x.peso));
    const srv = rng.weighted(servicios, servicios.map((s) => s.peso));
    const recibido = bog(-edad, rng.int(8, 16), rng.int(0, 59));
    const lead = DIAS_PRODUCCION(srv.nombre);
    const etapa = f ? f.e : etapaPorEdad(edad);
    const esperada = f ? (f.atrasado ? bog(-rng.int(1, 5), 12) : bog(rng.int(1, 6), 12)) : new Date(recibido.getTime() + lead * DIA);
    const terminado = ["terminado", "entregado", "prueba"].includes(etapa) ? new Date(Math.min(recibido.getTime() + (lead - 1) * DIA, bog(-1).getTime())) : null;
    const conv = planes[c.plan]!;
    const r = resolverPrecio({ servicio: { precioImpreso: null, precioDigital: srv.digital, descuento: 0 }, entrega: "DIGITAL", tarifaDoctor: tarifaDoc.get(c.id)?.get(srv.id) ? { precioImpreso: null, precioDigital: tarifaDoc.get(c.id)!.get(srv.id)! } : null, convenio: { activo: true, descuentoGeneral: conv.descuento, vigenteDesde: null, vigenteHasta: null, tarifa: null }, fecha: new Date(recibido.getTime() - 5 * 3600_000).toISOString().slice(0, 10) });
    trabajos.push({ n: 0, cli: c, pac: pacs[i % pacs.length]!, srv, dientes: dienteTxt(), recibido, esperada, terminado, etapa, precio: r.precio ?? srv.digital!, conv });
  }
  trabajos.sort((a, b) => a.recibido.getTime() - b.recibido.getTime()).forEach((t, i) => { t.n = i + 1; });
  const esperaPrimero = (t: Trabajo) => t.recibido;
  pacs.forEach((p) => {
    const suyos = trabajos.filter((t) => t.pac === p);
    p.creadoEn = suyos.length ? enMin(esperaPrimero(suyos[0]!), -rng.int(0, 400)) : bog(-60);
    const ult = suyos.filter((t) => t.etapa === "entregado").pop();
    p.ultimaVisitaEn = ult ? ult.esperada : null;
  });
  registrarPacientes(A, { orgId, slug, pacientes: pacs, actor: admin });

  const docs: DocFactura[] = [];
  trabajos.forEach((t) => {
    const oid = `${slug}-ord-${t.n}`;
    const e = ETAPA_LAB[t.etapa];
    A.add("orden", { id: oid, organizationId: orgId, numero: t.n, pacienteId: t.pac.id, doctorRemitenteId: t.cli.id, estado: e.orden, entrega: "DIGITAL", convenioId: t.conv.id, observaciones: `${e.texto} · Dientes ${t.dientes}`, creadoPorId: tecnicos[t.n % 2], creadoEn: t.recibido, actualizadoEn: t.recibido });
    A.add("ordenItem", { id: `${oid}-i1`, ordenId: oid, servicioId: t.srv.id, nombre: t.srv.nombre, opciones: `Dientes ${t.dientes}`, precio: t.precio, descuento: 0 });
    A.add("casoLaboratorio", {
      id: `${slug}-caso-${t.n}`, organizationId: orgId, pacienteId: t.pac.id, ordenId: oid, laboratorio: plantaDe(t.srv.nombre), tipo: t.srv.nombre, dientes: t.dientes, valor: t.precio, estado: e.lab, enviado: t.recibido,
      entregaEsperada: t.esperada, recibido: t.terminado && (t.etapa === "terminado" || t.etapa === "entregado") ? t.terminado : null,
      notas: `OT-${String(t.n).padStart(4, "0")} · Cliente: ${t.cli.nombre} · Etapa: ${e.texto}`, creadoEn: t.recibido,
    });
    A.add("evento", { id: `${oid}-ev`, organizationId: orgId, pacienteId: t.pac.id, actorId: tecnicos[t.n % 2], tipo: "orden.creada", detalle: { ordenId: oid, numero: t.n }, creadoEn: t.recibido });
    if (t.etapa === "terminado" || t.etapa === "entregado") {
      docs.push({ id: `${slug}-fac-${t.n}`, fecha: new Date(Math.min((t.terminado ?? t.recibido).getTime() + 3600_000, bog(-1).getTime())), pacienteId: t.pac.id, ordenId: oid, items: [{ descripcion: `${t.srv.nombre} · ${t.pac.nombre} · diente(s) ${t.dientes}`, valorUnitario: t.precio, servicioId: t.srv.id }], responsable: "DOCTOR", responsableId: t.cli.id });
    }
  });

  // ---- Agenda de pruebas y entregas (alimenta las gráficas de citas) ----
  const agendar = crearAgendador();
  let cn = 0;
  const conPrueba = trabajos.filter((t) => ["prueba", "terminado", "entregado"].includes(t.etapa));
  for (const t of conPrueba.filter((_, i) => i % 2 === 0)) {
    const dia = Math.min(-1, Math.round((t.esperada.getTime() - bog(0).getTime()) / DIA));
    const min = agendar("s", dia, 30, rng.int(8 * 60, 16 * 60));
    if (min === null) continue;
    const inicio = bog(dia, 0, min);
    A.add("cita", { id: `${slug}-cita-${++cn}`, organizationId: orgId, salaId: sala, pacienteId: t.pac.id, ordenId: `${slug}-ord-${t.n}`, inicio, fin: enMin(inicio, 30), estado: rng.weighted(["ATENDIDA", "NO_ASISTIO", "CANCELADA"], [88, 7, 5]), origen: "INTERNA", notas: `Prueba/entrega: ${t.srv.nombre}`, creadoEn: enMin(inicio, -1440 * 2) });
  }
  const futuros = trabajos.filter((t) => ["proceso", "diseno", "prueba", "repetir"].includes(t.etapa) && t.esperada >= bog(0)).slice(0, 14);
  futuros.forEach((t, i) => {
    const dia = Math.min(14, Math.max(0, Math.round((t.esperada.getTime() - bog(0).getTime()) / DIA)) + (diaSemana(Math.round((t.esperada.getTime() - bog(0).getTime()) / DIA)) === 7 ? 1 : 0));
    const min = agendar("s", dia, 30, 9 * 60 + i * 20);
    if (min === null) return;
    const inicio = bog(dia, 0, min);
    A.add("cita", { id: `${slug}-cita-${++cn}`, organizationId: orgId, salaId: sala, pacienteId: t.pac.id, ordenId: `${slug}-ord-${t.n}`, inicio, fin: enMin(inicio, 30), estado: i < 4 ? "CONFIRMADA" : "PROGRAMADA", origen: "INTERNA", notas: `Entrega programada: ${t.srv.nombre}`, creadoEn: bog(-1, 9) });
  });

  // ---- Facturación por cliente-odontólogo (a crédito, con tramos de cartera) ----
  const fac = facturar(A, { orgId, rng, docs, cajeros: tecnicos, admin, probAbierta: (e) => (e <= 30 ? 0.36 : e <= 60 ? 0.28 : e <= 90 ? 0.2 : e <= 150 ? 0.1 : 0.04) });
  caja(A, { orgId, rng, pagos: fac.pagos, dias: 40, cajero: tecnicos[0]!, admin });
  egresosMensuales(A, { orgId, rng, meses: 6, escala: 0.9, admin });

  // ---- Seguimiento de pacientes/trabajos ----
  const mes = new Date(Date.UTC(diaUtc(0).getUTCFullYear(), diaUtc(0).getUTCMonth(), 1));
  trabajos.filter((t) => t.etapa === "terminado").slice(0, 6).forEach((t, i) => A.add("seguimiento", { id: `${slug}-seg-${i + 1}`, organizationId: orgId, pacienteId: t.pac.id, motivo: "ENTREGA_PENDIENTE", prioridad: i < 2 ? "ALTA" : "NORMAL", estado: "PENDIENTE", mesObjetivo: mes, nota: `Coordinar la entrega de ${t.srv.nombre} al ${t.cli.nombre}`, ordenId: `${slug}-ord-${t.n}`, creadoPorId: admin, creadoEn: bog(-2, 9) }));
  trabajos.filter((t) => t.etapa === "repetir").slice(0, 4).forEach((t, i) => A.add("seguimiento", { id: `${slug}-seg-r${i + 1}`, organizationId: orgId, pacienteId: t.pac.id, motivo: "REPETICION", prioridad: "ALTA", estado: "PENDIENTE", mesObjetivo: mes, nota: "Repetición solicitada por el odontólogo", ordenId: `${slug}-ord-${t.n}`, creadoPorId: admin, creadoEn: bog(-3, 9) }));

  mensajesHistoricos(A, { orgId, slug, rng, n: 40, pacientes: pacs, dias: 90, centro: D.nombre });
  consentimientos(A, { orgId, slug, rng, pacientes: pacs, solicitudes: 4 });
  const porEtapa = trabajos.reduce<Record<string, number>>((m, t) => ((m[t.etapa] = (m[t.etapa] ?? 0) + 1), m), {});
  return { A, org, planes: [] as never[], resumen: { trabajos: trabajos.length, porEtapa, facturas: docs.length, atrasados: trabajos.filter((t) => ["PENDIENTE", "ENVIADO"].includes(ETAPA_LAB[t.etapa].lab) && t.esperada < bog(0)).length } };
}
