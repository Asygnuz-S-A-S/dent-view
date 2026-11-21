// Marco de conectores a sistemas de gestión de pacientes. Sin dependencias de Next: lo usa también el worker
// (importar con extensión .ts y solo sintaxis borrable, ver apps/worker/tsconfig.json).

export type Credenciales = Record<string, string>;
export type CampoCredencial = { clave: string; etiqueta: string; secreto: boolean };

export type PacienteExterno = {
  idExterno: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombre: string;
  fechaNacimiento: Date | null;
  celular: string | null;
  correo: string | null;
  direccion: string | null;
};

export type EstadoCitaExterna = "PROGRAMADA" | "CONFIRMADA" | "CANCELADA";
export type CitaExterna = {
  idExterno: string;
  idPacienteExterno: string;
  inicio: Date;
  fin: Date;
  estado: EstadoCitaExterna;
  sala: string | null;
};

export type ResultadoPrueba = { ok: boolean; mensaje: string };

export interface Conector {
  /** Clave estable guardada en `Integracion.proveedor`. */
  clave: string;
  nombre: string;
  descripcion: string;
  /** false = implementado solo a partir de la documentación, nunca probado contra una cuenta real. */
  verificado: boolean;
  advertencia?: string;
  campos: CampoCredencial[];
  probarConexion(cred: Credenciales): Promise<ResultadoPrueba>;
  /** `desde` = última sincronización exitosa (null = todo). Los adaptadores sin filtro por fecha pueden ignorarlo. */
  listarPacientes(cred: Credenciales, desde: Date | null): Promise<PacienteExterno[]>;
  listarCitas(cred: Credenciales, desde: Date | null): Promise<CitaExterna[]>;
  /** Opcional: avisar al sistema externo que hay resultados (informe/estudio) de un paciente. */
  publicarResultados?(cred: Credenciales, r: { idPacienteExterno: string; titulo: string; url: string }): Promise<void>;
}

/** Error con mensaje apto para mostrar y guardar: nunca incluye credenciales ni datos de pacientes. */
export class ErrorConector extends Error {}
