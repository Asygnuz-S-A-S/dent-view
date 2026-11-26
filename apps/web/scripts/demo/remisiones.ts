// Remisiones entre Lumia y Radia: vínculo activo en los dos sentidos y siete remisiones en estados variados (siguen las mismas reglas que la app:
// copia mínima, Autorizacion de consentimiento, eventos por transición, paciente y orden del destino propios, informe emitido y estudio DICOM vinculado).
// Se llama una sola vez, DESPUÉS de construir Lumia y Radia. Datos 100 % ficticios; no crea mensajes (nada puede enviar correo).
import { prisma } from "@dent-view/db";
import { fechaLarga } from "../../src/lib/fechas";
import { generarCodigo } from "../../src/lib/informes";
import { generarPdfInforme } from "../../src/lib/informe-pdf";
import { calcularEdad } from "../../src/lib/pacientes";
import { crearPacienteEnCentro } from "../../src/lib/pacientes-centro";
import { CONSENTIMIENTO_REMISION_V, copiaMinima, TEXTO_CONSENTIMIENTO_REMISION, type EstadoRemision } from "../../src/lib/remisiones";
import { cupsDe, HALLAZGOS, tipoRipsDe } from "./catalogos";
import { RADIA } from "./centros";
import { fechaDicom, generarYSubir, nombreDicom, planEstudio, uidEstudio } from "./estudios";
import { idUsuario } from "./nucleo";
import { bog, crearRng, DIA, enMin, log, type Entorno } from "./util";

type Evt = { tipo: string; en: Date; actor: string; nota?: string };
const URL_BASE = () => process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:8080";
const ahora = () => new Date(Date.now() - 60_000);
const pasado = (d: Date) => (d > ahora() ? ahora() : d);

export async function construirRemisiones(env: Entorno) {
  const [lumia, radia] = await Promise.all([prisma.organization.findUnique({ where: { slug: "lumia" } }), prisma.organization.findUnique({ where: { slug: "radia" } })]);
  if (!lumia || !radia) throw new Error("Remisiones: faltan los centros lumia y radia");
  if (await prisma.vinculoCentro.count({ where: { OR: [{ solicitanteId: lumia.id }, { receptorId: lumia.id }] } })) { log("  remisiones: ya existen, no se vuelven a crear."); return; }
  const rng = crearRng("remisiones");
  const u = (slug: string, local: string) => idUsuario(`${local}@${slug}.ejemplo.invalid`);
  const lum = { admin: u("lumia", "admin"), recepcion: u("lumia", "recepcion"), rad1: u("lumia", "radiologo1"), rad2: u("lumia", "radiologo2") };
  const rad = { admin: u("radia", "admin"), recepcion: u("radia", "recepcion"), radiologo: u("radia", "radiologo") };
  const nombreLum = { [lum.admin]: "Camila Restrepo Ospina", [lum.recepcion]: "Paola Giraldo Marín", [lum.rad1]: "Dra. Sofía Arango Villegas", [lum.rad2]: "Dr. Daniel Cortés Pardo" } as Record<string, string>;

  // ---- Vínculos activos en los dos sentidos ----
  const vLR = await prisma.vinculoCentro.create({ data: { solicitanteId: lumia.id, receptorId: radia.id, estado: "ACTIVO", solicitadoPorId: lum.admin, respondidoPorId: rad.admin, respondidoEn: bog(-30, 10), creadoEn: bog(-31, 9) } });
  const vRL = await prisma.vinculoCentro.create({ data: { solicitanteId: radia.id, receptorId: lumia.id, estado: "ACTIVO", solicitadoPorId: rad.admin, respondidoPorId: lum.admin, respondidoEn: bog(-28, 11), creadoEn: bog(-29, 9) } });

  // ---- Pacientes de origen (siete de Lumia con CC; uno de Radia para el sentido contrario) ----
  const delOrigen = async (orgId: string, n: number, saltar = 0) =>
    prisma.pacienteTenant.findMany({ where: { organizationId: orgId, persona: { tipoDocumento: "CC" } }, include: { persona: true }, orderBy: { id: "asc" }, skip: saltar, take: n });
  const pacsL = await delOrigen(lumia.id, 6, 10);
  const [pacR] = await delOrigen(radia.id, 1, 3);
  let n = 0;
  const alcances = [["IDENTIFICACION", "CONTACTO", "FECHA_NACIMIENTO"], ["IDENTIFICACION", "FECHA_NACIMIENTO"], ["IDENTIFICACION", "CONTACTO"], ["IDENTIFICACION", "CONTACTO", "FECHA_NACIMIENTO", "EMBARAZO"], ["IDENTIFICACION"], ["IDENTIFICACION", "CONTACTO", "FECHA_NACIMIENTO"]];
  const MOTIVOS: [string, string][] = [
    ["Evaluación previa a la colocación de dos implantes en zona 36 y 46", "CBCT mandíbula"],
    ["Control de ortodoncia: se requiere cefalometría actualizada", "Cefalométrica lateral"],
    ["Dolor persistente en el 26 tras endodoncia, descartar lesión periapical", "Periapical individual"],
    ["Estudio de terceros molares incluidos para planeación quirúrgica", "Panorámica"],
    ["Valoración de articulación temporomandibular por dolor y chasquido", "CBCT ATM bilateral"],
    ["Planeación de rehabilitación oral completa", "CBCT bimaxilar"],
    ["Control de crecimiento y desarrollo maxilar", "Panorámica y cefalométrica"],
  ];

  type Plan = { estado: EstadoRemision; dia: number; eventos: Evt[]; motivoRechazo?: string; origen: "L" | "R" };
  const planes: Plan[] = [
    { origen: "L", estado: "DEVUELTA", dia: -12, eventos: [] },
    { origen: "L", estado: "EN_PROCESO", dia: -5, eventos: [] },
    { origen: "L", estado: "RECIBIDA", dia: -3, eventos: [] },
    { origen: "L", estado: "ENVIADA", dia: -1, eventos: [] },
    { origen: "L", estado: "RECHAZADA", dia: -7, eventos: [], motivoRechazo: "El centro no tiene tomógrafo de campo amplio (FOV 15x15) como pide la remisión. Se sugiere otro centro con tomografía de cráneo completo." },
    { origen: "L", estado: "CANCELADA", dia: -9, eventos: [] },
    { origen: "R", estado: "ENVIADA", dia: -1, eventos: [] },
  ];

  const resumen: Record<string, number> = {};
  const planDicom: ReturnType<typeof planEstudio>[] = [];
  for (const pl of planes) {
    n++;
    const deL = pl.origen === "L";
    const orgO = deL ? lumia : radia, orgD = deL ? radia : lumia;
    const pac = deL ? pacsL[n - 1]! : pacR!;
    const alcance = alcances[(n - 1) % alcances.length]!;
    const creado = bog(pl.dia, 15, 20);
    const [motivo, estudios] = MOTIVOS[n - 1]!;
    const creador = deL ? (n % 2 ? lum.admin : lum.rad1) : rad.admin;
    const remitenteNombre = deL ? nombreLum[creador]! : "Andrés Mauricio Pardo Lozano";
    const copia = copiaMinima({ nombre: pac.nombre, fechaNacimiento: pac.fechaNacimiento, celular: pac.celular, persona: pac.persona }, alcance, alcance.includes("EMBARAZO") ? false : null);
    const aut = await prisma.autorizacion.create({
      data: {
        organizationId: orgO.id, pacienteId: pac.id, tipo: "DATOS", finalidad: `remisión de datos a ${orgD.name}`, otorgada: true, otorgadaEn: creado,
        textoMostrado: `${TEXTO_CONSENTIMIENTO_REMISION}\nAlcance: ${alcance.join(", ")}`, version: CONSENTIMIENTO_REMISION_V, registradoPorId: creador, creadoEn: creado,
      },
    });
    const eventos: Evt[] = [{ tipo: "ENVIADA", en: creado, actor: creador }];
    let pacienteDestinoId: string | null = null, ordenDestinoId: string | null = null, informeId: string | null = null, estudioUids: string[] = [], devueltaEn: Date | null = null;

    // Lado destino según el estado (solo el sentido Lumia -> Radia avanza; el contrario queda en ENVIADA).
    if (deL && ["RECIBIDA", "EN_PROCESO", "DEVUELTA"].includes(pl.estado)) {
      const recibida = enMin(creado, 60 * 20);
      const res = await crearPacienteEnCentro(radia.id, { tipoDocumento: copia.tipoDocumento, numeroDocumento: copia.numeroDocumento }, { nombre: copia.nombre, fechaNacimiento: copia.fechaNacimiento, celular: copia.celular });
      pacienteDestinoId = "existente" in res ? res.existente : res.creado.id;
      await prisma.evento.create({ data: { organizationId: radia.id, pacienteId: pacienteDestinoId, actorId: rad.recepcion, tipo: "paciente.creado", detalle: { origen: "remision" }, creadoEn: pasado(recibida) } });
      eventos.push({ tipo: "RECIBIDA", en: recibida, actor: rad.recepcion });
    }
    if (deL && ["EN_PROCESO", "DEVUELTA"].includes(pl.estado)) {
      // Orden del destino con los servicios pedidos (numeración consecutiva por centro).
      const srv = await prisma.servicio.findMany({ where: { organizationId: radia.id, nombre: { in: pl.estado === "DEVUELTA" ? ["Panorámica"] : ["CBCT 1 zona"] } } });
      const numero = ((await prisma.orden.aggregate({ where: { organizationId: radia.id }, _max: { numero: true } }))._max.numero ?? 0) + 1;
      const enProceso = enMin(creado, 60 * 26);
      const total = srv.reduce((t, s) => t + (s.precioDigital ?? 0), 0);
      const orden = await prisma.orden.create({
        data: {
          organizationId: radia.id, numero, pacienteId: pacienteDestinoId!, estado: pl.estado === "DEVUELTA" ? "INFORMADA" : "SOLICITADA", entrega: "DIGITAL", observaciones: `Remisión de ${lumia.name}: ${motivo}`, creadoPorId: rad.recepcion, creadoEn: enProceso,
          tipoUsuario: "05", finalidad: "15", causaMotivoAtencion: "13", viaIngreso: "01", tipoDiagnostico: "01", diagnosticoPrincipal: pl.estado === "DEVUELTA" ? "K011" : null, diagnosticosRelacionados: [], profesionalAtiendeId: rad.radiologo, ripsActualizadoEn: enProceso,
          items: { create: srv.map((s) => ({ servicioId: s.id, nombre: s.nombre, precio: s.precioDigital ?? 0, descuento: 0, codigoCups: cupsDe(s.nombre), tipoRips: tipoRipsDe(s.nombre) })) },
        },
      });
      ordenDestinoId = orden.id;
      await prisma.evento.create({ data: { organizationId: radia.id, pacienteId: pacienteDestinoId, actorId: rad.recepcion, tipo: "orden.creada", detalle: { ordenId: orden.id, numero, origen: "remision" }, creadoEn: pasado(enProceso) } });
      eventos.push({ tipo: "EN_PROCESO", en: enProceso, actor: rad.recepcion });

      if (pl.estado === "DEVUELTA") {
        // Toma, estudio DICOM vinculado, informe emitido con PDF y cobro.
        const tomaEn = bog(pl.dia + 2, 9, 30);
        const sala = (await prisma.sala.findFirst({ where: { organizationId: radia.id, nombre: { contains: "Panorámico" } } }))!;
        const libre = async (ini: number) => { for (let m = ini; m < 17 * 60; m += 15) { const a = bog(pl.dia + 2, 0, m), b = bog(pl.dia + 2, 0, m + 30); if (!(await prisma.cita.count({ where: { salaId: sala.id, estado: { notIn: ["CANCELADA", "NO_ASISTIO"] }, inicio: { lt: b }, fin: { gt: a } } }))) return m; } throw new Error("Sin hueco para la toma de la remisión"); };
        const min = await libre(9 * 60 + 30);
        const cita = await prisma.cita.create({ data: { organizationId: radia.id, salaId: sala.id, pacienteId: pacienteDestinoId!, ordenId: orden.id, inicio: bog(pl.dia + 2, 0, min), fin: bog(pl.dia + 2, 0, min + 30), estado: "ATENDIDA", servicioId: srv[0]!.id, origen: "INTERNA", creadoEn: enMin(enProceso, 30) } });
        const uidStudy = uidEstudio("radia-rem", 1);
        const plan = planEstudio({
          key: "radia-rem-px-1", tipo: "PX", patientId: copia.numeroDocumento, patientName: nombreDicom(copia.nombre), birthDate: copia.fechaNacimiento ? fechaDicom(copia.fechaNacimiento) : "", sex: pac.sexo === "H" ? "M" : "F",
          studyDate: fechaDicom(new Date(Date.UTC(tomaEn.getUTCFullYear(), tomaEn.getUTCMonth(), tomaEn.getUTCDate()))), studyUid: uidStudy, desc: "Panorámica", seed: 777, centro: RADIA.def.nombre, remitente: remitenteNombre, accession: `RAD-${numero}`,
        });
        planDicom.push(plan);
        const estudio = await prisma.estudio.create({ data: { organizationId: radia.id, pacienteId: pacienteDestinoId, studyInstanceUid: plan.studyUid, orthancId: plan.orthancId, modalidad: "PX", descripcion: plan.desc, fechaEstudio: new Date(Date.UTC(tomaEn.getUTCFullYear(), tomaEn.getUTCMonth(), tomaEn.getUTCDate())), ordenId: orden.id, estado: "PUBLICADO", creadoEn: enMin(cita.inicio, 25), actualizadoEn: enMin(cita.inicio, 25) } });
        await prisma.registroToma.create({ data: { organizationId: radia.id, pacienteId: pacienteDestinoId, estudioId: estudio.id, ordenId: orden.id, tecnicoId: rad.recepcion, salaId: sala.id, tomadoEn: cita.inicio, repeticiones: 0 } });
        await prisma.evento.create({ data: { organizationId: radia.id, pacienteId: pacienteDestinoId, actorId: null, tipo: "estudio.vinculado", detalle: { estudioId: estudio.id, ordenId: orden.id, origen: "ingesta" }, creadoEn: enMin(cita.inicio, 26) } });

        const config = await prisma.configCentro.findUniqueOrThrow({ where: { organizationId: radia.id } });
        const tpl = HALLAZGOS.PX!;
        const emitido = enMin(cita.inicio, 60 * 5);
        let codigo = generarCodigo((m) => rng.int(0, m - 1));
        while (await prisma.informe.count({ where: { codigo } })) codigo = generarCodigo((m) => rng.int(0, m - 1));
        const tarjeta = RADIA.radiologos[0]!;
        const pdf = await generarPdfInforme({
          membrete: { nombre: RADIA.def.nombre, direccion: `${RADIA.def.direccion}, ${RADIA.def.ciudad}`, telefono: RADIA.def.telefono, correo: RADIA.def.correo, registro: RADIA.def.registro, logo: config.logo },
          paciente: { nombre: copia.nombre, documento: `${copia.tipoDocumento} ${copia.numeroDocumento}`, nacimiento: copia.fechaNacimiento ? copia.fechaNacimiento.toLocaleDateString("es-CO", { timeZone: "UTC" }) : "No informada", edad: copia.fechaNacimiento ? calcularEdad(copia.fechaNacimiento, bog(0)) : null },
          orden: `#${String(numero).padStart(4, "0")}`, remitente: remitenteNombre, estudioFecha: fechaLarga(cita.inicio), motivo, tecnica: "Radiografía panorámica digital", hallazgos: tpl.hallazgos[0]!, impresion: tpl.impresion[0]!, recomendaciones: tpl.recomendaciones[0] ?? null,
          alertas: [], capturas: [], colorPrimario: RADIA.def.color, firmante: { nombre: tarjeta.nombre, tarjeta: tarjeta.tarjeta }, emitidoEn: fechaLarga(emitido), version: 1, codigo, urlVerificacion: `${URL_BASE()}/verificar/${codigo}`,
        });
        const informe = await prisma.informe.create({
          data: {
            organizationId: radia.id, grupoId: "radia-inf-rem-1", id: "radia-inf-rem-1", version: 1, vigente: true, estado: "EMITIDO", pacienteId: pacienteDestinoId!, ordenId: orden.id, estudioId: estudio.id, motivo, tecnica: "Radiografía panorámica digital",
            hallazgos: tpl.hallazgos[0]!, impresion: tpl.impresion[0]!, recomendaciones: tpl.recomendaciones[0] ?? null, firmanteId: rad.radiologo, firmanteNombre: tarjeta.nombre, firmanteTarjeta: tarjeta.tarjeta, creadoPorId: rad.radiologo,
            codigo, pdf: new Uint8Array(pdf), emitidoEn: emitido, creadoEn: enMin(emitido, -90), actualizadoEn: emitido,
          },
        });
        await prisma.evento.create({ data: { organizationId: radia.id, pacienteId: pacienteDestinoId, actorId: rad.radiologo, tipo: "informe.emitido", detalle: { informeId: informe.id, version: 1, codigo }, creadoEn: emitido } });
        // Cuenta de cobro pagada (consecutivo por centro).
        const fnum = ((await prisma.factura.aggregate({ where: { organizationId: radia.id }, _max: { numero: true } }))._max.numero ?? 0) + 1;
        const fecha = enMin(emitido, 30);
        await prisma.factura.create({
          data: {
            id: "radia-fac-rem-1", organizationId: radia.id, numero: fnum, pacienteId: pacienteDestinoId, ordenId: orden.id, responsable: "PACIENTE", estado: "PAGADA", total, fecha, vence: new Date(fecha.getTime() + 15 * DIA),
            items: { create: srv.map((s, k) => ({ id: `radia-fac-rem-1-i${k + 1}`, descripcion: s.nombre, cantidad: 1, valorUnitario: s.precioDigital ?? 0, descuento: 0, servicioId: s.id })) },
            pagos: { create: [{ id: "radia-fac-rem-1-p1", valor: total, medio: "TRANSFERENCIA", fecha: enMin(fecha, 20), registradoPorId: rad.recepcion }] },
          },
        });
        informeId = informe.id;
        estudioUids = [plan.studyUid];
        devueltaEn = enMin(emitido, 120);
        eventos.push({ tipo: "DEVUELTA", en: devueltaEn, actor: rad.radiologo });
      }
    }
    if (pl.estado === "RECHAZADA") eventos.push({ tipo: "RECHAZADA", en: enMin(creado, 60 * 22), actor: rad.admin, nota: pl.motivoRechazo });
    if (pl.estado === "CANCELADA") eventos.push({ tipo: "CANCELADA", en: enMin(creado, 60 * 30), actor: creador });

    const ultimo = eventos[eventos.length - 1]!;
    const rem = await prisma.remision.create({
      data: {
        vinculoId: deL ? vLR.id : vRL.id, origenId: orgO.id, destinoId: orgD.id, estado: pl.estado, pacienteOrigenId: pac.id, autorizacionId: aut.id, creadoPorId: creador,
        ...copia, motivo, estudiosSolicitados: estudios, remitenteNombre, alcance, consentimientoTexto: TEXTO_CONSENTIMIENTO_REMISION, consentimientoVersion: CONSENTIMIENTO_REMISION_V, consentimientoPorId: creador, consentimientoEn: creado,
        pacienteDestinoId, ordenDestinoId, motivoRechazo: pl.motivoRechazo ?? null, informeId, estudioUids, devueltaEn, creadoEn: creado, actualizadoEn: pasado(ultimo.en),
      },
    });
    for (const e of eventos) await prisma.remisionEvento.create({ data: { remisionId: rem.id, organizationId: ["RECIBIDA", "EN_PROCESO", "DEVUELTA", "RECHAZADA"].includes(e.tipo) ? orgD.id : orgO.id, actorId: e.actor, tipo: e.tipo, nota: e.nota ?? null, creadoEn: pasado(e.en) } });
    await prisma.evento.create({ data: { organizationId: orgO.id, pacienteId: pac.id, actorId: creador, tipo: "remision.enviada", detalle: { remisionId: rem.id, destinoId: orgD.id, autorizacionId: aut.id }, creadoEn: creado } });
    resumen[pl.estado] = (resumen[pl.estado] ?? 0) + 1;
  }

  // El estudio devuelto debe existir en Orthanc, con la etiqueta del centro dueño (Radia).
  await generarYSubir(env, radia.id, planDicom);
  log(`  remisiones: 2 vínculos activos y ${planes.length} remisiones (${Object.entries(resumen).map(([k, v]) => `${k} ${v}`).join(", ")}).`);
}
