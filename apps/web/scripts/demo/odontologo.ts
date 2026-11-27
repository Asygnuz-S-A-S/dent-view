// Consultorio de un odontólogo particular (Alejandro Restrepo): pacientes con foto, historia clínica, odontograma, plan, agenda, cuentas de cobro,
// laboratorio, valoraciones virtuales, CRM, presupuestos y estudios para el visor.
import { prisma } from "@dent-view/db";
import { fechaHoraCompleta } from "../../src/lib/fechas";
import { PLANTILLAS_SECUENCIA } from "../../src/lib/crm";
import { CATALOGO_ALEJANDRO, cupsDe, tipoRipsDe } from "./catalogos";
import { digitoVerificacionNit } from "../../src/lib/fe/dian";
import { generarYGuardarRips } from "../../src/lib/rips/servicio";
import { generarCodigoAcceso, generarToken, hashCodigo, hashToken } from "../../src/lib/entrega";
import { hashIp, hashTexto } from "../../src/lib/presupuestos-hash";
import { textoAceptacion, TEXTO_ACEPTACION_VERSION } from "../../src/lib/presupuestos";
import { evolutivos } from "./evolutivos";
import { DEF } from "./centros";
import { asegurarMiembro, Acum, consentimientos, crearCentro, crearUsuarios, egresosMensuales, facturar, fotoPerfilKey, mensajesHistoricos, type DocFactura } from "./nucleo";
import { crearPacientes, historiaClinica, registrarPacientes } from "./pacientes";
import { fechaDicom, nombreDicom, planEstudio, uidEstudio, type PlanEstudio } from "./estudios";
import { subirS3 } from "./externos";
import { COTIZADAS, sembrarValoraciones } from "./valoraciones";
import { bog, conConcurrencia, crearAgendador, crearRng, diaSemana, diaUtc, enMin, hashFicticio, log, type Entorno, type Persona } from "./util";

const DIENTES = [...[1, 2, 3, 4].flatMap((c) => [1, 2, 3, 4, 5, 6, 7, 8].map((d) => c * 10 + d))];
const SUPERFICIES = ["M", "D", "O", "V", "L"];
const CONDICIONES = ["caries", "restauracion", "corona", "endodoncia", "implante", "ausente"] as const;
const NOTAS: Record<string, string[]> = {
  default: ["Paciente asiste a control. Sin molestias. Se refuerza técnica de cepillado.", "Se realiza procedimiento sin complicaciones, anestesia local infiltrativa. Indicaciones postoperatorias entregadas.", "Evolución satisfactoria. Se programa control en 15 días."],
  Resina: ["Aislamiento relativo, remoción de caries, adhesivo y resina compuesta. Ajuste oclusal y pulido.", "Restauración en resina fotocurada, sin sensibilidad referida al finalizar."],
  Endodoncia: ["Apertura cameral, conductometría y preparación biomecánica. Medicación intraconducto con hidróxido de calcio.", "Obturación de conductos con técnica de condensación lateral. Control radiográfico satisfactorio."],
  Profilaxis: ["Profilaxis y detartraje supragingival. Control de placa con revelador. Se entrega kit de higiene."],
  Consulta: ["Examen clínico y radiográfico. Se explica el plan de tratamiento y se entrega presupuesto."],
  Implante: ["Colocación de implante con torque de inserción de 35 Ncm. Sutura y recomendaciones. Control en 8 días."],
};
const ORIGENES = ["WEB", "REFERIDO", "REDES", "LLAMADA", "WHATSAPP", "DOCTOR", "VALORACION_VIRTUAL", "OTRO"];
const INTERESES = ["Blanqueamiento", "Ortodoncia", "Implante dental", "Limpieza y revisión", "Diseño de sonrisa", "Endodoncia", "Carillas", "Rehabilitación oral"];
const ETAPAS = ["NUEVO", "NUEVO", "NUEVO", "NUEVO", "NUEVO", "NUEVO", "CONTACTADO", "CONTACTADO", "CONTACTADO", "CONTACTADO", "CONTACTADO", "CONTACTADO", "VALORACION_AGENDADA", "VALORACION_AGENDADA", "VALORACION_AGENDADA", "VALORACION_AGENDADA", "VALORACION_REALIZADA", "VALORACION_REALIZADA", "VALORACION_REALIZADA", "VALORACION_REALIZADA", "PROPUESTA", "PROPUESTA", "PROPUESTA", "PROPUESTA", "GANADO", "GANADO", "GANADO", "PERDIDO", "PERDIDO", "PERDIDO"] as const;

export async function construirAlejandro(env: Entorno, hash: string, g: { nombre: () => Persona; documento: () => string; superId: string }, soloBasico = false) {
  const D = DEF["alejandro-restrepo"];
  const slug = D.slug;
  const rng = crearRng(`odo:${slug}`);
  const A = new Acum();
  const org = await crearCentro(D);
  const orgId = org.id;
  const emailAdmin = `admin@${slug}.ejemplo.invalid`;
  const uid = await crearUsuarios(orgId, [{ email: emailAdmin, nombre: "Dr. Alejandro Restrepo Naranjo", rol: "admin_tenant", esOdontologo: true, perfil: { tarjeta: "TP-DEMO-2291", especialidad: "Odontología general y rehabilitación oral", telefono: "3205550173", consultorio: "Consultorio 202, Manizales" } },
    { email: `recepcion@${slug}.ejemplo.invalid`, nombre: "Daniela Ospina Cardona", rol: "recepcion" }], hash); // recepción no exige 2FA y muestra el límite de datos clínicos (M5)
  await asegurarMiembro(orgId, g.superId, "admin_tenant");
  if (soloBasico) return null;
  const doc = uid.get(emailAdmin)!;

  // ---- Catálogo, sala y horarios ----
  const servicios = CATALOGO_ALEJANDRO.map((s, i) => ({ ...s, id: `${slug}-srv-${i + 1}` }));
  await prisma.servicio.createMany({ data: servicios.map((s, i) => ({ id: s.id, organizationId: orgId, categoria: s.categoria, nombre: s.nombre, precioImpreso: null, precioDigital: s.digital, descuento: s.descuento, duracionMin: s.min, codigoCups: cupsDe(s.nombre), tipoRips: tipoRipsDe(s.nombre), reservableEnLinea: i < 6, anticipoTipo: s.nombre.startsWith("Endodoncia") || s.nombre.startsWith("Implante") ? "FIJO" : "NINGUNO", anticipoValor: s.nombre.startsWith("Endodoncia") || s.nombre.startsWith("Implante") ? 100000 : null })) });
  const sala = `${slug}-sala-1`;
  await prisma.sala.create({ data: { id: sala, organizationId: orgId, nombre: "Consultorio 1", color: "emerald" } });
  A.add("horarioAtencion", ...[1, 2, 3, 4, 5].flatMap((d) => [{ id: `${slug}-hor-${d}a`, organizationId: orgId, diaSemana: d, inicioMin: 480, finMin: 750, profesionalId: doc }, { id: `${slug}-hor-${d}b`, organizationId: orgId, diaSemana: d, inicioMin: 840, finMin: 1080, profesionalId: doc }]), { id: `${slug}-hor-6`, organizationId: orgId, diaSemana: 6, inicioMin: 480, finMin: 750, profesionalId: doc });
  await prisma.servicioProfesional.createMany({ data: servicios.slice(0, 6).map((s) => ({ organizationId: orgId, servicioId: s.id, profesionalId: doc })) });
  await prisma.configFinanzas.create({ data: { organizationId: orgId } });
  // RIPS activo; sin facturación electrónica (ni proveedor SIMULADO, que no existe en producción). Ver README.
  const nit = "9015550179";
  await prisma.configFacturacion.create({ data: {
    organizationId: orgId, nit, dv: digitoVerificacionNit(nit), razonSocial: "Alejandro Restrepo Naranjo (demo)", nombreComercial: D.nombre, codigoPrestador: "DEMO17001002",
    generaRips: true, emiteFev: false, modalidadDefecto: "01", grupoServiciosDefecto: "01", prefijoFactura: "AR", regimen: "SIMPLE", responsabilidadFiscal: "R-99-PN", actualizadoEn: new Date(),
  } });
  await prisma.configAgendaPublica.create({ data: { organizationId: orgId, activa: false, mensajeBienvenida: "Agenda tu cita con el Dr. Restrepo.", versionPolitica: "2026-01" } });

  // ---- Pacientes con foto de perfil sintética ----
  const pacs = crearPacientes({ slug, rng, n: 45, nombre: g.nombre, documento: g.documento, ciudad: "Manizales" });
  const fotos = await conConcurrencia(pacs, 6, async (p, i) => fotoPerfilKey(orgId, p.id, `${p.primerNombre[0]}${p.nombre.split(" ").at(-2)![0]}`, i + 3, (key, b) => subirS3(env.bucket, key, b, "image/jpeg")));
  pacs.forEach((p, i) => { p.fotoKey = fotos[i]!; });

  // ---- Agenda y producción: citas de los últimos 150 días, esta semana y las próximas dos ----
  const agendar = crearAgendador([[12 * 60 + 30, 14 * 60]]);
  const pesoSrv = servicios.map((s) => s.peso);
  const citas: { id: string; pac: number; srv: (typeof servicios)[number]; inicio: Date; fin: Date; estado: string; off: number }[] = [];
  let cn = 0;
  const poner = (pac: number, off: number, pref: number, estado: string, srv = rng.weighted(servicios, pesoSrv)) => {
    const min = agendar("c", off, srv.min, pref);
    if (min === null) return;
    const inicio = bog(off, 0, min);
    citas.push({ id: `${slug}-cita-${++cn}`, pac, srv, inicio, fin: enMin(inicio, srv.min), estado, off });
  };
  const recurrentes = rng.shuffle(pacs.map((_, i) => i)).slice(0, 14);
  const pickPac = (k: number) => (k < pacs.length ? k : rng.chance(0.5) ? rng.pick(recurrentes) : rng.int(0, pacs.length - 1));
  let k = 0;
  const diasPasados = Array.from({ length: 150 }, (_, i) => -(i + 1)).filter((o) => diaSemana(o) !== 7);
  for (const off of diasPasados.reverse()) {
    const n = diaSemana(off) === 6 ? rng.int(1, 3) : rng.int(2, 5);
    for (let i = 0; i < n; i++) {
      const estado = rng.weighted(["ATENDIDA", "CANCELADA", "NO_ASISTIO"], [90, 6, 4]);
      poner(pickPac(k++), off, 8 * 60 + i * 80 + rng.int(0, 40), estado);
    }
  }
  const hoyEstados = ["ATENDIDA", "ATENDIDA", "EN_ATENCION", "LLEGO", "CONFIRMADA", "PROGRAMADA", "PROGRAMADA"];
  hoyEstados.forEach((e, i) => poner(pickPac(k++), 0, 8 * 60 + i * 75, e));
  for (let off = 1; off <= 14; off++) {
    if (diaSemana(off) === 7) continue;
    const n = diaSemana(off) === 6 ? 2 : rng.int(3, 6);
    for (let i = 0; i < n; i++) poner(pickPac(k++), off, 8 * 60 + i * 75 + rng.int(0, 20), off <= 3 && rng.chance(0.7) ? "CONFIRMADA" : "PROGRAMADA");
  }
  // ---- Órdenes (una por atención con servicio codificable, las 60 más recientes) con sus datos RIPS ----
  const DX_SERVICIO: [RegExp, string][] = [[/^Consulta/, "Z012"], [/^Profilaxis/, "K036"], [/^Detartraje/, "K051"], [/^Resina/, "K021"], [/^Sellantes|^Fluor/, "K020"], [/^Endodoncia/, "K041"], [/^Exodoncia/, "K083"], [/^Radiografía/, "K021"]];
  const conOrden = citas.filter((c) => c.estado === "ATENDIDA" && c.off < 0 && c.srv.digital && c.srv.nombre !== "Control mensual" && cupsDe(c.srv.nombre)).sort((a, b) => b.inicio.getTime() - a.inicio.getTime()).slice(0, 60).sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const ordenDeCita = new Map(conOrden.map((c, i) => [c.id, { id: `${slug}-ord-${i + 1}`, numero: i + 1 }]));
  const precioDe = (c: (typeof citas)[number]) => Math.max(0, c.srv.digital! - c.srv.descuento);
  conOrden.forEach((c) => {
    const { id, numero } = ordenDeCita.get(c.id)!;
    const creado = enMin(c.inicio, -60);
    const consulta = tipoRipsDe(c.srv.nombre) === "CONSULTA";
    A.add("orden", {
      id, organizationId: orgId, numero, pacienteId: pacs[c.pac]!.id, doctorRemitenteId: null, estado: "ENTREGADA", entrega: "DIGITAL", observaciones: c.srv.nombre, embarazo: false, creadoPorId: doc, creadoEn: creado, actualizadoEn: c.fin,
      tipoUsuario: "05", finalidad: /^Profilaxis|^Sellantes|^Fluor/.test(c.srv.nombre) ? "14" : consulta ? "11" : "16", causaMotivoAtencion: "13", viaIngreso: "01", tipoDiagnostico: "02",
      diagnosticoPrincipal: DX_SERVICIO.find(([re]) => re.test(c.srv.nombre))?.[1] ?? "Z012", diagnosticosRelacionados: [], profesionalAtiendeId: doc, ripsActualizadoEn: c.fin,
    });
    A.add("ordenItem", { id: `${id}-i1`, ordenId: id, servicioId: c.srv.id, nombre: c.srv.nombre, opciones: null, precio: precioDe(c), descuento: 0, codigoCups: cupsDe(c.srv.nombre), tipoRips: tipoRipsDe(c.srv.nombre) });
    A.add("evento", { id: `${id}-ev`, organizationId: orgId, pacienteId: pacs[c.pac]!.id, actorId: doc, tipo: "orden.creada", detalle: { ordenId: id, numero }, creadoEn: creado });
  });
  A.add("cita", ...citas.map((c) => ({ id: c.id, organizationId: orgId, salaId: sala, pacienteId: pacs[c.pac]!.id, inicio: c.inicio, fin: c.fin, estado: c.estado, profesionalId: doc, servicioId: c.srv.id, ordenId: ordenDeCita.get(c.id)?.id ?? null, origen: c.off > 0 && rng.chance(0.12) ? "PUBLICA" : "INTERNA", notas: c.estado === "CANCELADA" ? "Canceló el paciente" : c.estado === "NO_ASISTIO" ? "No asistió" : null, creadoEn: enMin(c.inicio, -2 * 1440) })));
  pacs.forEach((p, i) => {
    const suyas = citas.filter((c) => c.pac === i);
    const primera = suyas.reduce((m, c) => (c.inicio < m ? c.inicio : m), bog(1));
    p.creadoEn = enMin(primera, -rng.int(30, 300));
    const ult = suyas.filter((c) => c.estado === "ATENDIDA").sort((a, b) => b.inicio.getTime() - a.inicio.getTime())[0];
    p.ultimaVisitaEn = ult?.inicio ?? null;
    if (ult && rng.chance(0.55)) p.proximoControlEn = enMin(ult.inicio, 1440 * rng.pick([90, 120, 180, 180]));
  });
  registrarPacientes(A, { orgId, slug, pacientes: pacs, actor: doc, rips: { codMunicipio: "17001" } });
  historiaClinica(A, { orgId, slug, rng, pacientes: pacs, fraccion: 0.7, actor: doc });

  // ---- Odontograma con su historial ----
  let hn = 0;
  pacs.forEach((p) => {
    const n = rng.int(2, 8);
    const dientes = rng.shuffle(DIENTES).slice(0, n);
    const previo: { diente: number; superficie: string | null; condicion: string; notas: string | null }[] = [];
    dientes.forEach((diente, j) => {
      const condicion = rng.weighted(CONDICIONES, [30, 30, 12, 12, 4, 12]);
      const superficie = condicion === "caries" || condicion === "restauracion" ? rng.pick(SUPERFICIES) : null;
      const fecha = enMin(p.creadoEn, 1440 * (j * 20 + rng.int(0, 10)));
      hn++;
      A.add("odontogramaHistorial", { id: `${slug}-oh-${hn}`, organizationId: orgId, pacienteId: p.id, autorId: doc, snapshot: previo.map((x) => ({ ...x })), motivo: `Diente ${diente}: ${condicion}`, creadoEn: fecha < bog(0) ? fecha : bog(-1) });
      previo.push({ diente, superficie, condicion, notas: null });
      A.add("condicionDental", { id: `${slug}-cd-${hn}`, pacienteId: p.id, diente, superficie, condicion, notas: null, creadoEn: fecha < bog(0) ? fecha : bog(-1) });
    });
  });

  // ---- Plan de tratamiento y notas clínicas ----
  let pn = 0;
  pacs.slice(0, 26).forEach((p) => {
    const n = rng.int(1, 4);
    for (let i = 0; i < n; i++) {
      const s = rng.weighted(servicios.filter((x) => x.digital && x.digital > 100000), servicios.filter((x) => x.digital && x.digital > 100000).map((x) => x.peso));
      pn++;
      A.add("planTratamientoItem", { id: `${slug}-plan-${pn}`, pacienteId: p.id, diente: rng.pick(DIENTES), superficie: s.nombre.startsWith("Resina") ? rng.pick(SUPERFICIES) : null, descripcion: s.nombre, valor: s.digital!, estado: rng.weighted(["PLANEADO", "ACEPTADO", "REALIZADO", "RECHAZADO"], [35, 30, 28, 7]), posicion: i, creadoEn: enMin(p.creadoEn, 1440 * 5) });
    }
  });
  const notas: { id: string; pac: number; fecha: Date; texto: string }[] = [];
  citas.filter((c) => c.estado === "ATENDIDA" && c.off < 0 && rng.chance(0.45)).forEach((c, i) => {
    const grupo = Object.keys(NOTAS).find((kk) => kk !== "default" && c.srv.nombre.startsWith(kk)) ?? "default";
    const texto = rng.pick(NOTAS[grupo]!);
    notas.push({ id: `${slug}-nota-${i + 1}`, pac: c.pac, fecha: enMin(c.fin, 10), texto });
  });
  const originales = notas.length;
  notas.forEach((n) => A.add("notaClinica", { id: n.id, pacienteId: pacs[n.pac]!.id, autorId: doc, fecha: n.fecha, texto: n.texto, creadoEn: n.fecha }));
  // Correcciones: nota nueva que cita a la original (la original nunca se modifica).
  notas.slice(0, originales).filter((_, i) => i % 11 === 0).forEach((n, i) => {
    const f = new Date(Math.min(n.fecha.getTime() + 1440 * 60_000, bog(0).getTime() - 3600_000));
    A.add("notaClinica", { id: `${slug}-nota-c${i + 1}`, pacienteId: pacs[n.pac]!.id, autorId: doc, fecha: f, texto: `[Corrige la nota del ${fechaHoraCompleta(n.fecha)}] Se aclara que el procedimiento se realizó en el diente indicado en el odontograma; el resto del texto se mantiene.`, creadoEn: f });
  });

  // ---- Cuentas de cobro (una por cita atendida con valor) con abonos y cartera ----
  const docs: DocFactura[] = citas.filter((c) => c.estado === "ATENDIDA" && c.srv.digital && c.srv.nombre !== "Control mensual").map((c) => ({
    id: `${slug}-fac-${c.id.split("-").at(-1)}`, fecha: enMin(c.fin, 5), pacienteId: pacs[c.pac]!.id, ordenId: ordenDeCita.get(c.id)?.id ?? null,
    items: [{ descripcion: c.srv.nombre, valorUnitario: Math.max(0, c.srv.digital! - c.srv.descuento), servicioId: c.srv.id, profesionalId: doc }], responsable: "PACIENTE",
  }));
  const fac = facturar(A, { orgId, rng, docs, cajeros: [doc], admin: doc, probAbierta: (e) => (e <= 30 ? 0.22 : e <= 60 ? 0.12 : e <= 90 ? 0.08 : 0.04) });
  egresosMensuales(A, { orgId, rng, meses: 5, escala: 0.3, admin: doc });

  // ---- Evolutivos clínicos firmados (uno por atención con orden), plantillas base y adendas ----
  const evo = evolutivos(A, {
    orgId, slug, rng, firmante: { id: doc, nombre: "Dr. Alejandro Restrepo Naranjo", tarjeta: "TP-DEMO-2291" },
    atenciones: conOrden.map((c) => ({ citaId: c.id, ordenId: ordenDeCita.get(c.id)!.id, pacienteId: pacs[c.pac]!.id, servicioId: c.srv.id, servicio: c.srv.nombre, diente: rng.pick(DIENTES), fin: c.fin })),
  });

  // ---- Presupuestos virtuales con ítems, fases y enlace (solo hash del token y del código: nunca se imprimen) ----
  // Estados que ve la gente: Borrador, Enviada, Vista, Aceptada, Rechazada, Vencida (enviada con vigencia pasada), Anulada (VENCIDO guardado) y Convertida.
  const PRES: { estado: string; vigencia: number }[] = [
    { estado: "BORRADOR", vigencia: 15 }, { estado: "ENVIADO", vigencia: 12 }, { estado: "ENVIADO", vigencia: 6 }, { estado: "VISTO", vigencia: 9 }, { estado: "ACEPTADO", vigencia: 10 },
    { estado: "ACEPTADO", vigencia: 4 }, { estado: "RECHAZADO", vigencia: 8 }, { estado: "RECHAZADO", vigencia: -4 }, { estado: "ENVIADO", vigencia: -9 }, { estado: "ENVIADO", vigencia: -22 },
    { estado: "VENCIDO", vigencia: 10 }, { estado: "CONVERTIDO", vigencia: -2 }, { estado: "CONVERTIDO", vigencia: -8 }, { estado: "CONVERTIDO", vigencia: -15 },
  ];
  const titulos = ["Rehabilitación oral", "Ortodoncia completa", "Endodoncia y corona", "Implante y corona", "Diseño de sonrisa", "Tratamiento integral"];
  const MOTIVOS_RECHAZO = ["Prefiere esperar por presupuesto familiar", "Pidió otra opinión con otro odontólogo", "El valor está por encima de lo que esperaba"];
  PRES.forEach(({ estado, vigencia }, i) => {
    const p = pacs[i * 3 % pacs.length]!;
    const id = `${slug}-pres-${i + 1}`;
    const creado = bog(-(rng.int(3, 20) + Math.max(0, 15 - vigencia)), 11);
    const n = rng.int(2, 5);
    const items = Array.from({ length: n }, (_, j) => { const s = rng.pick(servicios.filter((x) => x.digital && x.digital >= 120000 && x.categoria === "OTRO")); return { s, j }; });
    const suya = docs.find((d) => d.pacienteId === p.id && fac.facturas.has(d.id));
    const validoHasta = diaUtc(vigencia);
    const total = items.reduce((t, { s }) => t + s.digital!, 0);
    const enviado = estado !== "BORRADOR" && estado !== "VENCIDO";
    const respondida = ["ACEPTADO", "CONVERTIDO"].includes(estado);
    const token = generarToken(), tokenHash = hashToken(token);
    A.add("presupuesto", {
      id, organizationId: orgId, numero: i + 1, pacienteId: p.id, profesionalId: doc, estado, valoracionId: COTIZADAS.some((c) => c.pres === i) ? `${slug}-val-${COTIZADAS.find((c) => c.pres === i)!.val}` : null, titulo: titulos[i % titulos.length], margen: 30, validoHasta, creadoPorId: doc, creadoEn: creado, actualizadoEn: creado,
      ...(enviado ? { tokenHash, codigoHash: hashCodigo(tokenHash, generarCodigoAcceso(), env.secreto), intentosCodigo: 0, enviadoEn: enMin(creado, 45) } : {}),
      ...(["VISTO", "ACEPTADO", "RECHAZADO", "CONVERTIDO"].includes(estado) ? { vistoEn: enMin(creado, 600) } : {}),
      ...(respondida ? {
        aceptadoEn: enMin(creado, 1440 * 3), aceptadoNombre: p.nombre, aceptadoDocumento: p.doc, aceptadoIpHash: hashIp(null, env.secreto), textoAceptacionVersion: TEXTO_ACEPTACION_VERSION,
        textoAceptacionHash: hashTexto(textoAceptacion({ numero: i + 1, total, validoHasta, centro: D.nombre })),
      } : {}),
      ...(estado === "RECHAZADO" ? { rechazadoEn: enMin(creado, 1440 * 4), rechazoMotivo: MOTIVOS_RECHAZO[i % MOTIVOS_RECHAZO.length] } : {}),
    });
    items.forEach(({ s, j }) => A.add("itemPresupuesto", { id: `${id}-i${j + 1}`, organizationId: orgId, presupuestoId: id, servicioId: s.id, descripcion: s.nombre, diente: rng.pick(DIENTES), fase: j < 2 ? 1 : 2, cantidad: 1, valorUnitario: s.digital!, costoUnitario: Math.round(s.digital! * 0.4), descuento: 0, posicion: j, facturaId: estado === "CONVERTIDO" && j === 0 && suya ? suya.id : null }));
  });

  // ---- Laboratorio protésico externo ----
  const labs = ["Laboratorio Protésico Andino", "Dental Lab Cafetero", "Cerámicas del Ruiz"];
  const tiposLab: [string, number][] = [["Corona de zirconio", 380000], ["Corona metal-porcelana", 220000], ["Prótesis parcial removible", 310000], ["Guarda oclusal", 160000], ["Carillas de porcelana (x4)", 1400000], ["Modelo de estudio en resina 3D", 60000], ["Guía quirúrgica", 250000], ["Retenedores", 90000], ["Prótesis total", 520000]];
  const estLab = ["PENDIENTE", "ENVIADO", "ENVIADO", "RECIBIDO", "RECIBIDO", "ENTREGADO", "ENTREGADO", "ENTREGADO", "ENTREGADO", "PENDIENTE", "ENVIADO", "ENTREGADO", "CANCELADO", "ENVIADO"] as const;
  estLab.forEach((estado, i) => {
    const [tipo, valor] = tiposLab[i % tiposLab.length]!;
    const p = pacs[(i * 5 + 2) % pacs.length]!;
    const enviado = estado === "PENDIENTE" ? null : bog(-rng.int(estado === "ENTREGADO" ? 14 : 3, estado === "ENTREGADO" ? 60 : 16), 10);
    const esperada = enviado ? enMin(enviado, 1440 * rng.int(6, 12)) : bog(rng.int(3, 8));
    const vencido = (estado === "ENVIADO" && i % 2 === 0);
    A.add("casoLaboratorio", { id: `${slug}-lab-${i + 1}`, organizationId: orgId, pacienteId: p.id, laboratorio: labs[i % labs.length], tipo, dientes: rng.pick(["36", "46", "11-21", "14-15", "24", "36-37"]), valor, estado, enviado, entregaEsperada: vencido ? bog(-rng.int(2, 6), 10) : esperada, recibido: estado === "RECIBIDO" || estado === "ENTREGADO" ? (enviado ? new Date(Math.min(enMin(enviado, 1440 * 8).getTime(), bog(-1, 10).getTime())) : null) : null, notas: estado === "CANCELADO" ? "El paciente decidió otro tratamiento" : null, creadoEn: enviado ?? bog(-1) });
  });

  // ---- Valoraciones virtuales: 16 solicitudes en todas las etapas, con fotos sintéticas, video, leads y dos cotizaciones (valoraciones.ts) ----
  const nValoraciones = await sembrarValoraciones({ A, env, orgId, slug, doc, pacs, g });

  // ---- CRM: 30 leads en todas las etapas, actividades y tareas ----
  let an = 0, tn = 0;
  ETAPAS.forEach((etapa, i) => {
    const p = g.nombre();
    const creado = bog(-rng.int(1, 85), rng.int(8, 17));
    const id = `${slug}-lead-${i + 1}`;
    const cerrada = etapa === "GANADO" || etapa === "PERDIDO";
    const origen = ORIGENES[i % ORIGENES.length]!;
    A.add("lead", {
      id, organizationId: orgId, nombre: p.nombre, telefono: `3115550${200 + i}`, correo: null, ciudad: rng.pick(["Manizales", "Villamaría", "Chinchiná", "Pereira"]), origen, interes: INTERESES[i % INTERESES.length], etapa,
      valorEstimado: rng.pick([150000, 380000, 650000, 1800000, 2800000, 4200000]), responsableId: doc, pacienteId: etapa === "GANADO" ? pacs[(i * 2) % pacs.length]!.id : null,
      proximoContacto: cerrada ? null : bog(rng.int(-3, 8), 9), ultimoContactoEn: etapa === "NUEVO" ? null : enMin(creado, 1440 * rng.int(1, 8)), motivoPerdida: etapa === "PERDIDO" ? rng.pick(["Precio", "Eligió otro consultorio", "No contestó más", "Pospuso el tratamiento"]) : null,
      consentimientoMercadeo: rng.chance(0.55), consentimientoEn: creado, noContactar: i === 28, cerradoEn: cerrada ? enMin(creado, 1440 * 12) : null, creadoEn: creado, actualizadoEn: creado,
    });
    const acts: [string, string][] = [["NOTA", `Llegó por ${origen.toLowerCase()}. Interesado en ${INTERESES[i % INTERESES.length]!.toLowerCase()}.`]];
    if (etapa !== "NUEVO") acts.push([rng.pick(["LLAMADA", "WHATSAPP"]), "Se contactó y se resolvieron dudas iniciales."]);
    if (["VALORACION_REALIZADA", "PROPUESTA", "GANADO"].includes(etapa)) acts.push(["VALORACION", "Valoración realizada en consultorio."], ["CAMBIO_ETAPA", `Cambió a ${etapa}`]);
    acts.forEach(([tipo, texto], j) => A.add("actividadLead", { id: `${slug}-act-${++an}`, organizationId: orgId, leadId: id, tipo, texto, autorId: doc, automatica: tipo === "CAMBIO_ETAPA", creadoEn: enMin(creado, 60 * (j + 1) * 6) }));
    if (!cerrada && i % 2 === 0) { const hecha = i % 4 === 0; A.add("tareaCRM", { id: `${slug}-tarea-${++tn}`, organizationId: orgId, leadId: id, titulo: rng.pick(["Llamar para confirmar valoración", "Enviar propuesta por WhatsApp", "Hacer seguimiento del presupuesto"]), vence: bog(hecha ? -2 : rng.int(-2, 6), 10), asignadoId: doc, estado: hecha ? "HECHA" : "PENDIENTE", completadaEn: hecha ? bog(-2, 11) : null, creadoEn: creado }); }
  });
  // Secuencias predefinidas instaladas pero INACTIVAS (nunca se activan: no deben enviar correos).
  PLANTILLAS_SECUENCIA.forEach((pl, i) => {
    const id = `${slug}-seq-${i + 1}`;
    A.add("secuenciaCRM", { id, organizationId: orgId, nombre: pl.nombre, descripcion: pl.descripcion, disparador: pl.disparador, diasInactividad: pl.diasInactividad ?? null, filtro: pl.filtro ? { ...pl.filtro } : undefined, activa: false, creadaPorId: doc });
    pl.pasos.forEach((p, orden) => A.add("pasoSecuencia", { id: `${id}-p${orden}`, organizationId: orgId, secuenciaId: id, orden, esperaDias: p.esperaDias, esperaHoras: p.esperaHoras ?? 0, accion: p.accion, asunto: p.asunto ?? null, cuerpo: p.cuerpo ?? null, etapaDestino: p.etapaDestino ?? null, tareaTitulo: p.tareaTitulo ?? null }));
  });
  await prisma.configFidelizacion.create({ data: { organizationId: orgId, activa: false, diasControl: 180, recordarCumpleanos: true, mensajeCumpleanos: "Todo el equipo del consultorio te desea un feliz cumpleaños." } });

  // ---- Estudios para el visor (importados): panorámicas y periapicales repartidas en cinco meses ----
  const planes: PlanEstudio[] = [];
  const TIPOS_EST = ["PX", "IO", "IO", "PX", "IO", "IO", "PX", "IO"] as const;
  const conCita = pacs.filter((p) => p.tipoDoc === "CC" && p.ultimaVisitaEn).slice(0, TIPOS_EST.length);
  TIPOS_EST.forEach((tipo, i) => {
    const p = conCita[i]!;
    const n = i + 1;
    const off = -(i * 18 + 6);
    const plan = planEstudio({ key: `${slug}-${tipo.toLowerCase()}-${n}`, tipo, patientId: p.doc, patientName: nombreDicom(p.nombre), birthDate: fechaDicom(p.nac), sex: p.sexo, studyDate: fechaDicom(diaUtc(off)), studyUid: uidEstudio(slug, n), desc: tipo === "PX" ? "Radiografía panorámica" : "Radiografía periapical", seed: 900 + n, centro: D.nombre, remitente: "", accession: `AR-${n}` });
    planes.push(plan);
    A.add("estudio", { id: `${slug}-est-${n}`, organizationId: orgId, pacienteId: p.id, studyInstanceUid: plan.studyUid, orthancId: plan.orthancId, modalidad: tipo === "PX" ? "PX" : "IO", descripcion: plan.desc, fechaEstudio: diaUtc(off), estado: "ASIGNADO", creadoEn: bog(off, 10), actualizadoEn: bog(off, 10) });
  });

  mensajesHistoricos(A, { orgId, slug, rng, n: 25, pacientes: pacs, dias: 90, centro: D.nombre });
  consentimientos(A, { orgId, slug, rng, pacientes: pacs, solicitudes: 3 });
  const despues = async () => {
    let n = 0;
    for (const c of [...conOrden].reverse()) { if (n >= 6) break; if ((await generarYGuardarRips({ organizationId: orgId, actorId: doc, ordenId: ordenDeCita.get(c.id)!.id })).estado === "ok") n++; }
    log(`  ${slug}: ${n} RIPS generados (JSON en S3).`);
  };
  return { A, org, planes, despues, resumen: { ordenes: conOrden.length, evolutivos: evo.evolutivos, pacientes: pacs.length, citas: citas.length, facturas: docs.length, notasClinicas: notas.length, presupuestos: PRES.length, leads: ETAPAS.length, valoraciones: nValoraciones, estudiosDicom: planes.length } };
}
