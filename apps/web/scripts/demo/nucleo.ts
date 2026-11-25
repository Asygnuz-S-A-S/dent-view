// Piezas comunes a los cuatro centros: acumulador de filas, centro/usuarios, facturación y cartera, caja, mensajes y consentimientos.
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@dent-view/db";
import { auth } from "../../src/lib/auth";
import { fechaLimite } from "../../src/lib/consentimientos";
import { avatarJpeg, logoDataUrl } from "./imagenes";
import { bog, DIA, diaUtc, enLotes, enMin, type Entorno, type Rng } from "./util";

// ---------- Acumulador de filas con orden de inserción que respeta las llaves foráneas ----------
const ORDEN_INSERCION = [
  "persona", "pacienteTenant", "contextoMedico", "alergiaPaciente", "medicacionPaciente", "enfermedadPaciente", "contactoEmergencia", "representanteLegal",
  "preferenciaContacto", "orden", "ordenItem", "cita", "estudio", "imagenEstudio", "anticipo", "sesionCaja", "factura", "facturaItem", "pago",
  "notaCredito", "promesaPago", "cuotaFactura", "egreso", "informe", "enlaceEntrega", "seguimiento", "intentoContacto", "seguimientoDoctor",
  "contactoDoctor", "mensaje", "plantillaMensaje", "autorizacion", "solicitudTitular", "condicionDental", "odontogramaHistorial", "planTratamientoItem",
  "notaClinica", "presupuesto", "itemPresupuesto", "casoLaboratorio", "lead", "valoracion", "valoracionMedia", "valoracionMensaje", "actividadLead",
  "tareaCRM", "secuenciaCRM", "pasoSecuencia", "doctorPaciente", "registroToma", "horarioAtencion", "excepcionHorario", "evento",
] as const;
export type Modelo = (typeof ORDEN_INSERCION)[number];

export class Acum {
  filas = new Map<Modelo, Record<string, unknown>[]>();
  add(m: Modelo, ...rows: Record<string, unknown>[]) {
    const l = this.filas.get(m) ?? [];
    l.push(...rows);
    this.filas.set(m, l);
  }
  n(m: Modelo) { return this.filas.get(m)?.length ?? 0; }
  async volcar() {
    const cuentas: Record<string, number> = {};
    for (const m of ORDEN_INSERCION) {
      const rows = this.filas.get(m);
      if (!rows?.length) continue;
      const delegado = (prisma as unknown as Record<string, { createMany: (a: { data: unknown[] }) => Promise<unknown> }>)[m]!;
      const cols = Math.max(...rows.slice(0, 50).map((r) => Object.keys(r).length), 1);
      await enLotes(rows, Math.max(50, Math.floor(30000 / cols)), (lote) => delegado.createMany({ data: lote })).catch((e) => { throw new Error(`Falló la inserción de ${m}: ${String(e instanceof Error ? e.message : e).trim().split("\n").slice(-3).join(" | ").slice(0, 400)}`); });
      cuentas[m] = rows.length;
    }
    return cuentas;
  }
}

// ---------- Centro y usuarios ----------
export type DefCentro = {
  slug: string; nombre: string; tipo: "CENTRO_RADIOLOGICO" | "CENTRO_ODONTOLOGICO" | "ODONTOLOGO_PARTICULAR" | "CLINICA_ODONTOLOGICA";
  color: string; iniciales: string; ciudad: string; direccion: string; telefono: string; correo: string; registro: string;
};

export async function crearCentro(d: DefCentro) {
  const logo = await logoDataUrl(d.iniciales, d.color);
  const org = await prisma.organization.upsert({
    where: { slug: d.slug },
    update: { name: d.nombre, logo },
    create: { id: `org-${d.slug}`, name: d.nombre, slug: d.slug, logo },
  });
  const datos = { nombre: d.nombre, direccion: `${d.direccion}, ${d.ciudad}`, telefono: d.telefono, correo: d.correo, registro: d.registro, logo, colorPrimario: d.color, tipoCentro: d.tipo };
  await prisma.configCentro.upsert({ where: { organizationId: org.id }, update: datos, create: { organizationId: org.id, ...datos } });
  return org;
}

export const idUsuario = (email: string) => `u-${createHash("sha256").update(email).digest("hex").slice(0, 20)}`;

export type DefUsuario = { email: string; nombre: string; rol: string; esOdontologo?: boolean; perfil?: { tarjeta: string; especialidad: string; telefono: string; consultorio?: string } };

export async function asegurarUsuario(email: string, name: string, hash: string) {
  const id = idUsuario(email);
  const ex = await prisma.user.findUnique({ where: { email } });
  if (ex) {
    await prisma.user.update({ where: { id: ex.id }, data: { name, emailVerified: true, debeCambiarClave: false } });
    await prisma.account.updateMany({ where: { userId: ex.id, providerId: "credential" }, data: { password: hash } });
    return ex.id;
  }
  await prisma.user.create({ data: { id, email, name, emailVerified: true, accounts: { create: { id: `a-${id}`, providerId: "credential", accountId: id, password: hash } } } });
  return id;
}

/** Hash scrypt de Better Auth, una sola vez (misma clave para todos los usuarios demo). */
export async function hashDemo(env: Entorno) {
  return (await auth.$context).password.hash(env.demoClave);
}

export async function asegurarMiembro(organizationId: string, userId: string, role: string, esOdontologo = false) {
  await prisma.member.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    update: { role, esOdontologo },
    create: { id: randomUUID(), organizationId, userId, role, esOdontologo },
  });
}

/** Superadmin: usuario ADMIN_EMAIL con role "admin", cuenta credential con ADMIN_HASH; no toca su 2FA. */
export async function asegurarSuperadmin(env: Entorno) {
  const ex = await prisma.user.findFirst({ where: { email: { equals: env.adminEmail, mode: "insensitive" } } });
  let id: string;
  if (ex) {
    id = ex.id;
    await prisma.user.update({ where: { id }, data: { role: "admin", name: env.adminNombre, emailVerified: true, debeCambiarClave: false, twoFactorEnabled: ex.twoFactorEnabled ?? false } });
  } else {
    id = idUsuario(env.adminEmail);
    await prisma.user.create({ data: { id, email: env.adminEmail, name: env.adminNombre, role: "admin", emailVerified: true, debeCambiarClave: false, twoFactorEnabled: false } });
  }
  const cuenta = await prisma.account.findFirst({ where: { userId: id, providerId: "credential" } });
  if (cuenta) await prisma.account.update({ where: { id: cuenta.id }, data: { password: env.adminHash, accountId: id } });
  else await prisma.account.create({ data: { id: `a-${id}`, userId: id, providerId: "credential", accountId: id, password: env.adminHash } });
  return id;
}

/** Crea usuarios del centro (con miembro y perfil si lo traen) y devuelve email -> id. */
export async function crearUsuarios(orgId: string, usuarios: DefUsuario[], hash: string) {
  const ids = new Map<string, string>();
  for (const u of usuarios) {
    const id = await asegurarUsuario(u.email, u.nombre, hash);
    await asegurarMiembro(orgId, id, u.rol, u.esOdontologo ?? false);
    if (u.perfil) {
      const p = { tarjetaProfesional: u.perfil.tarjeta, especialidad: u.perfil.especialidad, telefono: u.perfil.telefono, consultorio: u.perfil.consultorio ?? null };
      await prisma.perfilDoctor.upsert({ where: { userId: id }, update: p, create: { userId: id, ...p } });
    }
    ids.set(u.email, id);
  }
  return ids;
}

export async function fotoPerfilKey(orgId: string, pacId: string, iniciales: string, tono: number, subir: (key: string, b: Buffer) => Promise<void>) {
  const key = `tenants/${orgId}/pacientes/${pacId}/foto-demo.jpg`;
  await subir(key, await avatarJpeg(iniciales, tono));
  return key;
}

// ---------- Facturación y cartera ----------
export type DocFactura = {
  id: string; fecha: Date; pacienteId: string | null; ordenId: string | null;
  items: { descripcion: string; cantidad?: number; valorUnitario: number; servicioId?: string | null; profesionalId?: string | null }[];
  responsable: "PACIENTE" | "DOCTOR" | "CONVENIO"; responsableId?: string | null; convenio?: { id: string; nombre: string } | null;
};
export type PagoRef = { id: string; fecha: Date; medio: string; valor: number; dia: number; facturaId: string; anulado: boolean };
const MOTIVOS_ANULACION = ["Error en el valor facturado", "Duplicada por error de digitación", "El paciente canceló el procedimiento", "Cuenta emitida al responsable equivocado"];
const MOTIVOS_NC = ["Descuento posterior por convenio", "Devolución parcial por estudio repetido sin costo", "Ajuste por error en la tarifa aplicada"];
const MEDIOS = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"] as const;

export type ResultadoFacturacion = { facturas: Map<string, { id: string; numero: number; total: number; estado: string; pagado: number; fecha: Date }>; pagos: PagoRef[]; ncs: number };

/** Genera facturas con pagos, abonos, anulaciones, notas crédito y promesas de pago. Consecutivo por fecha. */
export function facturar(A: Acum, o: { orgId: string; rng: Rng; docs: DocFactura[]; cajeros: string[]; admin: string; ncInicial?: number; probAbierta?: (edad: number) => number; refAnticipos?: Map<string, { anticipoId: string; valor: number }> }): ResultadoFacturacion {
  const { rng, orgId } = o;
  const docs = [...o.docs].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const abierta = o.probAbierta ?? ((e) => (e <= 30 ? 0.2 : e <= 60 ? 0.17 : e <= 90 ? 0.14 : e <= 150 ? 0.09 : 0.03));
  const res: ResultadoFacturacion = { facturas: new Map(), pagos: [], ncs: 0 };
  let numero = 0;
  let nc = o.ncInicial ?? 0;
  let pagoN = 0;
  const ahora = bog(0, 0); // la historia llega hasta ayer
  for (const d of docs) {
    numero++;
    const bruto = d.items.reduce((t, i) => t + (i.cantidad ?? 1) * i.valorUnitario, 0);
    const edad = Math.max(0, Math.floor((bog(0).getTime() - d.fecha.getTime()) / DIA) + 1);
    const credito = d.responsable !== "PACIENTE";
    const vence = new Date(d.fecha.getTime() + (credito ? 30 : 15) * DIA);
    const r = rng.next();
    const pAnula = 0.03, pAbierta = Math.min(0.75, abierta(edad) * (credito ? 1.6 : 1)), pParcial = 0.09;
    const tipo = r < pAnula ? "ANULADA" : r < pAnula + pAbierta ? "ABIERTA" : r < pAnula + pAbierta + pParcial ? "PARCIAL" : "PAGADA";
    const medioDe = () => (credito ? "TRANSFERENCIA" : rng.weighted(MEDIOS, [30, 30, 35, 5]));
    const pagos: { valor: number; fecha: Date; medio: string }[] = [];
    const fechaPago = (extra: number) => new Date(Math.min(d.fecha.getTime() + extra * DIA + rng.int(0, 5) * 3600_000, ahora.getTime() - 3600_000));
    const cierraEnElPasado = (extra: number) => d.fecha.getTime() + extra * DIA < bog(0).getTime();
    let estado: "ABIERTA" | "PAGADA" | "ANULADA" = "ABIERTA";
    let anul: { en: Date; motivo: string } | null = null;
    if (tipo === "ANULADA") {
      estado = "ANULADA";
      anul = { en: new Date(d.fecha.getTime() + rng.int(1, 3) * 86_400_000), motivo: rng.pick(MOTIVOS_ANULACION) };
      if (anul.en > ahora) anul.en = new Date(ahora.getTime() - 3600_000);
      if (rng.chance(0.6)) pagos.push({ valor: bruto, fecha: fechaPago(0), medio: medioDe() });
    } else if (tipo === "PAGADA") {
      const extra = credito ? rng.int(12, 35) : rng.chance(0.85) ? 0 : 1;
      if (cierraEnElPasado(extra)) {
        estado = "PAGADA";
        if (!credito && bruto >= 100000 && rng.chance(0.2)) {
          const a = Math.round((bruto * rng.pick([0.4, 0.5, 0.6])) / 1000) * 1000;
          pagos.push({ valor: a, fecha: fechaPago(0), medio: medioDe() }, { valor: bruto - a, fecha: fechaPago(rng.int(2, 9)), medio: medioDe() });
        } else pagos.push({ valor: bruto, fecha: fechaPago(extra), medio: medioDe() });
      }
    } else if (tipo === "PARCIAL" && bruto >= 40000) {
      const a = Math.max(1000, Math.round((bruto * rng.pick([0.3, 0.4, 0.5, 0.6])) / 1000) * 1000);
      if (a < bruto) pagos.push({ valor: a, fecha: fechaPago(credito ? rng.int(10, 25) : 0), medio: medioDe() });
    }
    if (estado !== "ANULADA" && pagos.length && pagos.reduce((t, p) => t + p.valor, 0) >= bruto) estado = "PAGADA";

    // Nota crédito (solo sobre cuentas pagadas, ~3%): reduce el total de la cuenta y queda saldo a favor.
    let total = bruto;
    let ncRow: Record<string, unknown> | null = null;
    if (estado === "PAGADA" && edad < 150 && bruto >= 80000 && rng.chance(0.035)) {
      const valor = Math.max(5000, Math.round((bruto * rng.pick([0.1, 0.15, 0.2])) / 1000) * 1000);
      nc++;
      total = bruto - valor;
      ncRow = { id: `${o.orgId}-nc-${nc}`, organizationId: orgId, consecutivo: nc, facturaId: d.id, valor, motivo: rng.pick(MOTIVOS_NC), creadaPorId: o.admin, creadoEn: new Date(Math.min(d.fecha.getTime() + 3 * DIA, ahora.getTime() - 3600_000)) };
      res.ncs++;
    }
    const pagado = pagos.filter(() => estado !== "ANULADA").reduce((t, p) => t + p.valor, 0);
    A.add("factura", {
      id: d.id, organizationId: orgId, numero, pacienteId: d.pacienteId, ordenId: d.ordenId, responsable: d.responsable, responsableId: d.responsable === "DOCTOR" ? d.responsableId ?? null : null,
      convenio: d.convenio?.nombre ?? null, convenioId: d.convenio?.id ?? null, estado, total, fecha: d.fecha, vence,
      anuladoEn: anul?.en ?? null, anuladoPorId: anul ? o.admin : null, motivoAnulacion: anul?.motivo ?? null,
      notas: ncRow ? "Con nota crédito" : null,
    });
    d.items.forEach((it, k) => A.add("facturaItem", { id: `${d.id}-i${k + 1}`, facturaId: d.id, descripcion: it.descripcion, cantidad: it.cantidad ?? 1, valorUnitario: it.valorUnitario, descuento: 0, servicioId: it.servicioId ?? null, profesionalId: it.profesionalId ?? null }));
    if (ncRow) A.add("notaCredito", ncRow);
    for (const p of pagos) {
      pagoN++;
      const id = `${d.id}-p${pagoN}`;
      const anulado = estado === "ANULADA";
      const dia = Math.floor((ahora.getTime() - p.fecha.getTime()) / DIA) + 1;
      A.add("pago", {
        id, facturaId: d.id, valor: p.valor, medio: p.medio, fecha: p.fecha, nota: p.valor < total && pagos.length === 1 ? "Abono" : null, registradoPorId: rng.pick(o.cajeros),
        anuladoEn: anulado ? anul!.en : null, anuladoPorId: anulado ? o.admin : null, motivoAnulacion: anulado ? anul!.motivo : null,
      });
      res.pagos.push({ id, fecha: p.fecha, medio: p.medio, valor: p.valor, dia, facturaId: d.id, anulado });
    }
    // Promesa de pago sobre cuentas abiertas ya vencidas.
    if (estado === "ABIERTA" && edad > 20 && edad < 140 && rng.chance(0.18)) {
      const incumplida = rng.chance(0.5);
      A.add("promesaPago", {
        id: `${d.id}-pr`, organizationId: orgId, facturaId: d.id, fechaPromesa: diaUtc(incumplida ? -rng.int(3, 15) : rng.int(2, 12)), valor: Math.max(1000, bruto - pagado),
        estado: incumplida ? "INCUMPLIDA" : "PENDIENTE", notas: incumplida ? "No realizó el pago acordado" : "Pagará por transferencia", creadaPorId: o.admin, creadoEn: new Date(Math.min(vence.getTime() + DIA, ahora.getTime() - 3600_000)),
      });
    }
    res.facturas.set(d.id, { id: d.id, numero, total, estado, pagado, fecha: d.fecha });
  }
  return res;
}

// ---------- Caja diaria y egresos ----------
export function caja(A: Acum, o: { orgId: string; rng: Rng; pagos: PagoRef[]; dias: number; cajero: string; admin: string; egresosPorDia?: (dia: number) => { categoria: string; descripcion: string; valor: number; medio: string }[] }) {
  const porDia = new Map<number, PagoRef[]>();
  for (const p of o.pagos) if (!p.anulado && p.dia >= 1 && p.dia <= o.dias) (porDia.get(p.dia) ?? porDia.set(p.dia, []).get(p.dia)!).push(p);
  const idxPago = new Map((A.filas.get("pago") ?? []).map((r) => [r.id as string, r]));
  let numero = 0;
  for (let dia = o.dias; dia >= 1; dia--) {
    const pagos = porDia.get(dia) ?? [];
    const egr = o.egresosPorDia?.(dia) ?? [];
    if (!pagos.length && !egr.length) continue;
    numero++;
    const sesionId = `${o.orgId}-caja-${numero}`;
    const base = o.rng.pick([100000, 150000, 200000]);
    const esperado: Record<string, number> = { EFECTIVO: base, TARJETA: 0, TRANSFERENCIA: 0, OTRO: 0 };
    for (const p of pagos) esperado[p.medio] = (esperado[p.medio] ?? 0) + p.valor;
    for (const e of egr) esperado[e.medio] = (esperado[e.medio] ?? 0) - e.valor;
    const contado = { ...esperado };
    let diferencia = 0;
    if (o.rng.chance(0.15)) { diferencia = o.rng.pick([-10000, -5000, 2000, 5000]); contado.EFECTIVO = contado.EFECTIVO! + diferencia; }
    A.add("sesionCaja", {
      id: sesionId, organizationId: o.orgId, numero, estado: "CERRADA", abiertaPorId: o.cajero, abiertaEn: bog(-dia, 7, 30), baseApertura: base, cerradaPorId: o.cajero, cerradaEn: bog(-dia, 18, 20),
      esperadoPorMedio: esperado, contadoPorMedio: contado, diferencia, notas: diferencia ? "Diferencia en efectivo, se revisa con el cierre" : null,
    });
    for (const p of pagos) idxPago.get(p.id)!.sesionCajaId = sesionId;
    egr.forEach((e, k) => A.add("egreso", { id: `${sesionId}-e${k + 1}`, organizationId: o.orgId, fecha: bog(-dia, 12, 0), valor: e.valor, categoria: e.categoria, descripcion: e.descripcion, medio: e.medio, sesionCajaId: sesionId, registradoPorId: o.cajero }));
  }
  return numero;
}

/** Egresos mensuales (arriendo, nómina, servicios, insumos…) sin sesión de caja, para los reportes de gastos. */
export function egresosMensuales(A: Acum, o: { orgId: string; rng: Rng; meses: number; escala: number; admin: string }) {
  const fijos: [string, string, number][] = [["Arriendo", "Arriendo del local", 4_200_000], ["Nómina", "Nómina del personal", 9_800_000], ["Servicios públicos", "Energía, agua e internet", 1_150_000], ["Insumos", "Insumos de consumo clínico y bioseguridad", 1_900_000], ["Mantenimiento", "Mantenimiento de equipos", 650_000], ["Publicidad", "Pauta y material de mercadeo", 480_000]];
  let n = 0;
  for (let m = 1; m <= o.meses; m++) {
    for (const [categoria, descripcion, valor] of fijos) {
      n++;
      const v = Math.round((valor * o.escala * (0.92 + o.rng.next() * 0.16)) / 1000) * 1000;
      A.add("egreso", { id: `${o.orgId}-eg-${n}`, organizationId: o.orgId, fecha: bog(-(m * 30 - o.rng.int(0, 6)), 10, 0), valor: v, categoria, descripcion, medio: categoria === "Nómina" || categoria === "Arriendo" ? "TRANSFERENCIA" : o.rng.pick(["TRANSFERENCIA", "EFECTIVO", "TARJETA"]), registradoPorId: o.admin });
    }
  }
}

// ---------- Mensajes históricos (nunca EN_COLA), consentimientos y solicitudes ----------
export function mensajesHistoricos(A: Acum, o: { orgId: string; slug: string; rng: Rng; n: number; pacientes: { id: string; nombre: string }[]; dias: number; centro: string }) {
  const tipos = ["CITA_CREADA", "CITA_RECORDATORIO", "INFORME_PACIENTE", "INFORME_REMITENTE", "SEGUIMIENTO"] as const;
  const asuntos: Record<string, string> = { CITA_CREADA: "Tu cita fue agendada", CITA_RECORDATORIO: "Recordatorio de tu cita", INFORME_PACIENTE: "Tu informe está disponible", INFORME_REMITENTE: "Informe disponible de su paciente", SEGUIMIENTO: "Seguimiento de tu atención" };
  for (let i = 0; i < o.n; i++) {
    const tipo = o.rng.pick(tipos);
    const p = o.rng.pick(o.pacientes);
    const estado = o.rng.weighted(["ENVIADO", "FALLIDO", "OMITIDO"], [78, 10, 12]);
    const creado = bog(-o.rng.int(1, o.dias), o.rng.int(7, 18), o.rng.int(0, 59));
    A.add("mensaje", {
      id: `${o.slug}-msg-${i + 1}`, organizationId: o.orgId, pacienteId: p.id, tipo, canal: "CORREO", destinatario: estado === "OMITIDO" ? null : `contacto.${i + 1}@ejemplo.invalid`,
      asunto: `${asuntos[tipo]} · ${o.centro}`, cuerpo: `Mensaje histórico de demostración (${tipo}).`, estado, motivo: estado === "OMITIDO" ? "El paciente no tiene correo registrado" : null,
      intentos: estado === "FALLIDO" ? 5 : estado === "ENVIADO" ? 1 : 0, maxIntentos: 5, proximoIntento: creado, proveedor: "smtp-demo", simulado: true,
      error: estado === "FALLIDO" ? "550 5.1.1 El buzón no existe (demostración)" : null, claveUnica: `demo-${o.slug}-${i + 1}`, creadoEn: creado, enviadoEn: estado === "ENVIADO" ? enMin(creado, 1) : null,
    });
  }
  const plantillas: [string, string, string][] = [
    ["CITA_CREADA", "Tu cita en {{centro}}", "Hola {{paciente}}, tu cita quedó agendada para el {{fecha}}."],
    ["CITA_RECORDATORIO", "Recordatorio de tu cita en {{centro}}", "Hola {{paciente}}, te recordamos tu cita de mañana en {{centro}}."],
    ["INFORME_PACIENTE", "Tu informe de {{centro}} está listo", "Hola {{paciente}}, tu informe ya está disponible. Ingresa con el enlace y el código que recibirás."],
    ["INFORME_REMITENTE", "Informe de su paciente {{paciente}}", "Dr(a). {{medico}}, el informe de su paciente {{paciente}} ya está disponible en {{centro}}."],
  ];
  for (const [tipo, asunto, cuerpo] of plantillas) A.add("plantillaMensaje", { id: `${o.slug}-pl-${tipo}`, organizationId: o.orgId, tipo, canal: "CORREO", asunto, cuerpo, activa: true });
}

export function consentimientos(A: Acum, o: { orgId: string; slug: string; rng: Rng; pacientes: { id: string; nombre: string; creadoEn: Date }[]; solicitudes: number }) {
  let n = 0;
  for (const p of o.pacientes) {
    n++;
    A.add("autorizacion", { id: `${o.slug}-aut-${n}`, organizationId: o.orgId, pacienteId: p.id, tipo: "DATOS", finalidad: "tratamiento de datos personales y clínicos", otorgada: true, version: "2026-01", otorgadaEn: p.creadoEn, creadoEn: p.creadoEn, textoMostrado: "Autorizo el tratamiento de mis datos personales y de salud conforme a la Ley 1581 de 2012." });
    if (o.rng.chance(0.3)) {
      n++;
      const ok = o.rng.chance(0.7);
      A.add("autorizacion", { id: `${o.slug}-aut-${n}`, organizationId: o.orgId, pacienteId: p.id, tipo: "DATOS", finalidad: "mercadeo", otorgada: ok, version: "2026-01", otorgadaEn: ok ? p.creadoEn : null, revocadaEn: ok ? null : enMin(p.creadoEn, 60 * 24 * 20), creadoEn: enMin(p.creadoEn, 5) });
    }
  }
  const tipos = ["CONSULTA", "ACTUALIZACION", "SUPRESION", "REVOCATORIA", "RECLAMO"] as const;
  const estados = ["RECIBIDA", "RECIBIDA", "EN_TRAMITE", "COMPLETADA", "COMPLETADA", "RECHAZADA"] as const;
  for (let i = 0; i < o.solicitudes; i++) {
    const tipo = tipos[i % tipos.length]!;
    const estado = estados[i % estados.length]!;
    const p = o.rng.pick(o.pacientes);
    const recibida = estado === "RECIBIDA" ? bog(-o.rng.int(1, 4), 10) : bog(-o.rng.int(8, 60), 10);
    A.add("solicitudTitular", {
      id: `${o.slug}-sol-${i + 1}`, organizationId: o.orgId, pacienteId: p.id, solicitanteNombre: p.nombre, solicitanteCorreo: `titular.${i + 1}@ejemplo.invalid`, tipo, estado,
      notas: estado === "COMPLETADA" ? "Atendida y respondida al titular dentro del plazo." : estado === "RECHAZADA" ? "No se pudo verificar la identidad del solicitante." : null,
      recibidaEn: recibida, venceEn: fechaLimite(tipo, recibida), resueltaEn: estado === "COMPLETADA" || estado === "RECHAZADA" ? enMin(recibida, 60 * 24 * 6) : null,
    });
  }
}

export const eventoCreacion = (A: Acum, o: { orgId: string; slug: string; pacienteId: string; fecha: Date; actor: string; n: number }) =>
  A.add("evento", { id: `${o.slug}-ev-pc-${o.n}`, organizationId: o.orgId, pacienteId: o.pacienteId, actorId: o.actor, tipo: "paciente.creado", creadoEn: o.fecha });
