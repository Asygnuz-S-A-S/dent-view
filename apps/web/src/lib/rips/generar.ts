// Generador y validador local de RIPS (JSON, Documento Técnico 1 v003). Función pura: sin I/O.
// Regla de oro: lo que no se conoce va como null (o 0 en valores) y se avisa; NUNCA se inventan códigos de tablas SISPRO.
// "Validado localmente" NO es "aprobado por el Ministerio": el CUV solo lo entrega el validador oficial o el proveedor tecnológico.
import { existeCups } from "../catalogos/buscar";
import { TIPOS_DOCUMENTO } from "../pacientes";

export const VERSION_RIPS = "DT1-v003";
export type TipoRipsServicio = "CONSULTA" | "PROCEDIMIENTO" | "OTRO_SERVICIO";

export type EntradaRips = {
  prestador: { nit: string | null; codigoPrestador: string | null; modalidad: string | null; grupoServicios: string | null };
  /** null mientras no exista la factura electrónica (FEV). */
  numFactura: string | null;
  orden: {
    numero: number; fechaAtencion: Date; total: number;
    tipoUsuario: string | null; numAutorizacion: string | null; finalidad: string | null; causaMotivoAtencion: string | null;
    viaIngreso: string | null; diagnosticoPrincipal: string | null; diagnosticosRelacionados: string[]; tipoDiagnostico: string | null;
  };
  paciente: {
    tipoDocumento: string; numeroDocumento: string; fechaNacimiento: Date | null; sexo: string | null; codPaisResidencia: string | null;
    codMunicipio: string | null; zonaTerritorial: string | null; codPaisOrigen: string | null;
  };
  profesional: { tipoDocumento: string | null; numeroDocumento: string | null } | null;
  items: { nombre: string; codigoCups: string | null; tipoRips: TipoRipsServicio; precio: number; codServicioReps: number | null; finalidad: string | null; diagnostico: string | null }[];
  hoy?: Date;
};

/** destino: dónde se corrige (para el enlace de la lista de verificación). */
export type Hallazgo = { campo: string; mensaje: string; destino: "orden" | "paciente" | "catalogo" | "centro" };
export type ResultadoRips = { json: RipsJson; errores: Hallazgo[]; advertencias: Hallazgo[] };
// shortcut: forma laxa del JSON; tipar cada servicio campo a campo cuando el Ministerio publique el esquema JSON oficial.
type Fila = Record<string, string | number | null>;
export type RipsJson = {
  numDocumentoIdObligado: string | null; numFactura: string | null; tipoNota: string | null; numNota: string | null;
  usuarios: ({ [k: string]: unknown; servicios: { consultas: Fila[]; procedimientos: Fila[]; urgencias: Fila[]; hospitalizacion: Fila[]; recienNacidos: Fila[]; medicamentos: Fila[]; otrosServicios: Fila[] } })[];
};

export const RE_CIE10 = /^[A-Z]\d{2}[0-9A-Z]$/;
const RE_CUPS = /^\d{6}$/;
const RE_MUNICIPIO = /^\d{5}$/;
const RE_DOC = /^[A-Za-z0-9]{3,20}$/;
// Para el JSON los tipos de documento de la app coinciden con los de RIPS (CC, TI, CE, PA, RC).
const nz = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const dia = (d: Date) => d.toISOString().slice(0, 10);
/** "YYYY-MM-DD HH:mm" en hora de Bogotá (UTC-5, sin horario de verano). */
const fechaHora = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

export function generarRips(e: EntradaRips): ResultadoRips {
  const errores: Hallazgo[] = [];
  const advertencias: Hallazgo[] = [];
  const err = (campo: string, mensaje: string, destino: Hallazgo["destino"]) => errores.push({ campo, mensaje, destino });
  const adv = (campo: string, mensaje: string, destino: Hallazgo["destino"]) => advertencias.push({ campo, mensaje, destino });
  const hoy = e.hoy ?? new Date();
  const { prestador: pr, orden: o, paciente: p } = e;

  // Prestador
  const nit = nz(pr.nit);
  if (!nit) err("nit", "Falta el NIT del prestador (Ajustes de facturación electrónica).", "centro");
  const codPrestador = nz(pr.codigoPrestador);
  if (!codPrestador || codPrestador.length !== 12) err("codigoPrestador", "El código de prestador (REPS) debe tener 12 caracteres.", "centro");
  if (!nz(pr.modalidad)) adv("modalidad", "Sin modalidad de atención por defecto: se enviará null.", "centro");
  if (!nz(pr.grupoServicios)) adv("grupoServicios", "Sin grupo de servicios por defecto: se enviará null.", "centro");
  if (!e.numFactura) adv("numFactura", "Aún no hay factura electrónica: numFactura se envía null y el reporte debe ir junto con la factura.", "orden");

  // Paciente
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(p.tipoDocumento)) err("tipoDocumento", `Tipo de documento no válido: ${p.tipoDocumento}.`, "paciente");
  if (!RE_DOC.test(p.numeroDocumento)) err("numeroDocumento", "El número de documento debe tener de 3 a 20 letras o números.", "paciente");
  if (!p.fechaNacimiento) err("fechaNacimiento", "Falta la fecha de nacimiento del paciente.", "paciente");
  else if (dia(o.fechaAtencion) < dia(p.fechaNacimiento)) err("fechaAtencion", "La fecha de atención es anterior a la fecha de nacimiento.", "paciente");
  if (o.fechaAtencion.getTime() > hoy.getTime()) err("fechaAtencion", "La fecha de atención está en el futuro.", "orden");
  if (!nz(p.sexo)) err("sexo", "Falta el sexo del paciente.", "paciente");
  if (!nz(p.codMunicipio) || !RE_MUNICIPIO.test(p.codMunicipio!)) err("codMunicipio", "El municipio de residencia debe ser un código DIVIPOLA de 5 dígitos.", "paciente");
  if (!nz(p.zonaTerritorial)) err("zonaTerritorial", "Falta la zona territorial (urbana o rural).", "paciente");
  if (!nz(p.codPaisResidencia)) adv("codPaisResidencia", "Sin país de residencia: se enviará null.", "paciente");
  if (!nz(p.codPaisOrigen)) adv("codPaisOrigen", "Sin país de origen: se enviará null.", "paciente");

  // Orden
  if (!nz(o.tipoUsuario)) err("tipoUsuario", "Falta el tipo de usuario.", "orden");
  if (e.items.length === 0) err("items", "La orden no tiene servicios.", "orden");
  const tiene = (t: TipoRipsServicio) => e.items.some((i) => i.tipoRips === t);
  const finalidadOrden = nz(o.finalidad);
  if (!finalidadOrden && e.items.some((i) => !nz(i.finalidad))) err("finalidad", "Falta la finalidad de la atención.", "orden");
  if (tiene("CONSULTA") && !nz(o.causaMotivoAtencion)) err("causaMotivoAtencion", "Falta la causa o motivo de la atención.", "orden");
  if (tiene("CONSULTA") && !nz(o.tipoDiagnostico)) err("tipoDiagnostico", "Falta el tipo de diagnóstico principal.", "orden");
  if (tiene("PROCEDIMIENTO") && !nz(o.viaIngreso)) err("viaIngreso", "Falta la vía de ingreso del servicio de salud.", "orden");

  const principal = nz(o.diagnosticoPrincipal);
  if (!principal) err("diagnosticoPrincipal", "Falta el diagnóstico principal (CIE-10).", "orden");
  else if (!RE_CIE10.test(principal)) err("diagnosticoPrincipal", `Diagnóstico principal inválido: ${principal} (4 caracteres, p. ej. K021).`, "orden");
  const relacionados = o.diagnosticosRelacionados.map((d) => d.trim()).filter(Boolean);
  for (const d of relacionados) if (!RE_CIE10.test(d)) err("diagnosticosRelacionados", `Diagnóstico relacionado inválido: ${d}.`, "orden");
  if (new Set(relacionados).size !== relacionados.length) err("diagnosticosRelacionados", "Hay diagnósticos relacionados repetidos.", "orden");
  if (principal && relacionados.includes(principal)) err("diagnosticosRelacionados", "Un diagnóstico relacionado repite el principal.", "orden");
  if (relacionados.length > 3) adv("diagnosticosRelacionados", "Las consultas admiten 3 relacionados: solo se envían los 3 primeros.", "orden");

  e.items.forEach((i, n) => {
    const campo = `items.${n}.codigoCups`;
    if (!i.codigoCups || !RE_CUPS.test(i.codigoCups)) err(campo, `"${i.nombre}": falta el código CUPS de 6 dígitos.`, "orden");
    else if (!existeCups(i.codigoCups)) adv(campo, `"${i.nombre}": el CUPS ${i.codigoCups} no está en el catálogo embebido (parcial); valídalo contra SISPRO.`, "orden");
    if (i.tipoRips !== "OTRO_SERVICIO" && i.codServicioReps === null) adv(`items.${n}.codServicio`, `"${i.nombre}": sin código de servicio REPS: se enviará null.`, "catalogo");
  });

  const suma = e.items.reduce((t, i) => t + i.precio, 0);
  if (suma !== o.total) err("total", `La suma de los servicios (${suma}) no coincide con el total de la orden (${o.total}).`, "orden");

  const prof = e.profesional;
  const tipoDocProf = nz(prof?.tipoDocumento);
  const numDocProf = nz(prof?.numeroDocumento);
  if (!tipoDocProf || !numDocProf) adv("profesional", "Sin documento del profesional que atiende: se enviará null (el sistema no guarda el documento del profesional).", "orden");
  if (!nz(o.numAutorizacion)) adv("numAutorizacion", "Sin número de autorización: se enviará null (no aplica para atención particular).", "orden");

  // Armado del JSON: todos los campos presentes.
  const comunes = (i: EntradaRips["items"][number], consecutivo: number) => ({
    codPrestador, fechaInicioAtencion: fechaHora(o.fechaAtencion), numAutorizacion: nz(o.numAutorizacion),
    modalidadGrupoServicioTecSal: nz(pr.modalidad), grupoServicios: nz(pr.grupoServicios), codServicio: i.codServicioReps,
    finalidadTecnologiaSalud: nz(i.finalidad) ?? finalidadOrden,
    tipoDocumentoIdentificacion: tipoDocProf, numDocumentoIdentificacion: numDocProf,
    vrServicio: i.precio, conceptoRecaudo: null, valorPagoModerador: 0, numFEVPagoModerador: null, consecutivo,
  });
  const servicios = { consultas: [] as Fila[], procedimientos: [] as Fila[], urgencias: [] as Fila[], hospitalizacion: [] as Fila[], recienNacidos: [] as Fila[], medicamentos: [] as Fila[], otrosServicios: [] as Fila[] };
  e.items.forEach((i, n) => {
    const c = comunes(i, n + 1);
    const dxPrincipal = nz(i.diagnostico) ?? principal;
    if (i.tipoRips === "CONSULTA") {
      const { tipoDocumentoIdentificacion: td, numDocumentoIdentificacion: nd, ...resto } = c;
      servicios.consultas.push({
        codPrestador: resto.codPrestador, fechaInicioAtencion: resto.fechaInicioAtencion, numAutorizacion: resto.numAutorizacion,
        codConsulta: i.codigoCups, modalidadGrupoServicioTecSal: resto.modalidadGrupoServicioTecSal, grupoServicios: resto.grupoServicios,
        codServicio: resto.codServicio, finalidadTecnologiaSalud: resto.finalidadTecnologiaSalud, causaMotivoAtencion: nz(o.causaMotivoAtencion),
        codDiagnosticoPrincipal: dxPrincipal, codDiagnosticoRelacionado1: relacionados[0] ?? null, codDiagnosticoRelacionado2: relacionados[1] ?? null,
        codDiagnosticoRelacionado3: relacionados[2] ?? null, tipoDiagnosticoPrincipal: nz(o.tipoDiagnostico),
        tipoDocumentoIdentificacion: td, numDocumentoIdentificacion: nd,
        vrServicio: resto.vrServicio, conceptoRecaudo: null, valorPagoModerador: 0, numFEVPagoModerador: null, consecutivo: resto.consecutivo,
      });
    } else if (i.tipoRips === "PROCEDIMIENTO") {
      servicios.procedimientos.push({
        codPrestador: c.codPrestador, fechaInicioAtencion: c.fechaInicioAtencion, idMIPRES: null, numAutorizacion: c.numAutorizacion,
        codProcedimiento: i.codigoCups, viaIngresoServicioSalud: nz(o.viaIngreso), modalidadGrupoServicioTecSal: c.modalidadGrupoServicioTecSal,
        grupoServicios: c.grupoServicios, codServicio: c.codServicio, finalidadTecnologiaSalud: c.finalidadTecnologiaSalud,
        tipoDocumentoIdentificacion: c.tipoDocumentoIdentificacion, numDocumentoIdentificacion: c.numDocumentoIdentificacion,
        codDiagnosticoPrincipal: dxPrincipal, codDiagnosticoRelacionado: relacionados[0] ?? null, codComplicacion: null,
        vrServicio: c.vrServicio, conceptoRecaudo: null, valorPagoModerador: 0, numFEVPagoModerador: null, consecutivo: c.consecutivo,
      });
    } else {
      adv(`items.${n}.tipoRips`, `"${i.nombre}": "otros servicios" lleva campos (tipoOS, nomTecnologiaSalud) sin dato en el sistema: se envían null; revísalo antes de reportar.`, "catalogo");
      servicios.otrosServicios.push({
        codPrestador: c.codPrestador, numAutorizacion: c.numAutorizacion, idMIPRES: null, fechaSuministroTecnologia: c.fechaInicioAtencion,
        tipoOS: null, codTecnologiaSalud: i.codigoCups, nomTecnologiaSalud: i.nombre, cantidadOS: 1,
        tipoDocumentoIdentificacion: c.tipoDocumentoIdentificacion, numDocumentoIdentificacion: c.numDocumentoIdentificacion,
        vrUnitOS: i.precio, vrServicio: c.vrServicio, conceptoRecaudo: null, valorPagoModerador: 0, numFEVPagoModerador: null, consecutivo: c.consecutivo,
      });
    }
  });

  const json: RipsJson = {
    numDocumentoIdObligado: nit, numFactura: e.numFactura, tipoNota: null, numNota: null,
    usuarios: [{
      tipoDocumentoIdentificacion: p.tipoDocumento, numDocumentoIdentificacion: p.numeroDocumento, tipoUsuario: nz(o.tipoUsuario),
      fechaNacimiento: p.fechaNacimiento ? dia(p.fechaNacimiento) : null, codSexo: nz(p.sexo), codPaisResidencia: nz(p.codPaisResidencia),
      codMunicipioResidencia: nz(p.codMunicipio), codZonaTerritorialResidencia: nz(p.zonaTerritorial),
      incapacidad: "NO", // TODO verificar contra tablas SISPRO: valor SI/NO del DT1
      consecutivo: 1, codPaisOrigen: nz(p.codPaisOrigen), servicios,
    }],
  };
  return { json, errores, advertencias };
}
