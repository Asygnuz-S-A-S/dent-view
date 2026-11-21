// Normaliza lo que llega de un sistema externo (respuesta de API o webhook de entrada) antes de tocar la BD.
import type { CitaExterna, PacienteExterno } from "./tipos.ts";

const texto = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim().slice(0, max) : "");
const opcional = (v: unknown, max: number) => texto(v, max) || null;
const TIPOS = ["CC", "TI", "CE", "PA", "RC"];

function fecha(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string" || !v || v.startsWith("0000")) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** null = registro inválido (se omite y se cuenta). */
export function normalizarPaciente(x: unknown): PacienteExterno | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const idExterno = texto(o.idExterno, 64);
  const numeroDocumento = texto(o.numeroDocumento, 20).replace(/[\s.\-]/g, "").toUpperCase();
  const nombre = texto(o.nombre, 120);
  if (!idExterno || numeroDocumento.length < 3 || !nombre) return null;
  const tipo = texto(o.tipoDocumento, 4).toUpperCase();
  const correo = opcional(o.correo, 120);
  return {
    idExterno, numeroDocumento, nombre,
    tipoDocumento: TIPOS.includes(tipo) ? tipo : "CC",
    fechaNacimiento: fecha(o.fechaNacimiento),
    celular: opcional(o.celular, 20),
    correo: correo && /^[^\s@]+@[^\s@]+$/.test(correo) ? correo : null,
    direccion: opcional(o.direccion, 160),
  };
}

export function normalizarCita(x: unknown): CitaExterna | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const idExterno = texto(o.idExterno, 64);
  const idPacienteExterno = texto(o.idPacienteExterno, 64);
  const inicio = fecha(o.inicio);
  const fin = fecha(o.fin);
  if (!idExterno || !idPacienteExterno || !inicio || !fin || fin <= inicio) return null;
  const estado = o.estado === "CANCELADA" || o.estado === "CONFIRMADA" ? o.estado : "PROGRAMADA";
  return { idExterno, idPacienteExterno, inicio, fin, estado, sala: opcional(o.sala, 40) };
}
