// Evolutivos clínicos firmados de Alejandro Restrepo: plantillas base, folios por paciente, hash de contenido y adendas.
// Mismo hash y mismo contenido canónico que la app (lib/evolucion-hash.ts): al abrir un evolutivo, "íntegro" sale verdadero.
import { componerContenido, PLANTILLAS_BASE, textoAdenda, type CampoPlantilla } from "../../src/lib/evolucion";
import { hashAdenda, hashEvolucion } from "../../src/lib/evolucion-hash";
import { Acum } from "./nucleo";
import { bog, enMin, type Rng } from "./util";

const TEXTOS: Record<string, string[]> = {
  motivo: ["Control y continuación del tratamiento.", "Dolor espontáneo en la zona tratada, de dos días de evolución.", "Cita programada según el plan de tratamiento.", "Molestia al masticar y sensibilidad al frío."],
  examen: ["Tejidos blandos sin lesiones. Oclusión estable. Higiene oral regular con placa en zona posterior.", "Examen clínico y radiográfico sin hallazgos nuevos; se confirma el plan acordado."],
  diagnostico_clinico: ["Lesión cariosa activa en cara oclusal, sin compromiso pulpar.", "Gingivitis asociada a placa; sin movilidad dental."],
  procedimiento: ["Anestesia infiltrativa, aislamiento relativo, procedimiento sin complicaciones. Ajuste oclusal y pulido final.", "Se realiza el procedimiento programado con técnica estándar; paciente tolera bien la sesión."],
  plan: ["Control en 15 días. Continuar con la fase siguiente del plan aprobado.", "Control en 8 días y reevaluación radiográfica a los 3 meses."],
  indicaciones: ["Evitar alimentos duros por 24 horas. Analgésico si hay molestia. Higiene con cepillo suave.", "Refuerzo de higiene oral e hilo dental; consultar si hay dolor persistente o inflamación."],
  analisis: ["Perfil convexo, sellado labial forzado. Clase II molar bilateral, overjet 5 mm, overbite 4 mm, líneas medias coincidentes."],
  aparatologia: ["Brackets metálicos 0,022 con arco NiTi 0,014 superior e inferior."],
  activacion: ["Cambio de arcos y ligaduras elásticas; se activa retracción de caninos."],
  pulpar: ["Pulpitis irreversible sintomática con periodontitis apical sintomática.", "Necrosis pulpar con periodontitis apical crónica asintomática."],
  pruebas: ["Frío: respuesta exagerada y prolongada. Percusión positiva. Palpación negativa."],
  conductometria: ["Conductometría electrónica y radiográfica; preparación biomecánica con sistema rotatorio hasta lima 25/.06."],
  obturacion: ["Irrigación con hipoclorito al 2,5 % y obturación con gutapercha y sellador, técnica de condensación lateral."],
  sondaje: ["Sondaje de 3 a 5 mm con sangrado generalizado; sin movilidad dental."],
  diagnostico_periodontal: ["Gingivitis inducida por placa, generalizada."],
  preoperatorio: ["Paciente sin antecedentes que contraindiquen el procedimiento; estudio radiográfico revisado."],
  anestesia: ["Bloqueo del nervio dentario inferior con lidocaína al 2 % con epinefrina."],
  cirugia: ["Colgajo mucoperióstico, ostectomía mínima, luxación y extracción atraumática; sutura con seda 3-0."],
  complicaciones: ["Sin complicaciones intraoperatorias."],
  evaluacion: ["Reborde con altura y ancho suficientes según estudio imagenológico."],
  fase: ["Fase de rehabilitación protésica."],
  implante: ["Implante cónico de 4,0 x 10 mm, torque de inserción 35 Ncm."],
};

const plantillaDe = (srv: string) =>
  /^Endodoncia/.test(srv) ? "Endodoncia" : /implante/i.test(srv) ? "Implantología" : /^Ortodoncia|^Retenedores/.test(srv) ? "Ortodoncia"
    : /^Exodoncia/.test(srv) ? "Cirugía oral" : /^Profilaxis|^Detartraje|^Fluor/.test(srv) ? "Periodoncia" : "Odontología general";

const DX_POR_SERVICIO: [RegExp, [string, string]][] = [
  [/^Consulta/, ["Z012", "Examen odontológico"]], [/^Profilaxis|^Detartraje/, ["K051", "Gingivitis crónica"]], [/^Resina|^Sellantes|^Fluor/, ["K021", "Caries de la dentina"]],
  [/^Endodoncia/, ["K041", "Necrosis de la pulpa"]], [/^Exodoncia/, ["K083", "Raíz dental retenida"]],
];

export type CitaAtendida = { citaId: string; ordenId: string; pacienteId: string; servicioId: string; servicio: string; diente: number; fin: Date };

/** Inserta plantillas y un evolutivo firmado por cada atención con orden; seis llevan adenda. Devuelve cuántos creó. */
export function evolutivos(A: Acum, o: { orgId: string; slug: string; rng: Rng; atenciones: CitaAtendida[]; firmante: { id: string; nombre: string; tarjeta: string } }) {
  const { rng, orgId, slug, firmante } = o;
  const plantillas = new Map(PLANTILLAS_BASE.map((p, i) => [p.nombre, { id: `${slug}-plev-${i + 1}`, campos: p.campos as CampoPlantilla[] }]));
  for (const [nombre, p] of plantillas) A.add("plantillaEvolucion", { id: p.id, organizationId: orgId, nombre, version: 1, campos: { campos: p.campos }, activa: true, creadaPorId: firmante.id, creadoEn: bog(-160) });

  const folios = new Map<string, number>();
  const evos: { id: string; hash: string; firmadaEn: Date; diente: number }[] = [];
  for (const [i, a] of [...o.atenciones].sort((x, y) => x.fin.getTime() - y.fin.getTime()).entries()) {
    const pl = plantillas.get(plantillaDe(a.servicio))!;
    const valores = Object.fromEntries(pl.campos.flatMap((c) => (TEXTOS[c.clave] ? [[c.clave, rng.pick(TEXTOS[c.clave]!)]] : [])));
    const c = componerContenido(pl.campos, valores);
    const folio = (folios.get(a.pacienteId) ?? 0) + 1;
    folios.set(a.pacienteId, folio);
    const dx = DX_POR_SERVICIO.find(([re]) => re.test(a.servicio))?.[1] ?? ["Z012", "Examen odontológico"];
    const id = `${slug}-evo-${i + 1}`;
    const firmadaEn = enMin(a.fin, 15);
    const proximaCita = rng.chance(0.5) ? new Date(Date.UTC(firmadaEn.getUTCFullYear(), firmadaEn.getUTCMonth(), firmadaEn.getUTCDate() + rng.pick([8, 15, 30]))) : null;
    const diagnosticosCie10 = [{ codigo: dx[0], descripcion: dx[1] }];
    const hash = hashEvolucion({
      organizationId: orgId, pacienteId: a.pacienteId, folio, ordenId: a.ordenId, citaId: a.citaId, plantillaId: pl.id, plantillaVersion: 1,
      motivoConsulta: c.motivoConsulta, hallazgos: c.hallazgos, procedimiento: c.procedimiento, diagnosticosCie10, plan: c.plan, indicaciones: c.indicaciones,
      proximaCita, odontogramaSnapshot: null, firmanteId: firmante.id, firmanteNombre: firmante.nombre, firmanteTarjeta: firmante.tarjeta, firmadaEn,
    });
    A.add("evolucionClinica", {
      id, organizationId: orgId, pacienteId: a.pacienteId, folio, ordenId: a.ordenId, citaId: a.citaId, plantillaId: pl.id, plantillaVersion: 1,
      motivoConsulta: c.motivoConsulta, hallazgos: c.hallazgos, procedimiento: c.procedimiento, serviciosRealizados: [{ servicioId: a.servicioId, cantidad: 1, diente: a.diente }],
      diagnosticosCie10, plan: c.plan, indicaciones: c.indicaciones, proximaCita,
      firmanteId: firmante.id, firmanteNombre: firmante.nombre, firmanteTarjeta: firmante.tarjeta, hashContenido: hash, metodoFirma: "CLAVE", firmadaEn,
    });
    evos.push({ id, hash, firmadaEn, diente: a.diente });
  }
  // Adendas (la corrección de un evolutivo firmado nunca lo modifica): las primeras con más de dos días de antigüedad.
  const motivos = ["Aclaración de la pieza dental tratada", "Se completa la indicación postoperatoria", "Corrección de la fecha del control"];
  evos.filter((e) => e.firmadaEn < bog(-3)).filter((_, i) => i % 7 === 3).slice(0, 6).forEach((e, k) => {
    const motivo = rng.pick(motivos);
    const texto = textoAdenda(motivo, `Se aclara que el procedimiento se realizó en el diente ${e.diente}; el resto del evolutivo se mantiene.`);
    const firmadaEn = enMin(e.firmadaEn, 60 * 24 * rng.int(1, 2));
    const hashContenido = hashAdenda({ organizationId: orgId, evolucionId: e.id, hashEvolucion: e.hash, texto, firmanteId: firmante.id, firmanteNombre: firmante.nombre, firmanteTarjeta: firmante.tarjeta, firmadaEn });
    A.add("adendaEvolucion", { id: `${slug}-ade-${k + 1}`, organizationId: orgId, evolucionId: e.id, texto, firmanteId: firmante.id, firmanteNombre: firmante.nombre, firmanteTarjeta: firmante.tarjeta, hashContenido, metodoFirma: "CLAVE", firmadaEn });
  });
  return { evolutivos: evos.length, plantillas: plantillas.size };
}
