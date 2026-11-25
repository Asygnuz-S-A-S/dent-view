// Tipos de cliente y módulos habilitados por tipo. Módulo puro (sin base de datos): lo usan menú, guard y pruebas.
// La consulta del tipo del centro vive en tipo-centro-servidor.ts.

export const TIPOS_CENTRO = ["CENTRO_RADIOLOGICO", "CENTRO_ODONTOLOGICO", "CLINICA_ODONTOLOGICA", "ODONTOLOGO_PARTICULAR"] as const;
export type TipoCentro = (typeof TIPOS_CENTRO)[number];
export const TIPO_POR_DEFECTO: TipoCentro = "CENTRO_RADIOLOGICO";

export const ETIQUETA_TIPO: Record<TipoCentro, string> = {
  CENTRO_RADIOLOGICO: "Centro radiológico",
  CENTRO_ODONTOLOGICO: "Centro odontológico",
  CLINICA_ODONTOLOGICA: "Clínica odontológica",
  ODONTOLOGO_PARTICULAR: "Odontólogo particular",
};

export const DESCRIPCION_TIPO: Record<TipoCentro, string> = {
  CENTRO_RADIOLOGICO: "Toma estudios para doctores remitentes: órdenes, ingesta, informes, convenios y seguimiento de doctores.",
  CENTRO_ODONTOLOGICO: "Centro o consultorio con varios odontólogos: pacientes, agenda, laboratorio, facturación y cartera.",
  CLINICA_ODONTOLOGICA: "Clínica cuyos odontólogos son usuarios del mismo centro: pacientes, agenda, laboratorio, facturación y cartera.",
  ODONTOLOGO_PARTICULAR: "Un odontólogo con su consultorio (un solo usuario): pacientes, agenda, estudios y facturación simple.",
};

export const esTipoCentro = (v: unknown): v is TipoCentro => TIPOS_CENTRO.includes(v as TipoCentro);

export const MODULOS = [
  "inicio", "pacientes", "ordenes", "agenda", "estudios", "informes", "seguimiento", "seguimiento-doctores", "doctores",
  "laboratorio", "facturacion", "cartera", "reportes", "catalogo", "convenios", "usuarios", "ajustes", "ingesta",
  "integraciones", "pasarelas", "notificaciones", "proteccion-datos", "valoraciones", "crm",
  "cargar", "agenda-publica", "inventario", "caja", "gastos", "presupuestos", "evolucion",
] as const;
export type Modulo = (typeof MODULOS)[number];

// Se declara qué NO tiene cada tipo: un módulo nuevo queda habilitado en todos hasta que se excluya a propósito.
const SIN_MODULOS: Record<TipoCentro, readonly Modulo[]> = {
  // Radiología: flujo completo; sin laboratorio protésico.
  // Sin historia clínica odontológica (evolucion): usa RegistroToma y el evolutivo de imágenes.
  CENTRO_RADIOLOGICO: ["laboratorio", "valoraciones", "crm", "evolucion"],
  // (valoración virtual y CRM de pacientes son de odontología; el radiológico retiene doctores con seguimiento-doctores)
  // Odontología: sin ingesta, sin convenios con remitentes ni seguimiento de doctores remitentes.
  CENTRO_ODONTOLOGICO: ["seguimiento-doctores", "convenios", "ingesta"],
  CLINICA_ODONTOLOGICA: ["seguimiento-doctores", "convenios", "ingesta"],
  // Particular (centro de 1 usuario): además sin usuarios, doctores, reportes ni cartera (facturación simple).
  ODONTOLOGO_PARTICULAR: ["seguimiento-doctores", "convenios", "ingesta", "usuarios", "doctores", "reportes", "cartera", "caja"],
};

export const MODULOS_POR_TIPO: Record<TipoCentro, ReadonlySet<Modulo>> = Object.fromEntries(
  TIPOS_CENTRO.map((t) => [t, new Set(MODULOS.filter((m) => !SIN_MODULOS[t].includes(m)))]),
) as unknown as Record<TipoCentro, ReadonlySet<Modulo>>;

export const moduloHabilitado = (tipo: TipoCentro, modulo: Modulo) => MODULOS_POR_TIPO[tipo].has(modulo);

/** Etiqueta del menú que cambia según el tipo (radiología: remitentes; odontología: odontólogos). */
export function etiquetaModulo(tipo: TipoCentro, modulo: Modulo, base: string) {
  return modulo === "doctores" && tipo !== "CENTRO_RADIOLOGICO" ? "Odontólogos" : base;
}

// Prefijo de ruta -> módulo. Se evalúa el más específico primero (p. ej. /seguimiento-doctores antes que /seguimiento).
const RUTAS: readonly (readonly [string, Modulo])[] = [
  ["/ajustes/agenda-publica", "agenda-publica"],
  ["/integraciones/pasarelas", "pasarelas"],
  ["/seguimiento-doctores", "seguimiento-doctores"],
  ["/proteccion-datos", "proteccion-datos"],
  ...(["inicio", "pacientes", "ordenes", "agenda", "estudios", "informes", "seguimiento", "doctores", "laboratorio", "facturacion",
    "cartera", "reportes", "catalogo", "convenios", "usuarios", "ajustes", "ingesta", "integraciones", "notificaciones", "valoraciones", "crm",
    "inventario", "caja", "gastos", "presupuestos", "cargar"] as const).map(
    (m) => [`/${m}`, m] as const,
  ),
];

/** Módulo al que pertenece una ruta de la app; null si no pertenece a ninguno (perfil, plataforma, entrega…). */
export function moduloDeRuta(pathname: string): Modulo | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return RUTAS.find(([prefijo]) => p === prefijo || p.startsWith(`${prefijo}/`))?.[1] ?? null;
}

/** Una ruta está bloqueada si pertenece a un módulo deshabilitado para el tipo. */
export const rutaBloqueada = (tipo: TipoCentro, pathname: string) => {
  const m = moduloDeRuta(pathname);
  return m !== null && !moduloHabilitado(tipo, m);
};
