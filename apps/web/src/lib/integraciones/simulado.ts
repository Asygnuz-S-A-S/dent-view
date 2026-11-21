// Adaptador "Simulado (pruebas)": una clínica falsa en memoria para probar todo el flujo sin cuentas externas.
import { ErrorConector, type CitaExterna, type Conector, type PacienteExterno } from "./tipos.ts";

const dia = (d: number, h: number, min = 0) => new Date(Date.UTC(2030, 0, d, h + 5, min)); // enero de 2030, hora de Colombia
const hace = (n: number) => new Date(Date.now() - n * 3_600_000);

export type DatosSimulados = { pacientes: (PacienteExterno & { actualizadoEn: Date })[]; citas: (CitaExterna & { actualizadoEn: Date })[] };

export const clinicaSimulada = (): DatosSimulados => ({
  pacientes: [
    { idExterno: "SIM-1", tipoDocumento: "CC", numeroDocumento: "900100201", nombre: "Ana Prueba Simulada", fechaNacimiento: new Date("1990-04-12T00:00:00Z"), celular: "3000000001", correo: "ana.sim@example.com", direccion: "Calle 1 # 2-3", actualizadoEn: hace(48) },
    { idExterno: "SIM-2", tipoDocumento: "CC", numeroDocumento: "900100202", nombre: "Bruno Prueba Simulado", fechaNacimiento: null, celular: "3000000002", correo: null, direccion: null, actualizadoEn: hace(24) },
    { idExterno: "SIM-3", tipoDocumento: "TI", numeroDocumento: "900100203", nombre: "Carla Prueba Simulada", fechaNacimiento: new Date("2012-09-30T00:00:00Z"), celular: null, correo: null, direccion: null, actualizadoEn: hace(1) },
  ],
  citas: [
    { idExterno: "SIM-C1", idPacienteExterno: "SIM-1", inicio: dia(10, 9), fin: dia(10, 9, 30), estado: "CONFIRMADA", sala: "Panorámico", actualizadoEn: hace(48) },
    { idExterno: "SIM-C2", idPacienteExterno: "SIM-2", inicio: dia(10, 10), fin: dia(10, 11), estado: "PROGRAMADA", sala: null, actualizadoEn: hace(24) },
    { idExterno: "SIM-C3", idPacienteExterno: "SIM-3", inicio: dia(11, 8), fin: dia(11, 8, 30), estado: "CANCELADA", sala: "Panorámico", actualizadoEn: hace(1) },
  ],
});

/** `datos` se inyecta en las pruebas; en producción cada llamada ve la misma clínica falsa. */
export function crearSimulado(datos: DatosSimulados = clinicaSimulada()): Conector {
  const quitar = <T extends { actualizadoEn: Date }>({ actualizadoEn: _, ...resto }: T) => resto;
  return {
    clave: "simulado",
    nombre: "Simulado (pruebas)",
    descripcion: "Clínica falsa en memoria para probar la sincronización de punta a punta sin cuentas externas.",
    verificado: true,
    campos: [{ clave: "codigo", etiqueta: "Código de la clínica de prueba", secreto: false }],
    async probarConexion(cred) {
      return cred.codigo === "fallar" ? { ok: false, mensaje: "La clínica simulada rechazó las credenciales" } : { ok: true, mensaje: "Conexión simulada correcta" };
    },
    async listarPacientes(cred, desde) {
      if (cred.codigo === "fallar") throw new ErrorConector("La clínica simulada rechazó las credenciales");
      return datos.pacientes.filter((p) => !desde || p.actualizadoEn > desde).map(quitar);
    },
    async listarCitas(cred, desde) {
      if (cred.codigo === "fallar") throw new ErrorConector("La clínica simulada rechazó las credenciales");
      return datos.citas.filter((c) => !desde || c.actualizadoEn > desde).map(quitar);
    },
    async publicarResultados() {},
  };
}
