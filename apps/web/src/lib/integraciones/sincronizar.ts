// Sincronización con el sistema externo. Reglas: solo completa datos vacíos de pacientes que creó la propia integración (nunca toca el contacto de pacientes que ya existían),
// todo se filtra por el centro de la integración y los vínculos hacen que repetir una corrida no duplique nada.
import { prisma } from "@dent-view/db";
import { descifrar, secretoCifrado } from "../cifrado.ts";
import { crearPacienteEnCentro } from "../pacientes-centro.ts";
import { normalizarCita, normalizarPaciente } from "./normalizar.ts";
import { obtenerAdaptador } from "./registro.ts";
import { ErrorConector, type CitaExterna, type Conector, type Credenciales, type PacienteExterno } from "./tipos.ts";

export type IntegracionFila = { id: string; organizationId: string; proveedor: string; credencialesCifradas: string; ultimaSync: Date | null };
export type Conteos = { pacientesCreados: number; pacientesCompletados: number; vinculadosSinCambios: number; citasCreadas: number; omitidos: number };
export const conteosVacios = (): Conteos => ({ pacientesCreados: 0, pacientesCompletados: 0, vinculadosSinCambios: 0, citasCreadas: 0, omitidos: 0 });

const clave = (integracionId: string, entidad: string, idExterno: string) => ({ integracionId_entidad_idExterno: { integracionId, entidad, idExterno } });
const SALA_IMPORTADA = "Importada";
/** Nombre externo del sillón para `notas`: sin saltos de línea ni control, máx. 80 caracteres. */
export const notaSillon = (sala: string | null | undefined) => {
  const limpio = (sala ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return limpio ? `Sillón externo: ${limpio}` : null;
};
const vacio = (v: string | null | undefined) => !v || !v.trim();

async function vincular(integracionId: string, entidad: string, idInterno: string, idExterno: string) {
  await prisma.vinculoExterno.upsert({ where: clave(integracionId, entidad, idExterno), update: {}, create: { integracionId, entidad, idInterno, idExterno } });
}

/** Vínculo del paciente: "paciente" = lo creó esta integración (puede completarlo); "paciente_existente" = ya estaba en el centro (no se toca su contacto). */
async function buscarPaciente(integracionId: string, idExterno: string) {
  const propio = await prisma.vinculoExterno.findUnique({ where: clave(integracionId, "paciente", idExterno) });
  if (propio) return { idInterno: propio.idInterno, propio: true };
  const otro = await prisma.vinculoExterno.findUnique({ where: clave(integracionId, "paciente_existente", idExterno) });
  return otro ? { idInterno: otro.idInterno, propio: false } : null;
}

/**
 * Crea el paciente en el centro de la integración. Si ya existía en el centro solo se vincula, sin tocar su contacto
 * (a ese correo llegan enlaces y códigos de resultados: un sistema externo no puede cambiarlo). Solo los pacientes
 * creados por esta integración se completan en sincronizaciones posteriores, y solo en campos vacíos.
 */
export async function aplicarPaciente(integ: Pick<IntegracionFila, "id" | "organizationId">, p: PacienteExterno, c: Conteos) {
  const previo = await buscarPaciente(integ.id, p.idExterno);
  if (!previo) {
    const r = await crearPacienteEnCentro(integ.organizationId, { tipoDocumento: p.tipoDocumento, numeroDocumento: p.numeroDocumento }, { nombre: p.nombre, fechaNacimiento: p.fechaNacimiento, celular: p.celular, correo: p.correo, direccion: p.direccion });
    if ("creado" in r) {
      await vincular(integ.id, "paciente", r.creado.id, p.idExterno);
      c.pacientesCreados++;
    } else {
      await vincular(integ.id, "paciente_existente", r.existente, p.idExterno);
      c.vinculadosSinCambios++;
    }
    return;
  }
  if (!previo.propio) return;
  const actual = await prisma.pacienteTenant.findFirst({ where: { id: previo.idInterno, organizationId: integ.organizationId } });
  if (!actual) return void c.omitidos++;
  const completar = {
    ...(!actual.fechaNacimiento && p.fechaNacimiento && { fechaNacimiento: p.fechaNacimiento }),
    ...(vacio(actual.celular) && p.celular && { celular: p.celular }),
    ...(vacio(actual.correo) && p.correo && { correo: p.correo }),
    ...(vacio(actual.direccion) && p.direccion && { direccion: p.direccion }),
  };
  if (Object.keys(completar).length) {
    await prisma.pacienteTenant.update({ where: { id: actual.id }, data: completar });
    c.pacientesCompletados++;
  }
}

/**
 * Crea la cita importada (una sola vez por id externo) para un paciente ya vinculado. Una cita ya vinculada no se toca.
 * Nunca crea salas a partir de datos externos: todas van a la sala "Importada" del centro; el sillón externo queda en `notas`.
 * Las citas importadas no pasan por la validación de cruce de agenda (reflejan lo que ya agendó el sistema externo).
 */
export async function aplicarCita(integ: Pick<IntegracionFila, "id" | "organizationId">, cita: CitaExterna, c: Conteos) {
  if (await prisma.vinculoExterno.findUnique({ where: clave(integ.id, "cita", cita.idExterno) })) return;
  const paciente = await buscarPaciente(integ.id, cita.idPacienteExterno);
  const pacienteOk = paciente && (await prisma.pacienteTenant.findFirst({ where: { id: paciente.idInterno, organizationId: integ.organizationId }, select: { id: true } }));
  if (!pacienteOk) return void c.omitidos++;
  const sala = (await prisma.sala.findFirst({ where: { organizationId: integ.organizationId, nombre: SALA_IMPORTADA }, select: { id: true } })) ?? (await prisma.sala.create({ data: { organizationId: integ.organizationId, nombre: SALA_IMPORTADA }, select: { id: true } }));
  const notas = notaSillon(cita.sala);
  const creada = await prisma.cita.create({ data: { organizationId: integ.organizationId, salaId: sala.id, pacienteId: pacienteOk.id, inicio: cita.inicio, fin: cita.fin, estado: cita.estado, notas, origen: "API", cruceHistorico: true }, select: { id: true } }); // la sala "Importada" agrupa varios sillones externos: puede haber citas simultáneas, por eso quedan fuera de la restricción de no cruce
  await vincular(integ.id, "cita", creada.id, cita.idExterno);
  c.citasCreadas++;
}

/** Mensaje apto para guardar y mostrar: solo el de un ErrorConector, sin valores de credenciales. */
export function mensajeSeguro(e: unknown, cred: Credenciales = {}) {
  let m = e instanceof ErrorConector ? e.message : "Error inesperado durante la sincronización";
  for (const v of Object.values(cred)) if (v.length >= 4) m = m.split(v).join("***");
  return m.slice(0, 200);
}

const evento = (integ: IntegracionFila, tipo: string, detalle: object) =>
  prisma.evento.create({ data: { organizationId: integ.organizationId, tipo, detalle: { integracionId: integ.id, proveedor: integ.proveedor, ...detalle } } });

export async function sincronizar(integ: IntegracionFila, adaptador: Conector | null = obtenerAdaptador(integ.proveedor), secreto = secretoCifrado()): Promise<{ ok: true; conteos: Conteos } | { ok: false; error: string }> {
  const inicio = new Date(); // se guarda al terminar: lo que cambie durante la corrida se vuelve a traer en la siguiente
  const conteos = conteosVacios();
  let cred: Credenciales = {};
  try {
    if (!adaptador) throw new ErrorConector("Proveedor no soportado");
    if (!secreto) throw new ErrorConector("Falta configuración del servidor");
    cred = JSON.parse(descifrar(integ.credencialesCifradas, secreto)) as Credenciales;
    // Lo que devuelve el adaptador es entrada externa: se normaliza y lo inválido se omite.
    for (const crudo of await adaptador.listarPacientes(cred, integ.ultimaSync)) {
      const p = normalizarPaciente(crudo);
      p ? await aplicarPaciente(integ, p, conteos) : conteos.omitidos++;
    }
    for (const crudo of await adaptador.listarCitas(cred, integ.ultimaSync)) {
      const cita = normalizarCita(crudo);
      cita ? await aplicarCita(integ, cita, conteos) : conteos.omitidos++;
    }
    await prisma.integracion.update({ where: { id: integ.id }, data: { ultimaSync: inicio, estadoSync: "OK", errorSync: null } });
    await evento(integ, "integracion.sync", { estado: "OK", ...conteos });
    return { ok: true, conteos };
  } catch (e) {
    const error = mensajeSeguro(e, cred);
    await prisma.integracion.update({ where: { id: integ.id }, data: { estadoSync: "ERROR", errorSync: error } }).catch(() => {});
    await evento(integ, "integracion.sync", { estado: "ERROR", error, ...conteos }).catch(() => {});
    return { ok: false, error };
  }
}

/** Para el worker: sincroniza todas las integraciones activas, una tras otra. */
export async function sincronizarActivas() {
  for (const integ of await prisma.integracion.findMany({ where: { activa: true }, select: { id: true, organizationId: true, proveedor: true, credencialesCifradas: true, ultimaSync: true } })) await sincronizar(integ);
}
