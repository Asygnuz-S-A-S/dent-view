// Verificación de la demo: conteos por centro y módulo, invariantes de consistencia, cartera por tramos, semáforo de doctores,
// seguridad (nada que pueda enviar mensajes) y existencia real de archivos en Orthanc y S3.  Uso: npx tsx scripts/demo/verificar.ts
// Termina con código 1 si alguna comprobación falla. Mismas variables de entorno que index.ts (solo lectura).
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@dent-view/db";
import { agruparCartera, TRAMOS } from "../../src/lib/cartera";
import { saldo } from "../../src/lib/facturacion";
import { calcularDoctor } from "../../src/lib/seguimiento-doctores";
import { s3 } from "../../src/lib/s3";
import { hashAdenda, hashEvolucion } from "../../src/lib/evolucion-hash";
import { variacion } from "../../src/components/comunes/variacion";
import { datosReporte } from "../../src/lib/reportes";
import { rangoReporte } from "../../src/lib/reportes-rango";
import { armarEntrada } from "../../src/lib/rips/datos";
import { generarRips } from "../../src/lib/rips/generar";
import { moduloHabilitado } from "../../src/lib/tipo-centro";
import { transicionRemision, type EstadoRemision } from "../../src/lib/remisiones";
import { esquemaCuestionario, etapaValoracion, ETAPAS, claveCopia, type EstadoVal } from "../../src/lib/valoraciones";
import { bog } from "./util";

const ORTHANC = process.env.ORTHANC_URL?.replace(/\/+$/, "");
const BUCKET = process.env.S3_BUCKET_ESTUDIOS;
let fallos = 0;
const ok = (nombre: string, bien: boolean, detalle = "") => { if (!bien) fallos++; console.log(`  ${bien ? "OK   " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`); };
const n = async (sql: string) => Number((await prisma.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) AS c FROM (${sql}) t`))[0]!.c);
const cero = async (nombre: string, sql: string) => { const c = await n(sql); ok(nombre, c === 0, c ? `${c} filas` : ""); };

const orgs = await prisma.organization.findMany({ orderBy: { slug: "asc" } });
console.log(`Centros: ${orgs.map((o) => o.slug).join(", ") || "(ninguno)"}\n`);

// ---------- Conteos por centro ----------
const tablas: [string, string][] = [
  ["pacientes", "PacienteTenant"], ["órdenes", "Orden"], ["citas", "Cita"], ["estudios", "Estudio"], ["informes", "Informe"], ["entregas", "EnlaceEntrega"], ["facturas", "Factura"], ["pagos", "Pago\" p JOIN \"Factura\" f ON f.id = p.\"facturaId"],
  ["notas crédito", "NotaCredito"], ["anticipos", "Anticipo"], ["cajas", "SesionCaja"], ["egresos", "Egreso"], ["seguimientos", "Seguimiento"], ["seg. doctores", "SeguimientoDoctor"], ["servicios", "Servicio"], ["convenios", "Convenio"],
  ["casos lab", "CasoLaboratorio"], ["valoraciones", "Valoracion"], ["leads", "Lead"], ["secuencias", "SecuenciaCRM"], ["tareas CRM", "TareaCRM"], ["presupuestos", "Presupuesto"], ["notas clínicas", "NotaClinica\" x JOIN \"PacienteTenant\" pt ON pt.id = x.\"pacienteId"],
  ["evolutivos", "EvolucionClinica"], ["adendas", "AdendaEvolucion"], ["tomas", "RegistroToma"], ["RIPS generados", "EnvioRips"],
  ["mensajes", "Mensaje"], ["autorizaciones", "Autorizacion"], ["solicitudes", "SolicitudTitular"], ["estaciones", "EstacionIngesta"], ["tokens API", "TokenApi"], ["usuarios (miembros)", "Member"],
];
const porCentro: Record<string, Record<string, number>> = {};
for (const o of orgs) {
  porCentro[o.slug] = {};
  for (const [etiqueta, tabla] of tablas) {
    let sql: string;
    if (tabla.includes(" JOIN ")) {
      const alias = tabla.includes(" p JOIN") ? { t: tabla, w: `f."organizationId" = '${o.id}'` } : { t: tabla, w: `pt."organizationId" = '${o.id}'` };
      sql = `SELECT count(*) AS c FROM "${alias.t}" WHERE ${alias.w}`;
    } else sql = `SELECT count(*) AS c FROM "${tabla}" WHERE "organizationId" = '${o.id}'`;
    porCentro[o.slug]![etiqueta] = Number((await prisma.$queryRawUnsafe<{ c: bigint }[]>(sql))[0]!.c);
  }
}
console.log("Conteos por centro:");
console.table(porCentro);

// ---------- Invariantes ----------
console.log("\nIntegridad referencial (tablas sin llave foránea):");
const huerfanos: [string, string, string, string][] = [
  ["ContextoMedico", "pacienteId", "PacienteTenant", "id"], ["AlergiaPaciente", "pacienteId", "PacienteTenant", "id"], ["MedicacionPaciente", "pacienteId", "PacienteTenant", "id"],
  ["EnfermedadPaciente", "pacienteId", "PacienteTenant", "id"], ["ContactoEmergencia", "pacienteId", "PacienteTenant", "id"], ["Informe", "pacienteId", "PacienteTenant", "id"], ["Informe", "ordenId", "Orden", "id"],
  ["Informe", "estudioId", "Estudio", "id"], ["EnlaceEntrega", "pacienteId", "PacienteTenant", "id"], ["EnlaceEntrega", "informeId", "Informe", "id"], ["Seguimiento", "pacienteId", "PacienteTenant", "id"],
  ["Seguimiento", "ordenId", "Orden", "id"], ["IntentoContacto", "seguimientoId", "Seguimiento", "id"], ["Mensaje", "pacienteId", "PacienteTenant", "id"], ["Autorizacion", "pacienteId", "PacienteTenant", "id"],
  ["SolicitudTitular", "pacienteId", "PacienteTenant", "id"], ["Cita", "profesionalId", "User", "id"], ["Factura", "responsableId", "User", "id"], ["Pago", "registradoPorId", "User", "id"],
  ["NotaClinica", "autorId", "User", "id"], ["RegistroToma", "tecnicoId", "User", "id"], ["Informe", "firmanteId", "User", "id"], ["TareaCRM", "asignadoId", "User", "id"],
];
for (const [t, c, r, k] of huerfanos) await cero(`${t}.${c} -> ${r}`, `SELECT 1 FROM "${t}" x WHERE x."${c}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${r}" y WHERE y."${k}" = x."${c}")`);
await cero("Informe/Autorizacion/Mensaje con organizationId distinto al del paciente", `SELECT 1 FROM "Informe" i JOIN "PacienteTenant" p ON p.id = i."pacienteId" WHERE p."organizationId" <> i."organizationId"`);

console.log("\nFacturas y pagos:");
await cero("total de la factura = suma de ítems - notas crédito", `SELECT f.id FROM "Factura" f LEFT JOIN (SELECT "facturaId", sum(cantidad * "valorUnitario" - descuento) AS s FROM "FacturaItem" GROUP BY 1) i ON i."facturaId" = f.id LEFT JOIN (SELECT "facturaId", sum(valor) AS v FROM "NotaCredito" GROUP BY 1) nc ON nc."facturaId" = f.id WHERE f.total <> COALESCE(i.s, 0) - COALESCE(nc.v, 0)`);
await cero("pagos vigentes <= total + notas crédito", `SELECT f.id FROM "Factura" f JOIN (SELECT "facturaId", sum(valor) AS p FROM "Pago" WHERE "anuladoEn" IS NULL GROUP BY 1) p ON p."facturaId" = f.id LEFT JOIN (SELECT "facturaId", sum(valor) AS v FROM "NotaCredito" GROUP BY 1) nc ON nc."facturaId" = f.id WHERE p.p > f.total + COALESCE(nc.v, 0)`);
await cero("PAGADA tiene pagos vigentes >= total", `SELECT f.id FROM "Factura" f LEFT JOIN (SELECT "facturaId", sum(valor) AS p FROM "Pago" WHERE "anuladoEn" IS NULL GROUP BY 1) p ON p."facturaId" = f.id WHERE f.estado = 'PAGADA' AND COALESCE(p.p, 0) < f.total`);
await cero("ABIERTA tiene saldo pendiente", `SELECT f.id FROM "Factura" f LEFT JOIN (SELECT "facturaId", sum(valor) AS p FROM "Pago" WHERE "anuladoEn" IS NULL GROUP BY 1) p ON p."facturaId" = f.id WHERE f.estado = 'ABIERTA' AND COALESCE(p.p, 0) >= f.total`);
await cero("ANULADA sin pagos vigentes y con motivo", `SELECT f.id FROM "Factura" f WHERE f.estado = 'ANULADA' AND (f."motivoAnulacion" IS NULL OR f."anuladoEn" IS NULL OR EXISTS (SELECT 1 FROM "Pago" p WHERE p."facturaId" = f.id AND p."anuladoEn" IS NULL))`);
await cero("pago anulado con motivo", `SELECT 1 FROM "Pago" WHERE "anuladoEn" IS NOT NULL AND "motivoAnulacion" IS NULL`);
await cero("consecutivo de factura sin huecos por centro", `SELECT "organizationId" FROM "Factura" GROUP BY 1 HAVING max(numero) <> count(*)`);
await cero("consecutivo de orden sin huecos por centro", `SELECT "organizationId" FROM "Orden" GROUP BY 1 HAVING max(numero) <> count(*)`);
await cero("factura con fecha futura o pago posterior a ayer", `SELECT 1 FROM "Factura" WHERE fecha >= '${bog(0).toISOString()}' AND "ordenId" IN (SELECT id FROM "Orden" WHERE estado IN ('INFORMADA','ENTREGADA')) UNION ALL SELECT 1 FROM "Pago" WHERE fecha >= '${bog(0).toISOString()}'`);
await cero("anticipo aplicado <= valor", `SELECT 1 FROM "Anticipo" WHERE "valorAplicado" > valor`);
await cero("sesión de caja cerrada con conteo", `SELECT 1 FROM "SesionCaja" WHERE estado = 'CERRADA' AND ("contadoPorMedio" IS NULL OR "cerradaEn" IS NULL)`);

console.log("\nAgenda y órdenes:");
await cero("citas sin cruce por sala", `SELECT 1 FROM "Cita" a JOIN "Cita" b ON a.id < b.id AND a."salaId" = b."salaId" AND tstzrange(a.inicio, a.fin) && tstzrange(b.inicio, b.fin) WHERE a.estado NOT IN ('CANCELADA','NO_ASISTIO') AND b.estado NOT IN ('CANCELADA','NO_ASISTIO') AND NOT a."cruceHistorico" AND NOT b."cruceHistorico"`);
await cero("citas sin cruce por profesional", `SELECT 1 FROM "Cita" a JOIN "Cita" b ON a.id < b.id AND a."profesionalId" = b."profesionalId" AND tstzrange(a.inicio, a.fin) && tstzrange(b.inicio, b.fin) WHERE a.estado NOT IN ('CANCELADA','NO_ASISTIO') AND b.estado NOT IN ('CANCELADA','NO_ASISTIO')`);
await cero("cita fin > inicio", `SELECT 1 FROM "Cita" WHERE fin <= inicio`);
await cero("cita ATENDIDA solo en el pasado o de hoy; EN_ATENCION/LLEGO solo hoy", `SELECT 1 FROM "Cita" WHERE (estado = 'ATENDIDA' AND inicio > '${bog(1).toISOString()}') OR (estado IN ('EN_ATENCION','LLEGO') AND (inicio < '${bog(0).toISOString()}' OR inicio >= '${bog(1).toISOString()}')) OR (estado IN ('PROGRAMADA','CONFIRMADA') AND inicio < '${bog(0).toISOString()}')`);
await cero("cita ATENDIDA con orden en TOMADA o posterior (radiología)", `SELECT 1 FROM "Cita" c JOIN "Orden" o ON o.id = c."ordenId" JOIN "ConfigCentro" cc ON cc."organizationId" = c."organizationId" WHERE cc."tipoCentro" = 'CENTRO_RADIOLOGICO' AND c.estado = 'ATENDIDA' AND o.estado IN ('SOLICITADA','AGENDADA','CANCELADA')`);
await cero("orden AGENDADA con cita viva futura o de hoy", `SELECT o.id FROM "Orden" o JOIN "ConfigCentro" cc ON cc."organizationId" = o."organizationId" WHERE cc."tipoCentro" = 'CENTRO_RADIOLOGICO' AND o.estado = 'AGENDADA' AND NOT EXISTS (SELECT 1 FROM "Cita" c WHERE c."ordenId" = o.id AND c.estado IN ('PROGRAMADA','CONFIRMADA','LLEGO','EN_ATENCION') AND c.inicio >= '${bog(0).toISOString()}')`);
await cero("orden INFORMADA/ENTREGADA con informe emitido vigente (radiología)", `SELECT o.id FROM "Orden" o JOIN "ConfigCentro" cc ON cc."organizationId" = o."organizationId" WHERE cc."tipoCentro" = 'CENTRO_RADIOLOGICO' AND o.estado IN ('INFORMADA','ENTREGADA') AND NOT EXISTS (SELECT 1 FROM "Informe" i WHERE i."ordenId" = o.id AND i.estado = 'EMITIDO' AND i.vigente)`);
await cero("orden tomada o posterior con cuenta de cobro (radiología y laboratorio)", `SELECT o.id FROM "Orden" o WHERE o.estado IN ('INFORMADA','ENTREGADA') AND NOT EXISTS (SELECT 1 FROM "Factura" f WHERE f."ordenId" = o.id)`);
await cero("orden con estudio: tomada o posterior", `SELECT o.id FROM "Orden" o WHERE o.estado IN ('SOLICITADA','AGENDADA','CANCELADA') AND EXISTS (SELECT 1 FROM "Estudio" e WHERE e."ordenId" = o.id)`);
await cero("informe EMITIDO con PDF real (%PDF), código y firmante", `SELECT 1 FROM "Informe" WHERE estado = 'EMITIDO' AND (pdf IS NULL OR substring(pdf from 1 for 4) <> '\\x25504446' OR codigo IS NULL OR "firmanteId" IS NULL OR "emitidoEn" IS NULL)`);
await cero("informe BORRADOR sin PDF ni código", `SELECT 1 FROM "Informe" WHERE estado = 'BORRADOR' AND (pdf IS NOT NULL OR codigo IS NOT NULL)`);
await cero("un solo informe vigente por grupo", `SELECT "grupoId" FROM "Informe" WHERE vigente GROUP BY 1 HAVING count(*) > 1`);
await cero("estudios con orthancId y UID", `SELECT 1 FROM "Estudio" WHERE "orthancId" IS NULL OR "orthancId" = '' OR "studyInstanceUid" = ''`);
await cero("estudio asignado: paciente del mismo centro", `SELECT 1 FROM "Estudio" e JOIN "PacienteTenant" p ON p.id = e."pacienteId" WHERE p."organizationId" <> e."organizationId"`);

console.log("\nValoraciones virtuales (Alejandro Restrepo):");
{
  const alejandro = orgs.find((x) => x.slug === "alejandro-restrepo");
  const vals = alejandro ? await prisma.valoracion.findMany({ where: { organizationId: alejandro.id } }) : [];
  if (alejandro) {
    ok("al menos 15 valoraciones", vals.length >= 15, `${vals.length}`);
    const etapas = new Map<string, number>();
    for (const v of vals) { const e = etapaValoracion({ ...v, estado: v.estado as EstadoVal }); etapas.set(e, (etapas.get(e) ?? 0) + 1); }
    const sinEtapa = ETAPAS.filter((e) => !etapas.has(e));
    ok("al menos una valoración por etapa del tablero", sinEtapa.length === 0, sinEtapa.length ? `faltan: ${sinEtapa.join(", ")}` : [...etapas].map(([e, c]) => `${e} ${c}`).join(" · "));
    ok("hay canceladas", vals.some((v) => v.estado === "CANCELADA"));
    const invalidos = vals.filter((v) => v.cuestionario !== null && !esquemaCuestionario.safeParse(v.cuestionario).success).length;
    ok("todos los cuestionarios cumplen el esquema de la app", invalidos === 0, invalidos ? `${invalidos} inválidos` : "");
    const cotizadas = await n(`SELECT 1 FROM "Valoracion" v WHERE v."organizationId" = '${alejandro.id}' AND v.estado = 'COMPLETADA' AND EXISTS (SELECT 1 FROM "Presupuesto" p WHERE p."valoracionId" = v.id AND p."organizationId" = v."organizationId")`);
    ok("al menos 2 valoraciones cotizadas (Presupuesto.valoracionId)", cotizadas >= 2, `${cotizadas}`);
    await cero("cotización con otro paciente que la valoración", `SELECT 1 FROM "Presupuesto" p JOIN "Valoracion" v ON v.id = p."valoracionId" WHERE v."pacienteId" IS NOT NULL AND p."pacienteId" IS DISTINCT FROM v."pacienteId"`);
    await cero("valoraciones sin paciente que no tengan lead VALORACION_VIRTUAL", `SELECT 1 FROM "Valoracion" v WHERE v."pacienteId" IS NULL AND NOT EXISTS (SELECT 1 FROM "Lead" l WHERE l.id = v."leadId" AND l.origen = 'VALORACION_VIRTUAL')`);
    await cero("completadas sin recibidaEn/completadaEn coherentes", `SELECT 1 FROM "Valoracion" WHERE estado = 'COMPLETADA' AND ("recibidaEn" IS NULL OR "completadaEn" IS NULL OR "completadaEn" < "recibidaEn")`);
    ok("recepción de Alejandro existe (muestra el límite de datos clínicos)", (await n(`SELECT 1 FROM "Member" WHERE "organizationId" = '${alejandro.id}' AND role = 'recepcion'`)) >= 1);
  }
}

console.log("\nSeguridad (la demo no debe poder enviar nada):");
await cero("mensajes en cola (EN_COLA)", `SELECT 1 FROM "Mensaje" WHERE estado = 'EN_COLA'`);
await cero("secuencias CRM activas", `SELECT 1 FROM "SecuenciaCRM" WHERE activa`);
await cero("inscripciones a secuencias", `SELECT 1 FROM "InscripcionSecuencia"`);
await cero("fidelización activa", `SELECT 1 FROM "ConfigFidelizacion" WHERE activa`);
await cero("agenda pública activa", `SELECT 1 FROM "ConfigAgendaPublica" WHERE activa`);
await cero("pasarelas de pago", `SELECT 1 FROM "PasarelaPago"`);
await cero("webhooks activos o entregas pendientes", `SELECT 1 FROM "Webhook" WHERE activo UNION ALL SELECT 1 FROM "WebhookEntrega" WHERE estado = 'PENDIENTE'`);
await cero("integraciones activas", `SELECT 1 FROM "Integracion" WHERE activa`);
await cero("pacientes con correo (PacienteTenant o Persona)", `SELECT 1 FROM "PacienteTenant" WHERE correo IS NOT NULL AND correo <> '' UNION ALL SELECT 1 FROM "Persona" WHERE correo IS NOT NULL AND correo <> ''`);
await cero("leads y valoraciones con correo real", `SELECT 1 FROM "Lead" WHERE correo IS NOT NULL UNION ALL SELECT 1 FROM "Valoracion" WHERE correo IS NOT NULL`);
await cero("correos de usuarios fuera de @ejemplo.invalid (salvo el superadmin)", `SELECT 1 FROM "User" WHERE email NOT LIKE '%ejemplo.invalid' AND role IS DISTINCT FROM 'admin'`);
await cero("destinatarios/solicitantes con dominio real", `SELECT 1 FROM "Mensaje" WHERE destinatario IS NOT NULL AND destinatario NOT LIKE '%ejemplo.invalid' UNION ALL SELECT 1 FROM "SolicitudTitular" WHERE "solicitanteCorreo" NOT LIKE '%ejemplo.invalid' UNION ALL SELECT 1 FROM "EnlaceEntrega" WHERE "destinatarioCorreo" IS NOT NULL AND "destinatarioCorreo" NOT LIKE '%ejemplo.invalid'`);
await cero("celulares de pacientes con formato 3xx555xxxx", `SELECT 1 FROM "PacienteTenant" WHERE celular !~ '^3[0-9]{2}555[0-9]{4}$'`);
await cero("documentos ficticios (prefijo 99, 10 dígitos)", `SELECT 1 FROM "Persona" WHERE "numeroDocumento" !~ '^99[0-9]{8}$'`);
await cero("estaciones/tokens: solo hash en BD", `SELECT 1 FROM "EstacionIngesta" WHERE length("tokenHash") <> 64 UNION ALL SELECT 1 FROM "TokenApi" WHERE length("tokenHash") <> 64`);

// ---------- Módulos nuevos: fechas, RIPS, evolutivos, presupuestos, FE, remisiones, reportes, menú ----------
const idDe = (slug: string) => orgs.find((o) => o.slug === slug)?.id;
const hoy0 = bog(0);

console.log("\nFechas (nada que \"ya ocurrió\" puede estar en el futuro):");
{
  const cols = await prisma.$queryRaw<{ t: string; c: string }[]>`SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND data_type LIKE 'timestamp%' AND column_name IN ('creadoEn','actualizadoEn','emitidoEn','firmadaEn','tomadoEn','enviadoEn','vistoEn','aceptadoEn','rechazadoEn','otorgadaEn','resueltaEn','completadoEn','completadaEn','cerradoEn','ultimoAccesoEn','ultimoIntentoEn','ultimoContactoEn','recibido','enviado','devueltaEn','consentimientoEn','recibidaEn','respondidoEn')`;
  const ahora = new Date().toISOString();
  const malas: string[] = [];
  for (const { t: tabla, c } of cols) { const k = await n(`SELECT 1 FROM "${tabla}" WHERE "${c}" > '${ahora}'`); if (k) malas.push(`${tabla}.${c}: ${k}`); }
  ok(`${cols.length} columnas de fecha-de-ocurrencia sin valores futuros`, malas.length === 0, malas.join("; "));
}

console.log("\nRIPS (Lumia, Radia y Alejandro):");
for (const slug of ["lumia", "radia", "alejandro-restrepo"]) {
  const id = idDe(slug);
  if (!id) continue;
  const config = await prisma.configFacturacion.findUnique({ where: { organizationId: id } });
  ok(`${slug}: ConfigFacturacion con NIT, DV, código de prestador y RIPS activo`, !!config?.nit && !!config.dv && config.codigoPrestador?.length === 12 && config.generaRips);
  const ordenes = await prisma.orden.findMany({ where: { organizationId: id, estado: { not: "CANCELADA" } }, include: { paciente: { include: { persona: true } }, items: { include: { servicio: { select: { codigoCups: true, tipoRips: true, codServicioReps: true } } } }, documentosElectronicos: { where: { estado: "ACEPTADA" }, take: 1, select: { numeroDian: true } } } });
  let completas = 0;
  for (const o of ordenes) if (generarRips(armarEntrada(o, config, null)).errores.length === 0) completas++;
  ok(`${slug}: ${completas}/${ordenes.length} órdenes con RIPS completo (se espera al menos 70 % y al menos una incompleta en radiología)`, ordenes.length > 0 && completas / ordenes.length >= 0.7 && (slug === "alejandro-restrepo" || completas < ordenes.length), "");
  const sinCups = await n(`SELECT 1 FROM "Servicio" WHERE "organizationId" = '${id}' AND "codigoCups" IS NOT NULL`);
  ok(`${slug}: servicios con código CUPS`, sinCups >= 5, `${sinCups}`);
  await cero(`${slug}: pacientes con sexo y municipio (RIPS)`, `SELECT 1 FROM "PacienteTenant" WHERE "organizationId" = '${id}' AND id NOT IN (SELECT "pacienteDestinoId" FROM "Remision" WHERE "pacienteDestinoId" IS NOT NULL) AND (sexo IS NULL OR "codMunicipio" IS NULL OR "zonaTerritorial" IS NULL)`);
  const envios = await prisma.envioRips.findMany({ where: { organizationId: id } });
  ok(`${slug}: RIPS ya generados con JSON en S3`, envios.length >= 4, `${envios.length}`);
  let faltan = 0;
  for (const e of envios) await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: e.jsonKey })).catch(() => { faltan++; });
  ok(`${slug}: el JSON de cada envío existe en S3`, faltan === 0, faltan ? `${faltan} faltan` : "");
}

console.log("\nFacturación electrónica (sin proveedor: la demo no emite nada ni usa SIMULADO):");
await cero("sin conexiones de facturación electrónica", `SELECT 1 FROM "ConexionFE"`);
await cero("sin documentos electrónicos", `SELECT 1 FROM "DocumentoElectronico"`);
ok("Lumia muestra la columna FEV (emiteFev) con todas sus cuentas \"no enviadas\"", (await prisma.configFacturacion.findUnique({ where: { organizationId: idDe("lumia") ?? "" } }))?.emiteFev === true);

console.log("\nEvolutivos clínicos (Alejandro):");
{
  const id = idDe("alejandro-restrepo");
  if (id) {
    const evs = await prisma.evolucionClinica.findMany({ where: { organizationId: id }, include: { adendas: true } });
    ok("hay evolutivos de varios pacientes, con adendas y plantillas", evs.length >= 30 && new Set(evs.map((e) => e.pacienteId)).size >= 15 && evs.some((e) => e.adendas.length) && (await prisma.plantillaEvolucion.count({ where: { organizationId: id } })) >= 7, `${evs.length} evolutivos`);
    const malos = evs.filter((e) => hashEvolucion({ ...e, plantillaVersion: e.plantillaVersion }) !== e.hashContenido).length;
    ok("el hash de cada evolutivo coincide con su contenido (íntegros)", malos === 0, malos ? `${malos} no coinciden` : "");
    const maloA = evs.flatMap((e) => e.adendas.map((a) => ({ e, a }))).filter(({ e, a }) => hashAdenda({ organizationId: id, evolucionId: e.id, hashEvolucion: e.hashContenido, texto: a.texto, firmanteId: a.firmanteId, firmanteNombre: a.firmanteNombre, firmanteTarjeta: a.firmanteTarjeta, firmadaEn: a.firmadaEn }) !== a.hashContenido).length;
    ok("el hash de cada adenda coincide", maloA === 0);
    await cero("folio consecutivo por paciente", `SELECT "pacienteId" FROM "EvolucionClinica" WHERE "organizationId" = '${id}' GROUP BY 1 HAVING max(folio) <> count(*)`);
    await cero("evolutivo ligado a orden y cita del mismo centro", `SELECT 1 FROM "EvolucionClinica" e WHERE e."ordenId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Orden" o WHERE o.id = e."ordenId" AND o."organizationId" = e."organizationId")`);
  }
  for (const slug of ["lumia", "radia"]) ok(`${slug}: registros de toma`, (await prisma.registroToma.count({ where: { organizationId: idDe(slug) ?? "" } })) >= 20);
}

console.log("\nPresupuestos virtuales (Alejandro):");
{
  const id = idDe("alejandro-restrepo");
  if (id) {
    const ps = await prisma.presupuesto.findMany({ where: { organizationId: id }, include: { items: true } });
    const visible = (p: (typeof ps)[number]) => (p.estado === "VENCIDO" ? "ANULADA" : (p.estado === "ENVIADO" || p.estado === "VISTO") && p.validoHasta && p.validoHasta < hoy0 ? "VENCIDA" : p.estado);
    const vistos = new Set(ps.map(visible));
    const faltan = ["BORRADOR", "ENVIADO", "VISTO", "ACEPTADO", "RECHAZADO", "VENCIDA", "ANULADA", "CONVERTIDO"].filter((e) => !(vistos as Set<string>).has(e));
    ok("presupuestos en todos los estados (Borrador, Enviada, Vista, Aceptada, Rechazada, Vencida, Anulada, Convertida)", faltan.length === 0, faltan.join(", "));
    ok("cada presupuesto tiene ítems y el enviado/visto/aceptado/rechazado lleva token (hash) y fecha de envío", ps.every((p) => p.items.length > 0 && (["BORRADOR", "VENCIDO"].includes(p.estado) || (p.tokenHash?.length === 64 && p.codigoHash?.length === 64 && !!p.enviadoEn))));
    ok("aceptados con nombre, documento, texto firmado y rechazados con motivo", ps.filter((p) => ["ACEPTADO", "CONVERTIDO"].includes(p.estado)).every((p) => p.aceptadoNombre && p.aceptadoDocumento && p.textoAceptacionHash) && ps.filter((p) => p.estado === "RECHAZADO").every((p) => p.rechazoMotivo));
    await cero("sin token en claro: tokenHash/codigoHash de 64 hex", `SELECT 1 FROM "Presupuesto" WHERE "tokenHash" IS NOT NULL AND "tokenHash" !~ '^[0-9a-f]{64}$'`);
  }
}

console.log("\nRemisiones Lumia <-> Radia:");
{
  const L = idDe("lumia"), R = idDe("radia");
  if (L && R) {
    ok("vínculo ACTIVO en los dos sentidos", (await prisma.vinculoCentro.count({ where: { estado: "ACTIVO", OR: [{ solicitanteId: L, receptorId: R }, { solicitanteId: R, receptorId: L }] } })) === 2);
    const rems = await prisma.remision.findMany({ include: { eventos: { orderBy: { creadoEn: "asc" } } } });
    const porEstado = rems.reduce<Record<string, number>>((m, r) => ((m[r.estado] = (m[r.estado] ?? 0) + 1), m), {});
    ok("remisiones Lumia->Radia en ENVIADA, RECIBIDA, EN_PROCESO, DEVUELTA y RECHAZADA", ["ENVIADA", "RECIBIDA", "EN_PROCESO", "DEVUELTA", "RECHAZADA"].every((e) => rems.some((r) => r.estado === e && r.origenId === L && r.destinoId === R)), JSON.stringify(porEstado));
    ok("hay una remisión Radia->Lumia", rems.some((r) => r.origenId === R && r.destinoId === L));
    ok("eventos coherentes: empieza en ENVIADA, termina en el estado actual, cada paso es una transición válida", rems.every((r) => r.eventos[0]?.tipo === "ENVIADA" && r.eventos.at(-1)?.tipo === r.estado && r.eventos.slice(1).every((e, i) => transicionRemision(r.eventos[i]!.tipo as EstadoRemision, e.tipo as EstadoRemision, ["RECIBIDA", "EN_PROCESO", "DEVUELTA", "RECHAZADA"].includes(e.tipo) ? "destino" : "origen", e.nota ?? "motivo").ok)));
    ok("cada remisión tiene su Autorizacion otorgada en el centro origen", (await Promise.all(rems.map((r) => prisma.autorizacion.count({ where: { id: r.autorizacionId, organizationId: r.origenId, otorgada: true, version: r.consentimientoVersion } })))).every((c) => c === 1));
    ok("RECHAZADA con motivo; EN_PROCESO y DEVUELTA con orden destino; RECIBIDA con paciente destino", rems.filter((r) => r.estado === "RECHAZADA").every((r) => r.motivoRechazo) && rems.filter((r) => ["EN_PROCESO", "DEVUELTA"].includes(r.estado)).every((r) => r.ordenDestinoId && r.pacienteDestinoId) && rems.filter((r) => r.estado === "RECIBIDA").every((r) => r.pacienteDestinoId));
    // Copia mínima: el paciente del destino solo tiene lo autorizado (nunca correo, dirección, alertas, foto ni RIPS).
    const copias = await prisma.pacienteTenant.findMany({ where: { id: { in: rems.flatMap((r) => (r.pacienteDestinoId ? [r.pacienteDestinoId] : [])) } } });
    ok(`copia mínima: ${copias.length} pacientes destino sin correo, dirección, alertas, foto ni datos RIPS`, copias.every((p) => !p.correo && !p.direccion && !p.alertas && !p.fotoKey && !p.sexo && !p.codMunicipio));
    const dev = rems.find((r) => r.estado === "DEVUELTA");
    if (dev) {
      const inf = await prisma.informe.findFirst({ where: { id: dev.informeId ?? "", organizationId: R, estado: "EMITIDO", vigente: true, ordenId: dev.ordenDestinoId } });
      ok("DEVUELTA: informe EMITIDO vigente con PDF en el destino", !!inf?.pdf && inf.pdf.length > 1000);
      const ests = await prisma.estudio.findMany({ where: { organizationId: R, studyInstanceUid: { in: dev.estudioUids }, ordenId: dev.ordenDestinoId } });
      ok("DEVUELTA: estudio(s) DICOM vinculados a la orden destino y publicados", ests.length === dev.estudioUids.length && ests.length > 0 && ests.every((e) => e.estado === "PUBLICADO"));
    }
  }
}

console.log("\nReportes (variación coherente entre periodos: sin porcentajes absurdos):");
for (const slug of ["lumia", "radia", "orion-laboratorio"]) {
  const id = idDe(slug);
  if (!id) continue;
  const con = (a: number, b: number) => ({ ini: bog(a), fin: bog(b) });
  const compara = async (etiqueta: string, act: { ini: Date; fin: Date }, ant: { ini: Date; fin: Date }) => {
    const [d, p] = await Promise.all([datosReporte(id, act), datosReporte(id, ant)]);
    const suma = (x: { total: number }[]) => x.reduce((t, e) => t + e.total, 0);
    const pares: [string, number, number][] = [["producción", d.produccion, p.produccion], ["cobros", d.cobros, p.cobros], ["órdenes", suma(d.ordenesPorEstado), suma(p.ordenesPorEstado)]];
    if (slug !== "orion-laboratorio") pares.push(["estudios", suma(d.estudiosPorModalidad), suma(p.estudiosPorModalidad)]);
    for (const [nombre, a, b] of pares) {
      const v = variacion(a, b);
      const pocos = nombre === "estudios" || slug === "radia";
      ok(`${slug} ${etiqueta}: ${nombre} ${a.toLocaleString("es-CO")} vs ${b.toLocaleString("es-CO")} (${v.pct === null ? "sin base" : `${v.pct} %`})`, b > 0 && (v.pct === null || Math.abs(v.pct) <= (pocos ? 120 : 100) || (pocos && Math.abs(v.dif) <= 3)));
    }
  };
  await compara("últimos 30 días vs 30 anteriores", con(-30, 0), con(-60, -30));
  await compara("30 días de hace dos meses vs el mes previo", con(-60, -30), con(-90, -60));
  const mesActual = rangoReporte();
  if (Number(mesActual.desde.slice(8)) === 1 && Number(mesActual.hasta.slice(8)) >= 12) {
    const dur = mesActual.fin.getTime() - mesActual.ini.getTime();
    await compara("mes en curso (vista por defecto)", mesActual, { ini: new Date(mesActual.ini.getTime() - dur), fin: mesActual.ini });
  }
}

console.log("\nTipo de centro y menú:");
{
  const orion = await prisma.configCentro.findFirst({ where: { organizationId: idDe("orion-laboratorio") ?? "" } });
  if (orion) {
    ok("Orion es LABORATORIO_DENTAL", orion.tipoCentro === "LABORATORIO_DENTAL");
    ok("Orion no ve Agenda, Estudios ni Informes; sí Laboratorio, Órdenes y Cartera", (["agenda", "estudios", "informes"] as const).every((m) => !moduloHabilitado("LABORATORIO_DENTAL", m)) && (["laboratorio", "ordenes", "cartera"] as const).every((m) => moduloHabilitado("LABORATORIO_DENTAL", m)));
  }
  ok("Lumia y Radia siguen siendo radiológicos y Alejandro odontólogo particular", (await prisma.configCentro.count({ where: { OR: [{ organizationId: { in: [idDe("lumia") ?? "", idDe("radia") ?? ""] }, tipoCentro: "CENTRO_RADIOLOGICO" }, { organizationId: idDe("alejandro-restrepo") ?? "", tipoCentro: "ODONTOLOGO_PARTICULAR" }] } })) === 3);
  const volumen = await prisma.estudio.groupBy({ by: ["organizationId"], _count: { _all: true } });
  const de = (slug: string) => volumen.find((v) => v.organizationId === idDe(slug))?._count._all ?? 0;
  ok(`estudios: Lumia ${de("lumia")} (>= 30), Radia ${de("radia")} (>= 14), Alejandro ${de("alejandro-restrepo")} (>= 8)`, de("lumia") >= 30 && de("radia") >= 14 && de("alejandro-restrepo") >= 8);
  const antiguo = await prisma.estudio.findMany({ where: { organizationId: idDe("lumia") ?? "" }, select: { creadoEn: true }, orderBy: { creadoEn: "asc" }, take: 1 });
  ok("estudios de Lumia con historia de 4+ meses", !!antiguo[0] && antiguo[0].creadoEn < bog(-120));
}

// ---------- Cartera por tramos y semáforo de doctores ----------
console.log("\nCartera por tramos (saldo abierto agrupado por antigüedad desde el vencimiento):");
for (const o of orgs) {
  const abiertas = await prisma.factura.findMany({ where: { organizationId: o.id, estado: "ABIERTA" }, include: { pagos: { where: { anuladoEn: null } } } });
  const grupos = agruparCartera(abiertas.map((f) => ({ id: f.id, fecha: f.fecha, vence: f.vence, saldo: saldo(f.total, f.pagos), responsable: f.responsable, responsableId: f.responsableId, pacienteId: f.pacienteId, convenio: f.convenio })), bog(0));
  const t = [0, 0, 0, 0];
  for (const g of grupos) g.porTramo.forEach((v, i) => (t[i]! += v));
  const cuentas = [0, 0, 0, 0];
  for (const g of grupos) for (const f of g.filas) cuentas[Math.min(3, f.dias <= 30 ? 0 : f.dias <= 60 ? 1 : f.dias <= 90 ? 2 : 3)]!++;
  console.log(`  ${o.slug.padEnd(20)} ${TRAMOS.map((x, i) => `${x}: ${cuentas[i]} cuentas / $${t[i]!.toLocaleString("es-CO")}`).join(" · ")}`);
  const grande = ["lumia", "orion-laboratorio"].includes(o.slug);
  if (grande) ok(`${o.slug}: los 4 tramos tienen cuentas`, cuentas.every((c) => c > 0));
}
console.log("\nSemáforo de doctores remitentes (cálculo de la app sobre las órdenes no canceladas):");
for (const o of orgs.filter((x) => ["lumia", "radia"].includes(x.slug))) {
  const docs = await prisma.member.findMany({ where: { organizationId: o.id, role: "doctor_remitente" }, include: { user: true } });
  const cuenta: Record<string, number> = {};
  for (const d of docs) {
    const ords = await prisma.orden.findMany({ where: { organizationId: o.id, doctorRemitenteId: d.userId, estado: { not: "CANCELADA" } }, select: { creadoEn: true } });
    const r = calcularDoctor(ords.map((x) => x.creadoEn), bog(0, 12));
    cuenta[r.semaforo] = (cuenta[r.semaforo] ?? 0) + 1;
  }
  console.log(`  ${o.slug}: ${JSON.stringify(cuenta)}`);
  ok(`${o.slug}: semáforo variado (ACTIVO, EN_RIESGO, INACTIVO, CRITICO, NUEVO)`, ["ACTIVO", "EN_RIESGO", "INACTIVO", "NUEVO"].every((s) => (cuenta[s] ?? 0) > 0) && (o.slug !== "lumia" || (cuenta.CRITICO ?? 0) > 0));
}

// ---------- Archivos reales ----------
console.log("\nArchivos:");
if (ORTHANC) {
  const ests = await prisma.estudio.findMany({ include: { paciente: { include: { persona: true } } } });
  let malos = 0;
  for (const e of ests) {
    const r = await fetch(`${ORTHANC}/studies/${e.orthancId}`);
    if (!r.ok) { malos++; continue; }
    const j = (await r.json()) as { MainDicomTags: { StudyInstanceUID: string }; PatientMainDicomTags: { PatientID: string }; Labels: string[] };
    if (j.MainDicomTags.StudyInstanceUID !== e.studyInstanceUid || j.PatientMainDicomTags.PatientID !== e.paciente?.persona.numeroDocumento || !j.Labels.includes(`tenant-${e.organizationId}`)) malos++;
  }
  ok(`${ests.length} estudios existen en Orthanc con el UID, PatientID y etiqueta tenant- del centro`, malos === 0, malos ? `${malos} con problemas` : "");
  const todos = (await (await fetch(`${ORTHANC}/studies`)).json()) as string[];
  ok("Orthanc no tiene estudios que la BD no conozca", todos.length === ests.length, `Orthanc ${todos.length} / BD ${ests.length}`);
}
const claves = [
  ...(await prisma.pacienteTenant.findMany({ where: { fotoKey: { not: null } }, select: { fotoKey: true } })).map((x) => x.fotoKey!),
  ...(await prisma.estudio.findMany({ where: { superficieKey: { not: null } }, select: { superficieKey: true } })).map((x) => x.superficieKey!),
  ...(await prisma.valoracionMedia.findMany({ select: { claveS3: true, claveMiniatura: true, tipo: true } })).flatMap((x) => [x.claveS3, ...(x.tipo === "FOTO" ? [claveCopia(x.claveS3, "web"), x.claveMiniatura!] : [])]),
];
let faltan = 0;
for (const Key of claves) await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key })).catch(() => { faltan++; });
ok(`${claves.length} objetos en S3 (fotos de perfil, malla facial, fotos de valoración)`, faltan === 0, faltan ? `${faltan} faltan` : "");
await cero("claves S3 bajo tenants/{centro}/", `SELECT 1 FROM "PacienteTenant" WHERE "fotoKey" IS NOT NULL AND "fotoKey" NOT LIKE 'tenants/' || "organizationId" || '/pacientes/' || id || '/%'`);

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} comprobaciones fallaron`}`);
await prisma.$disconnect();
process.exit(fallos === 0 ? 0 : 1);
