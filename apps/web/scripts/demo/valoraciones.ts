// Valoraciones virtuales de la demo (Alejandro Restrepo): 16 solicitudes que cubren todas las etapas del tablero, con fotos sintéticas en S3,
// un video de muestra, cuestionarios válidos según el esquema de la app, mensajes, comentarios por foto, notas internas, eventos coherentes con
// recibidaEn/completadaEn y dos cotizaciones (Presupuesto.valoracionId). Sin correos: el cron de recordatorios nunca envía nada.
// Los tokens sembrados son hashes ficticios: los enlaces `/valoracion/<token>` de la demo no se pueden abrir (para ver el lado paciente en vivo, ver README).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { claveCopia, claveMedia, CONSENTIMIENTO_VERSION, DIAS_RESULTADO, DIAS_VENCIMIENTO, ANGULOS, esquemaCuestionario, PLANTILLAS_CAPTURA, type PlantillaCaptura } from "../../src/lib/valoraciones";
import type { Acum } from "./nucleo";
import { subirS3 } from "./externos";
import { fotoValoracionJpeg, miniatura } from "./imagenes";
import { bog, conConcurrencia, enMin, hashFicticio, log, type Entorno, type Persona } from "./util";

/** Cotizaciones ligadas a una valoración: `pres` es el índice (0-based) del presupuesto en odontologo.ts; `val` el número de la valoración. El paciente es el mismo en ambas. */
export const COTIZADAS = [{ pres: 1, val: 15 }, { pres: 4, val: 16 }] as const;
const VIDEO = resolve(import.meta.dirname, "assets/valoracion-apertura-demo.mp4");

type Etapa = "ENVIADA" | "ABIERTA" | "MATERIAL" | "REVISION" | "ESPERANDO" | "RESPONDIDA" | "COTIZADA" | "VENCIDA" | "CANCELADA";
type Def = {
  etapa: Etapa; plantilla: PlantillaCaptura; motivo: string; dias: number; fotos?: string[]; video?: boolean; dolor?: number; sintomas?: string[]; sinAsignar?: boolean;
  pacIdx?: number; recordatorios?: number; notas?: string; comentarios?: Record<string, string>; pedido?: { angulo: string; texto: string }; presencial?: boolean; horas?: number; paciente?: string; resultado?: boolean;
};
const MOTIVO = {
  REVISION: "Quiero una revisión y limpieza; hace más de un año que no voy al odontólogo",
  DOLOR: "Dolor fuerte en una muela de abajo, no me deja dormir",
  ORTODONCIA: "Quiero alinear mis dientes; los de abajo están apiñados",
  IMPLANTE: "Perdí una muela hace años y quiero saber si puedo ponerme un implante",
  COMPLETA: "Quiero una evaluación completa antes de empezar un tratamiento",
};
const T = (p: PlantillaCaptura, n: number) => PLANTILLAS_CAPTURA[p].angulos.filter((a) => a !== "VIDEO_APERTURA").slice(0, n) as string[];

// Orden = número de la valoración (val-1 … val-16). `horas` = de «recibida» a «completada» (promedio de las 4 completadas = 6 h).
const DEFS: Def[] = [
  { etapa: "ENVIADA", plantilla: "REVISION", motivo: MOTIVO.REVISION, dias: 1 },
  { etapa: "ENVIADA", plantilla: "ORTODONCIA", motivo: MOTIVO.ORTODONCIA, dias: 2, sinAsignar: true },
  { etapa: "ABIERTA", plantilla: "REVISION", motivo: MOTIVO.REVISION, dias: 2, fotos: T("REVISION", 2), dolor: 1, sintomas: ["SANGRADO"] },
  { etapa: "ABIERTA", plantilla: "REVISION", motivo: MOTIVO.REVISION, dias: 4, fotos: T("REVISION", 2), dolor: 0, sintomas: ["MAL_ALIENTO"], recordatorios: 1, sinAsignar: true },
  { etapa: "MATERIAL", plantilla: "DOLOR", motivo: MOTIVO.DOLOR, dias: 1, fotos: ["FRONTAL_REPOSO", "ZONA_DOLOR", "INTRAORAL_FRONTAL", "INTRAORAL_DERECHA", "RADIOGRAFIA"], video: true, dolor: 8, sintomas: ["DOLOR", "SENSIBILIDAD", "INFLAMACION"] },
  { etapa: "MATERIAL", plantilla: "ORTODONCIA", motivo: MOTIVO.ORTODONCIA, dias: 2, fotos: T("ORTODONCIA", 6), dolor: 0, sintomas: ["ESTETICA"] },
  { etapa: "REVISION", plantilla: "IMPLANTE", motivo: MOTIVO.IMPLANTE, dias: 3, fotos: T("IMPLANTE", 5), dolor: 2, sintomas: ["OTRO"], notas: "Zona del 36 ausente hace años; revisar hueso disponible en la radiografía antes de cotizar. Preguntar por antecedentes de bruxismo.", comentarios: { INTRAORAL_FRONTAL: "Se aprecia el espacio edéntulo; migración del 37 hacia mesial.", INTRAORAL_IZQUIERDA: "Encía de aspecto sano alrededor del espacio." } },
  { etapa: "REVISION", plantilla: "COMPLETA", motivo: MOTIVO.COMPLETA, dias: 3, fotos: T("COMPLETA", 6), video: true, dolor: 3, sintomas: ["SANGRADO", "SENSIBILIDAD"], notas: "Placa generalizada y sangrado al sondaje probable. Plan: profilaxis, control de higiene y reevaluar en 15 días.", comentarios: { FRONTAL_REPOSO: "Asimetría leve, sin hallazgos agudos.", SONRISA: "Línea de sonrisa media; recesión visible en el 13." } },
  { etapa: "ESPERANDO", plantilla: "IMPLANTE", motivo: MOTIVO.IMPLANTE, dias: 4, fotos: T("IMPLANTE", 5), dolor: 1, sintomas: ["OTRO"], pedido: { angulo: "RADIOGRAFIA", texto: "Gracias por tus fotos. Para valorar el implante me ayuda mucho una radiografía reciente; si la tienes, súbela desde tu enlace." } },
  { etapa: "ESPERANDO", plantilla: "DOLOR", motivo: MOTIVO.DOLOR, dias: 5, fotos: T("DOLOR", 4), dolor: 6, sintomas: ["DOLOR", "SENSIBILIDAD"], pedido: { angulo: "ZONA_DOLOR", texto: "La foto de la zona que te duele salió movida. ¿Puedes repetirla acercándote un poco más y con buena luz?" } },
  { etapa: "RESPONDIDA", plantilla: "REVISION", motivo: MOTIVO.REVISION, dias: 8, fotos: T("REVISION", 4), dolor: 1, sintomas: ["SANGRADO", "MAL_ALIENTO"], pacIdx: 7, horas: 4, resultado: false },
  { etapa: "RESPONDIDA", plantilla: "ORTODONCIA", motivo: MOTIVO.ORTODONCIA, dias: 10, fotos: T("ORTODONCIA", 5), dolor: 0, sintomas: ["ESTETICA"], pacIdx: 20, horas: 8, presencial: true, resultado: true },
  { etapa: "COTIZADA", plantilla: "IMPLANTE", motivo: MOTIVO.IMPLANTE, dias: 14, fotos: T("IMPLANTE", 5), dolor: 0, sintomas: ["OTRO"], horas: 5, resultado: true, presencial: true },
  { etapa: "COTIZADA", plantilla: "COMPLETA", motivo: MOTIVO.COMPLETA, dias: 16, fotos: T("COMPLETA", 5), dolor: 2, sintomas: ["FRACTURA"], horas: 7, resultado: true },
  { etapa: "VENCIDA", plantilla: "REVISION", motivo: MOTIVO.REVISION, dias: 12, fotos: T("REVISION", 1), dolor: 1, sintomas: ["SENSIBILIDAD"], recordatorios: 2 },
  { etapa: "CANCELADA", plantilla: "PERSONALIZADA", motivo: "Quiero que revisen un diente que se me oscureció", dias: 6 },
];
// Las cotizadas deben ser las posiciones val-15 y val-16 (ver COTIZADAS): se reordenan al final.
const ORDEN = [...DEFS.filter((d) => d.etapa !== "COTIZADA"), ...DEFS.filter((d) => d.etapa === "COTIZADA")];

const RESULTADOS = [
  { dx: "Gingivitis asociada a placa y tinciones extrínsecas. Sin signos de caries profundas en las fotografías.", rec: "Profilaxis con detartraje y refuerzo de higiene oral. Blanqueamiento posterior a la fase periodontal.", tto: "Profilaxis, detartraje y control a los 15 días", valor: 240000 },
  { dx: "Apiñamiento anteroinferior moderado con mordida cruzada posterior leve.", rec: "Se recomienda valoración presencial con radiografías y modelos para planear ortodoncia.", tto: "Ortodoncia con brackets o alineadores, previa valoración presencial", valor: 2800000 },
  { dx: "Edentulismo parcial en la zona del 36 con espacio protésico adecuado y encía sana.", rec: "Valorar hueso con tomografía antes de decidir el implante.", tto: "Implante unitario con corona", valor: 4200000 },
  { dx: "Fractura coronal del 21 sin compromiso pulpar aparente y desgaste oclusal generalizado.", rec: "Restauración estética del 21 y guarda oclusal nocturna.", tto: "Reconstrucción en resina y guarda oclusal", valor: 650000 },
];

type Evento = { tipo: string; en: Date; actor: boolean; detalle?: object };

export async function sembrarValoraciones(o: {
  A: Acum; env: Entorno; orgId: string; slug: string; doc: string; pacs: { id: string; nombre: string }[]; g: { nombre: () => Persona };
}) {
  const { A, env, orgId, slug, doc, pacs } = o;
  const hayVideo = existsSync(VIDEO);
  if (!hayVideo) log("  valoraciones: falta scripts/demo/assets/valoracion-apertura-demo.mp4; se siembra sin video.");
  const video = hayVideo ? readFileSync(VIDEO) : null;
  const subidas: { key: string; body: Buffer; tipo: string }[] = [];
  let medioN = 0;

  for (const [i, d] of ORDEN.entries()) {
    const n = i + 1, id = `${slug}-val-${n}`;
    const cot = COTIZADAS.find((c) => c.val === n);
    const pacIdx = cot ? (cot.pres * 3) % pacs.length : d.pacIdx;
    const pac = pacIdx !== undefined ? pacs[pacIdx]! : null;
    const nombre = pac?.nombre ?? o.g.nombre().nombre;
    const creado = bog(-d.dias, 9 + (i % 7), (i * 11) % 50);
    const completa = d.etapa === "RESPONDIDA" || d.etapa === "COTIZADA";
    const consiente = d.etapa !== "ENVIADA" && d.etapa !== "CANCELADA";
    const consent = enMin(creado, 25);
    const fotos = d.fotos ?? [];
    // Línea de tiempo: el paciente sube sus tomas tras consentir y envía; el odontólogo responde `horas` después.
    const subeEn = (m: number) => enMin(consent, 8 + 5 * m);
    const envioPaciente = ["MATERIAL", "REVISION", "ESPERANDO", "RESPONDIDA", "COTIZADA"].includes(d.etapa) ? enMin(subeEn(fotos.length + (d.video ? 1 : 0)), 12) : null;
    const completadaEn = completa && envioPaciente ? enMin(envioPaciente, (d.horas ?? 6) * 60) : null;
    const resultadoEn = completadaEn && d.resultado !== false ? enMin(completadaEn, 12) : null; // una respondida queda sin enviar (etapa «Resultado sin enviar»)
    const pedidoEn = d.pedido && envioPaciente ? enMin(envioPaciente, 200 + 20 * i) : null;
    const enlaceEn = resultadoEn ?? (pedidoEn ? enMin(pedidoEn, 1) : creado);
    const vencida = d.etapa === "VENCIDA";
    const expiraEn = resultadoEn ? enMin(resultadoEn, DIAS_RESULTADO * 1440) : vencida ? bog(-d.dias + DIAS_VENCIMIENTO, 9) : enMin(enlaceEn, DIAS_VENCIMIENTO * 1440);
    const estado = ({ ENVIADA: "PENDIENTE_PACIENTE", ABIERTA: "PENDIENTE_PACIENTE", MATERIAL: "RECIBIDA", REVISION: "EN_REVISION", ESPERANDO: "REQUIERE_MAS_INFO", RESPONDIDA: "COMPLETADA", COTIZADA: "COMPLETADA", VENCIDA: "PENDIENTE_PACIENTE", CANCELADA: "CANCELADA" } as const)[d.etapa];
    const accesoEn = d.etapa === "ABIERTA" ? enMin(consent, 60 * (n % 3)) : vencida ? enMin(creado, 90) : envioPaciente && !pedidoEn ? envioPaciente : null;
    const rec = d.recordatorios ?? 0;
    const recEn = (k: number) => enMin(creado, 2880 * (k + 1)); // ≥ 48 h entre envíos
    const r = completa ? RESULTADOS[[11, 12, 15, 16].indexOf(n)]! : null;
    const cuestionario = consiente ? esquemaCuestionario.parse({ dolor: d.dolor ?? 0, desde: d.dolor && d.dolor >= 6 ? "Hace 4 días" : "Hace varios meses", sintomas: d.sintomas ?? [], alergias: "Ninguna conocida", medicamentos: "Ninguno", motivo: d.motivo }) : null;

    // Lead VALORACION_VIRTUAL para quien aún no es paciente.
    const leadId = pac ? null : `${slug}-lead-val-${n}`;
    if (leadId) {
      const etapaLead = d.etapa === "VENCIDA" || d.etapa === "CANCELADA" ? "PERDIDO" : d.etapa === "ENVIADA" || d.etapa === "ABIERTA" ? "NUEVO" : "CONTACTADO";
      A.add("lead", {
        id: leadId, organizationId: orgId, nombre, telefono: `3105550${100 + n}`, correo: null, ciudad: "Manizales", origen: "VALORACION_VIRTUAL", interes: "Valoración virtual", etapa: etapaLead,
        responsableId: doc, proximoContacto: etapaLead === "PERDIDO" ? null : bog(1 + (n % 3), 9), ultimoContactoEn: etapaLead === "NUEVO" ? null : envioPaciente ?? creado,
        motivoPerdida: etapaLead === "PERDIDO" ? (d.etapa === "VENCIDA" ? "No contestó más" : "Pospuso el tratamiento") : null, consentimientoMercadeo: false, noContactar: false,
        cerradoEn: etapaLead === "PERDIDO" ? enMin(creado, 1440 * 7) : null, creadoEn: creado, actualizadoEn: creado,
      });
      A.add("actividadLead", { id: `${slug}-act-val-${n}`, organizationId: orgId, leadId, tipo: "VALORACION", texto: "Solicitud de valoración virtual creada", autorId: doc, creadoEn: creado });
    }

    A.add("valoracion", {
      id, organizationId: orgId, pacienteId: pac?.id ?? null, leadId, nombre, telefono: `3105550${100 + n}`, correo: null, ciudad: "Manizales", motivo: d.motivo, cuestionario: cuestionario ?? undefined,
      estado, doctorId: d.sinAsignar ? null : doc, tokenHash: hashFicticio(`${slug}-val-${n}`), codigoHash: null, expiraEn,
      consentimientoEn: consiente ? consent : null, consentimientoVersion: consiente ? CONSENTIMIENTO_VERSION : null,
      diagnosticoPreliminar: r?.dx ?? null, recomendaciones: r?.rec ?? null, tratamientoSugerido: r?.tto ?? null, presupuestoEstimado: r?.valor ?? null, requierePresencial: !!d.presencial, completadaEn,
      plantillaCaptura: d.plantilla, angulosPedidos: ANGULOS.filter((a) => (d.plantilla === "PERSONALIZADA" ? ["FRONTAL_REPOSO", "SONRISA", "ZONA_DOLOR"] : (PLANTILLAS_CAPTURA[d.plantilla].angulos as readonly string[])).includes(a)),
      enlaceEnviadoEn: enlaceEn, ultimoAccesoEn: accesoEn, recibidaEn: envioPaciente, resultadoEnviadoEn: resultadoEn, recordatoriosEnviados: rec, ultimoRecordatorioEn: rec ? recEn(rec - 1) : null,
      notasInternas: d.notas ?? null, creadoPorId: doc, creadoEn: creado, actualizadoEn: envioPaciente ?? creado,
    });

    // Fotos (y video) en S3: original + copia web + miniatura, con las claves que usa la app.
    const medios = [...fotos.map((a) => ({ a, tipo: "FOTO" as const })), ...(d.video && video ? [{ a: "VIDEO_APERTURA", tipo: "VIDEO" as const }] : [])];
    for (const [m, { a, tipo }] of medios.entries()) {
      const mid = `${id}-m${m + 1}`;
      const key = claveMedia(orgId, id, mid, tipo === "VIDEO" ? "mp4" : "jpg");
      const fila: Record<string, unknown> = { id: mid, organizationId: orgId, valoracionId: id, tipo, angulo: a, claveS3: key, mime: tipo === "VIDEO" ? "video/mp4" : "image/jpeg", creadoEn: subeEn(m), nota: d.comentarios?.[a] ?? null };
      if (tipo === "VIDEO") Object.assign(fila, { claveMiniatura: null, bytes: video!.length, duracionSeg: 14 });
      else {
        const foto = await fotoValoracionJpeg(a, ++medioN), mini = await miniatura(foto), dim = await sharp(foto).metadata();
        Object.assign(fila, { claveMiniatura: claveCopia(key, "thumb"), bytes: foto.length, ancho: dim.width, alto: dim.height });
        subidas.push({ key, body: foto, tipo: "image/jpeg" }, { key: claveCopia(key, "web"), body: foto, tipo: "image/jpeg" }, { key: claveCopia(key, "thumb"), body: mini, tipo: "image/jpeg" });
      }
      if (tipo === "VIDEO") subidas.push({ key, body: video!, tipo: "video/mp4" });
      A.add("valoracionMedia", fila);
    }

    // Mensajes (tuteo) y eventos.
    const ev: Evento[] = [{ tipo: "creada", en: creado, actor: true, detalle: { leadId, doctorId: d.sinAsignar ? null : doc } }];
    if (consiente) ev.push({ tipo: "consentimiento", en: consent, actor: false });
    if (envioPaciente) ev.push({ tipo: "recibida", en: envioPaciente, actor: false });
    if (envioPaciente && estado !== "RECIBIDA") ev.push({ tipo: "en_revision", en: enMin(envioPaciente, 45), actor: true });
    for (let k = 0; k < rec; k++) ev.push({ tipo: "recordatorio", en: recEn(k), actor: false, detalle: { numero: k + 1 } });
    const msg = (sufijo: string, autor: "PACIENTE" | "PROFESIONAL", texto: string, en: Date, solicitaMedia?: string) => {
      A.add("valoracionMensaje", { id: `${id}-msg${sufijo}`, organizationId: orgId, valoracionId: id, autor, autorId: autor === "PROFESIONAL" ? doc : null, texto, solicitaMedia: solicitaMedia ?? null, creadoEn: en, leidoEn: autor === "PACIENTE" || completa ? enMin(en, 90) : null });
      ev.push({ tipo: "mensaje", en, actor: autor === "PROFESIONAL", detalle: { autor, solicitaMedia: solicitaMedia ?? null } });
    };
    if (d.etapa === "MATERIAL" && d.dolor === 8) msg("1", "PACIENTE", "Me duele más en la noche y con el frío. ¿Pueden verme pronto?", enMin(envioPaciente!, 20));
    if (d.etapa === "REVISION" && d.plantilla === "COMPLETA") msg("1", "PACIENTE", "¿Con estas fotos alcanza o necesitas alguna más?", enMin(envioPaciente!, 30));
    if (d.pedido) msg("1", "PROFESIONAL", d.pedido.texto, pedidoEn!, d.pedido.angulo); // la repetición de una toma ya subida queda pendiente hasta que llegue la foto nueva
    if (completa) ev.push({ tipo: "completada", en: completadaEn!, actor: true, detalle: { requierePresencial: !!d.presencial } });
    if (resultadoEn) {
      msg("1", "PROFESIONAL", "Ya revisé tus fotos; te dejé el diagnóstico preliminar y las recomendaciones en tu resultado.", completadaEn!);
      msg("2", "PACIENTE", "Muchas gracias, doctor. Agendo esta semana.", enMin(resultadoEn, 180));
      ev.push({ tipo: "resultado_enviado", en: resultadoEn, actor: true });
    }
    if (d.etapa === "CANCELADA") ev.push({ tipo: "cancelada", en: enMin(creado, 1440 * 2), actor: true });
    if (d.notas) ev.push({ tipo: "notas", en: enMin(envioPaciente!, 120), actor: true });
    ev.forEach((e, k) => A.add("evento", { id: `${id}-ev${k + 1}`, organizationId: orgId, pacienteId: pac?.id ?? null, actorId: e.actor ? doc : null, tipo: `valoracion.${e.tipo}`, detalle: { valoracionId: id, ...e.detalle }, creadoEn: e.en }));
  }

  await conConcurrencia(subidas, 8, (s) => subirS3(env.bucket, s.key, s.body, s.tipo));
  return ORDEN.length;
}
