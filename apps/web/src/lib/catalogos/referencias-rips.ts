// Tablas de referencia RIPS (Documento Técnico 1 v003). // TODO verificar contra tablas SISPRO: no se pudieron leer las tablas
// oficiales completas; estos valores son los conocidos y pueden estar incompletos o desactualizados. Un código no listado aquí
// NO es necesariamente inválido: por eso el validador local solo advierte, no bloquea, ante valores fuera de estas listas.
export type Opcion = { valor: string; etiqueta: string };

export const SEXOS: Opcion[] = [{ valor: "H", etiqueta: "Hombre" }, { valor: "M", etiqueta: "Mujer" }, { valor: "I", etiqueta: "Indeterminado o intersexual" }]; // TODO verificar contra tablas SISPRO
export const ZONAS: Opcion[] = [{ valor: "U", etiqueta: "Urbana" }, { valor: "R", etiqueta: "Rural" }]; // TODO verificar contra tablas SISPRO

export const TIPOS_USUARIO: Opcion[] = [ // TODO verificar contra tablas SISPRO
  { valor: "01", etiqueta: "Contributivo cotizante" },
  { valor: "02", etiqueta: "Contributivo beneficiario" },
  { valor: "03", etiqueta: "Contributivo adicional" },
  { valor: "04", etiqueta: "Subsidiado" },
  { valor: "05", etiqueta: "No afiliado" },
  { valor: "06", etiqueta: "Especial o de excepción cotizante" },
  { valor: "07", etiqueta: "Especial o de excepción beneficiario" },
];

export const VIAS_INGRESO: Opcion[] = [ // TODO verificar contra tablas SISPRO
  { valor: "01", etiqueta: "Demanda espontánea" },
  { valor: "02", etiqueta: "Derivado de consulta externa" },
  { valor: "03", etiqueta: "Derivado de urgencias" },
  { valor: "04", etiqueta: "Derivado de hospitalización" },
];

export const FINALIDADES: Opcion[] = [ // TODO verificar contra tablas SISPRO (solo las usuales en odontología)
  { valor: "11", etiqueta: "Valoración integral para la promoción y mantenimiento" },
  { valor: "14", etiqueta: "Protección específica" },
  { valor: "15", etiqueta: "Diagnóstico" },
  { valor: "16", etiqueta: "Tratamiento" },
  { valor: "17", etiqueta: "Rehabilitación" },
  { valor: "18", etiqueta: "Paliación" },
];

export const CAUSAS: Opcion[] = [ // TODO verificar contra tablas SISPRO
  { valor: "02", etiqueta: "Accidente de tránsito" },
  { valor: "05", etiqueta: "Otro tipo de accidente" },
  { valor: "13", etiqueta: "Enfermedad general" },
  { valor: "14", etiqueta: "Enfermedad laboral" },
  { valor: "15", etiqueta: "Otra" },
];

export const TIPOS_DIAGNOSTICO: Opcion[] = [ // TODO verificar contra tablas SISPRO
  { valor: "01", etiqueta: "Impresión diagnóstica" },
  { valor: "02", etiqueta: "Confirmado nuevo" },
  { valor: "03", etiqueta: "Confirmado repetido" },
];

export const MODALIDADES: Opcion[] = [ // TODO verificar contra tablas SISPRO
  { valor: "01", etiqueta: "Intramural" },
  { valor: "02", etiqueta: "Extramural, unidad móvil" },
  { valor: "03", etiqueta: "Extramural, domiciliaria" },
  { valor: "04", etiqueta: "Extramural, jornada de salud" },
  { valor: "05", etiqueta: "Telemedicina interactiva" },
];

export const GRUPOS_SERVICIO: Opcion[] = [ // TODO verificar contra tablas SISPRO
  { valor: "01", etiqueta: "Consulta externa" },
  { valor: "02", etiqueta: "Apoyo diagnóstico y complementación terapéutica" },
  { valor: "04", etiqueta: "Quirúrgico" },
];

export const TIPOS_PAGADOR: Opcion[] = [
  { valor: "PARTICULAR", etiqueta: "Particular" },
  { valor: "EPS", etiqueta: "EPS" },
  { valor: "PREPAGADA", etiqueta: "Medicina prepagada" },
  { valor: "POLIZA", etiqueta: "Póliza" },
  { valor: "EMPRESA", etiqueta: "Empresa" },
  { valor: "OTRO", etiqueta: "Otro" },
];

export const TIPOS_RIPS: Opcion[] = [
  { valor: "CONSULTA", etiqueta: "Consulta" },
  { valor: "PROCEDIMIENTO", etiqueta: "Procedimiento" },
  { valor: "OTRO_SERVICIO", etiqueta: "Otro servicio" },
];

export const etiquetaDe = (l: Opcion[], v: string | null | undefined) => l.find((o) => o.valor === v)?.etiqueta ?? v ?? "—";
