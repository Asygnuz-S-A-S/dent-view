// Seed idempotente de datos MOCK 100% ficticios para un centro (demo comercial).
// Uso: SEED_SLUG=lumia DATABASE_URL=… BETTER_AUTH_SECRET=… npx tsx scripts/seed-demo-centro.ts
// Los bloques con consecutivo (órdenes, cuentas de cobro, citas, seguimientos) solo se siembran si el centro aún no tiene.
// Los doctores se crean con contraseña aleatoria que no se imprime (el admin puede restablecerla desde la app).
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@dent-view/db";
import { auth } from "../src/lib/auth";
import { totalItems } from "../src/lib/facturacion";
import { precioFinal } from "../src/lib/precios";

const slug = process.env.SEED_SLUG;
if (!slug) throw new Error("Falta SEED_SLUG (slug del centro a poblar).");
const org = await prisma.organization.findUnique({ where: { slug } });
if (!org) throw new Error(`No existe el centro con slug "${slug}".`);

const DIA = 86_400_000;
const hace = (n: number) => new Date(Date.now() - n * DIA);
// Hora Bogotá (UTC-5) del día `offset` respecto de hoy.
const hoyBog = new Date(Date.now() - 5 * 3600_000);
const bog = (offset: number, h: number, m = 0) => new Date(Date.UTC(hoyBog.getUTCFullYear(), hoyBog.getUTCMonth(), hoyBog.getUTCDate() + offset, h + 5, m));

// --- Catálogo (COP) y salas ---
type S = [categoria: string, nombre: string, impreso: number | null, digital: number | null, descuento: number];
const catalogo: S[] = [
  ["ESTUDIO_2D", "Panorámica", 60000, 50000, 10000],
  ["ESTUDIO_2D", "Cefalométrica lateral (perfil)", 60000, 50000, 10000],
  ["ESTUDIO_2D", "Carpograma", 60000, 50000, 10000],
  ["ESTUDIO_2D", "ATM", 65000, 55000, 10000],
  ["ESTUDIO_2D", "Periapical individual", 45000, 40000, 5000],
  ["ESTUDIO_2D", "Periapical completo", 130000, 120000, 10000],
  ["ESTUDIO_2D", "Fotos x8", 65000, 60000, 5000],
  ["TOMOGRAFIA", "CBCT 1 zona", 170000, 170000, 20000],
  ["TOMOGRAFIA", "CBCT maxilar superior e inferior", 210000, 210000, 20000],
  ["TOMOGRAFIA", "CBCT bimaxilar", 340000, 340000, 20000],
  ["TOMOGRAFIA", "CBCT senos paranasales", 340000, 340000, 20000],
  ["PAQUETE", "Paquete ortodoncia inicial", 140000, 130000, 10000],
  ["PAQUETE", "Paquete implantes", 180000, 170000, 10000],
  ["ESCANEO", "Escaneo dental", null, 80000, 0],
];
const salas: [string, string][] = [["CBCT · Tomografía", "teal"], ["Panorámico", "sky"], ["Intraoral", "violet"]];

for (const [categoria, nombre, precioImpreso, precioDigital, descuento] of catalogo) {
  const data = { precioImpreso, precioDigital, descuento };
  const e = await prisma.servicio.findFirst({ where: { organizationId: org.id, categoria, nombre } });
  if (e) await prisma.servicio.update({ where: { id: e.id }, data });
  else await prisma.servicio.create({ data: { organizationId: org.id, categoria, nombre, ...data } });
}
for (const [nombre, color] of salas) {
  if (!(await prisma.sala.findFirst({ where: { organizationId: org.id, nombre } }))) await prisma.sala.create({ data: { organizationId: org.id, nombre, color } });
}
const servicios = await prisma.servicio.findMany({ where: { organizationId: org.id } });
const srv = (nombre: string) => servicios.find((s) => s.nombre === nombre) ?? (() => { throw new Error(`Falta servicio ${nombre}`); })();
const salaDe = async (nombre: string) => prisma.sala.findFirstOrThrow({ where: { organizationId: org.id, nombre } });

// --- Pacientes ficticios (documentos con prefijo LUMIA- para que no puedan ser una cédula real) ---
const nombres: [nombre: string, nac: string, alertas?: string][] = [
  ["Valeria Andrea Cardona Ruiz", "1991-04-12", "Embarazo de 14 semanas."],
  ["Santiago Mejía Arango", "1988-09-23"],
  ["Daniela Fernanda Quintero Vélez", "2003-02-17"],
  ["Julián Esteban Londoño Pérez", "1995-12-05"],
  ["Mariana Isabel Ocampo Zuluaga", "2012-06-30", "Menor de edad: acompañante obligatorio."],
  ["Andrés Felipe Cárdenas Gil", "1979-08-19", "Alergia al látex."],
  ["Natalia Sofía Bedoya Montoya", "1999-01-28"],
  ["Camilo Alejandro Sánchez Toro", "1984-10-11"],
  ["Luisa Fernanda Arias Posada", "1993-07-07"],
  ["Mateo Restrepo Vargas", "2009-03-21"],
  ["Paola Andrea Uribe Franco", "1976-11-15", "Hipertensión controlada."],
  ["Esteban Giraldo Naranjo", "1990-05-02"],
  ["Carolina Marín Echeverri", "1987-02-26"],
  ["Sebastián Duque Herrera", "2001-09-14"],
];
const pacientes = [];
for (const [i, [nombre, nac, alertas]] of nombres.entries()) {
  const clave = { tipoDocumento: i === 4 || i === 9 ? "TI" : "CC", numeroDocumento: `LUMIA-${String(i + 1).padStart(3, "0")}` };
  const persona = await prisma.persona.upsert({ where: { tipoDocumento_numeroDocumento: clave }, update: {}, create: clave });
  const data = { nombre, alertas, fechaNacimiento: new Date(`${nac}T00:00:00Z`), celular: `3${10 + (i % 5)}5550${100 + i}`, direccion: "Ciudad ficticia, Colombia", correo: `paciente${i + 1}@ejemplo.invalid` };
  pacientes.push(await prisma.pacienteTenant.upsert({ where: { organizationId_personaId: { organizationId: org.id, personaId: persona.id } }, update: {}, create: { organizationId: org.id, personaId: persona.id, ...data } }));
}

// --- Doctores remitentes ficticios ---
const ctx = await auth.$context;
const docs: [string, string, string, string][] = [
  ["Dra. Marcela Ríos Ficticia", "marcela.rios@ejemplo.invalid", "Ortodoncia", "TP-DEMO-001"],
  ["Dr. Ricardo Salazar Ficticio", "ricardo.salazar@ejemplo.invalid", "Implantología", "TP-DEMO-002"],
  ["Dra. Juliana Pineda Ficticia", "juliana.pineda@ejemplo.invalid", "Endodoncia", "TP-DEMO-003"],
  ["Dr. Felipe Aguirre Ficticio", "felipe.aguirre@ejemplo.invalid", "Cirugía oral", "TP-DEMO-004"],
];
const doctores = [];
for (const [i, [name, email, especialidad, tp]] of docs.entries()) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const id = randomUUID();
    user = await prisma.user.create({
      data: { id, email, name, emailVerified: true, accounts: { create: { id: randomUUID(), providerId: "credential", accountId: id, password: await ctx.password.hash(randomBytes(24).toString("base64url")) } } },
    });
  }
  await prisma.member.upsert({ where: { organizationId_userId: { organizationId: org.id, userId: user.id } }, update: {}, create: { id: randomUUID(), organizationId: org.id, userId: user.id, role: "doctor_remitente" } });
  await prisma.perfilDoctor.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, tarjetaProfesional: tp, especialidad, telefono: `3205550${200 + i}`, consultorio: `Consultorio ${301 + i}, ciudad ficticia` } });
  doctores.push(user);
}

// --- Órdenes: [paciente, doctor|null, estado, días atrás, servicios, entrega] ---
type O = [number, number | null, "SOLICITADA" | "AGENDADA" | "TOMADA" | "INFORMADA" | "ENTREGADA" | "CANCELADA", number, string[], "DIGITAL" | "IMPRESA"];
const plan: O[] = [
  [0, 0, "ENTREGADA", 55, ["Panorámica", "Cefalométrica lateral (perfil)"], "DIGITAL"],
  [1, 1, "ENTREGADA", 48, ["CBCT 1 zona"], "DIGITAL"],
  [2, 0, "ENTREGADA", 40, ["Paquete ortodoncia inicial"], "IMPRESA"],
  [5, 2, "ENTREGADA", 33, ["Periapical completo"], "DIGITAL"],
  [6, null, "INFORMADA", 26, ["Panorámica", "ATM"], "DIGITAL"],
  [7, 1, "INFORMADA", 20, ["CBCT bimaxilar"], "DIGITAL"],
  [8, 3, "INFORMADA", 15, ["Paquete implantes"], "IMPRESA"],
  [9, 0, "TOMADA", 9, ["Panorámica", "Fotos x8"], "DIGITAL"],
  [10, 2, "TOMADA", 6, ["CBCT 1 zona", "Periapical individual"], "DIGITAL"],
  [11, 3, "TOMADA", 4, ["CBCT maxilar superior e inferior"], "DIGITAL"],
  // Pacientes con estudio DICOM sintético: quedan AGENDADA para que la ingesta los vincule.
  [0, 0, "AGENDADA", 3, ["Panorámica"], "DIGITAL"],
  [1, 1, "AGENDADA", 3, ["CBCT 1 zona"], "DIGITAL"],
  [2, 0, "AGENDADA", 2, ["Cefalométrica lateral (perfil)"], "DIGITAL"],
  [3, 2, "AGENDADA", 2, ["Periapical individual"], "DIGITAL"],
  [12, 1, "AGENDADA", 1, ["CBCT senos paranasales"], "DIGITAL"],
  [13, null, "SOLICITADA", 1, ["Escaneo dental"], "DIGITAL"],
  [4, 0, "SOLICITADA", 0, ["Panorámica", "Fotos x8"], "DIGITAL"],
  [3, 3, "CANCELADA", 12, ["Carpograma"], "DIGITAL"],
];
const precios = (nombres: string[], entrega: "DIGITAL" | "IMPRESA") => nombres.map((n) => ({ s: srv(n), precio: precioFinal(srv(n), entrega) ?? 0 }));

if ((await prisma.orden.count({ where: { organizationId: org.id } })) === 0) {
  for (const [i, [p, d, estado, dias, svs, entrega]] of plan.entries()) {
    await prisma.orden.create({
      data: {
        organizationId: org.id, numero: i + 1, pacienteId: pacientes[p]!.id, doctorRemitenteId: d === null ? null : doctores[d]!.id,
        estado, entrega, creadoEn: hace(dias), embarazo: p === 0,
        items: { create: precios(svs, entrega).map(({ s, precio }) => ({ servicioId: s.id, nombre: s.nombre, precio })) },
      },
    });
  }
}

// --- Cuentas de cobro y pagos (órdenes tomadas o posteriores) ---
if ((await prisma.factura.count({ where: { organizationId: org.id } })) === 0) {
  const ordenes = await prisma.orden.findMany({ where: { organizationId: org.id, estado: { in: ["TOMADA", "INFORMADA", "ENTREGADA"] } }, include: { items: true }, orderBy: { numero: "asc" } });
  // abono: fracción pagada (1 = total, 0 = sin pago); vence: días respecto de la fecha de la cuenta.
  const cfg: [abono: number, medio: "EFECTIVO" | "TRANSFERENCIA" | "TARJETA", resp: "PACIENTE" | "DOCTOR", vencida: boolean][] = [
    [1, "TARJETA", "PACIENTE", false], [1, "TRANSFERENCIA", "DOCTOR", false], [1, "EFECTIVO", "PACIENTE", false], [1, "TRANSFERENCIA", "PACIENTE", false],
    [0.5, "EFECTIVO", "PACIENTE", true], [0, "TRANSFERENCIA", "DOCTOR", true], [0.4, "TARJETA", "PACIENTE", false], [0, "EFECTIVO", "PACIENTE", false], [0, "TRANSFERENCIA", "DOCTOR", false], [0.5, "TARJETA", "PACIENTE", false],
  ];
  for (const [i, o] of ordenes.entries()) {
    const [abono, medio, resp, vencida] = cfg[i % cfg.length]!;
    const items = o.items.map((x) => ({ descripcion: x.nombre, cantidad: 1, valorUnitario: x.precio }));
    const total = totalItems(items);
    const responsable = resp === "DOCTOR" && o.doctorRemitenteId ? "DOCTOR" : "PACIENTE";
    const fecha = new Date(o.creadoEn.getTime() + DIA);
    const pago = Math.round(total * abono);
    await prisma.factura.create({
      data: {
        organizationId: org.id, numero: i + 1, pacienteId: o.pacienteId, ordenId: o.id, responsable,
        responsableId: responsable === "DOCTOR" ? o.doctorRemitenteId : null,
        total, fecha, vence: vencida ? new Date(fecha.getTime() + 15 * DIA) : null, estado: abono === 1 ? "PAGADA" : "ABIERTA",
        items: { create: items },
        pagos: pago > 0 ? { create: { valor: pago, medio, fecha: new Date(fecha.getTime() + DIA) } } : undefined,
      },
    });
  }
}

// --- Citas de la semana (lunes a sábado alrededor de hoy) ---
if ((await prisma.cita.count({ where: { organizationId: org.id } })) === 0) {
  const [cbct, pano, intra] = [await salaDe(salas[0]![0]), await salaDe(salas[1]![0]), await salaDe(salas[2]![0])];
  const agendadas = await prisma.orden.findMany({ where: { organizationId: org.id, estado: "AGENDADA" }, orderBy: { numero: "asc" } });
  const dato: [number, number, number, typeof cbct, "PROGRAMADA" | "CONFIRMADA" | "LLEGO" | "EN_ATENCION" | "ATENDIDA" | "NO_ASISTIO" | "CANCELADA", number | null][] = [
    // [día relativo, hora, paciente idx, sala, estado, índice en `agendadas`]
    [-2, 9, 5, pano, "ATENDIDA", null], [-2, 10, 6, cbct, "ATENDIDA", null], [-1, 9, 7, intra, "ATENDIDA", null], [-1, 15, 9, pano, "NO_ASISTIO", null],
    [0, 8, 10, cbct, "ATENDIDA", null], [0, 10, 11, cbct, "EN_ATENCION", null], [0, 11, 0, pano, "LLEGO", 0], [0, 15, 1, cbct, "CONFIRMADA", 1],
    [1, 9, 2, pano, "CONFIRMADA", 2], [1, 10, 3, intra, "PROGRAMADA", 3], [1, 14, 12, cbct, "PROGRAMADA", 4],
    [2, 9, 13, intra, "PROGRAMADA", null], [2, 11, 4, pano, "CANCELADA", null], [3, 10, 8, cbct, "PROGRAMADA", null],
  ];
  for (const [dia, h, p, sala, estado, oi] of dato) {
    await prisma.cita.create({
      data: { organizationId: org.id, salaId: sala.id, pacienteId: pacientes[p]!.id, ordenId: oi === null ? null : agendadas[oi]?.id ?? null, inicio: bog(dia, h), fin: bog(dia, h, 30), estado, notas: estado === "CANCELADA" ? "Canceló el paciente (mock)." : null },
    });
  }
}

// --- Plan de tratamiento, notas, laboratorio y seguimientos ---
if ((await prisma.planTratamientoItem.count({ where: { pacienteId: pacientes[2]!.id } })) === 0) {
  await prisma.planTratamientoItem.createMany({ data: [
    { pacienteId: pacientes[2]!.id, diente: 36, descripcion: "Endodoncia", valor: 650000, estado: "ACEPTADO", posicion: 0 },
    { pacienteId: pacientes[2]!.id, diente: 46, superficie: "O", descripcion: "Resina compuesta", valor: 180000, estado: "PLANEADO", posicion: 1 },
    { pacienteId: pacientes[2]!.id, descripcion: "Profilaxis y detartraje", valor: 120000, estado: "REALIZADO", posicion: 2 },
  ] });
  await prisma.notaClinica.create({ data: { pacienteId: pacientes[2]!.id, fecha: hace(10), texto: "Valoración inicial (dato mock). Se recomienda control con estudio imagenológico." } });
}
if ((await prisma.casoLaboratorio.count({ where: { organizationId: org.id } })) === 0) {
  await prisma.casoLaboratorio.createMany({ data: [
    { organizationId: org.id, pacienteId: pacientes[8]!.id, laboratorio: "Laboratorio Ficticio Andino", tipo: "Guía quirúrgica", dientes: "36", valor: 250000, estado: "ENVIADO", enviado: hace(5), entregaEsperada: hace(-2) },
    { organizationId: org.id, pacienteId: pacientes[2]!.id, laboratorio: "Laboratorio Ficticio Andino", tipo: "Modelo en resina 3D", valor: 90000, estado: "PENDIENTE", entregaEsperada: hace(-6) },
  ] });
}
if ((await prisma.seguimiento.count({ where: { organizationId: org.id } })) === 0) {
  const mes = new Date(Date.UTC(hoyBog.getUTCFullYear(), hoyBog.getUTCMonth(), 1));
  const sig = new Date(Date.UTC(hoyBog.getUTCFullYear(), hoyBog.getUTCMonth() + 1, 1));
  await prisma.seguimiento.createMany({ data: [
    { organizationId: org.id, pacienteId: pacientes[0]!.id, motivo: "CONTROL", prioridad: "ALTA", estado: "PENDIENTE", mesObjetivo: mes, nota: "Control de tratamiento (mock)." },
    { organizationId: org.id, pacienteId: pacientes[5]!.id, motivo: "ENTREGA_PENDIENTE", prioridad: "NORMAL", estado: "SIN_RESPUESTA", mesObjetivo: mes, intentos: 2, ultimoIntentoEn: hace(2) },
    { organizationId: org.id, pacienteId: pacientes[9]!.id, motivo: "ESTUDIO_SIN_TOMAR", prioridad: "NORMAL", estado: "PENDIENTE", mesObjetivo: mes },
    { organizationId: org.id, pacienteId: pacientes[6]!.id, motivo: "CONTROL", prioridad: "BAJA", estado: "AGENDADO", mesObjetivo: sig },
    { organizationId: org.id, pacienteId: pacientes[7]!.id, motivo: "REPETICION", prioridad: "NORMAL", estado: "COMPLETADO", mesObjetivo: mes, completadoEn: hace(3) },
  ] });
}

const n = async () => ({
  pacientes: await prisma.pacienteTenant.count({ where: { organizationId: org.id } }),
  ordenes: await prisma.orden.count({ where: { organizationId: org.id } }),
  citas: await prisma.cita.count({ where: { organizationId: org.id } }),
  facturas: await prisma.factura.count({ where: { organizationId: org.id } }),
});
console.log(`Seed demo listo en "${slug}":`, await n());
await prisma.$disconnect();
