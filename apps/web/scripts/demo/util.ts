// Utilidades comunes del entorno de demostración: entorno, semilla fija, fechas relativas, nombres y lotes.
import { createHash } from "node:crypto";

// ---------- Entorno ----------
const REQUERIDAS = [
  "DATABASE_URL", "ORTHANC_URL", "S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_BUCKET_ESTUDIOS", "S3_BUCKET_ORTHANC",
  "BETTER_AUTH_SECRET", "CIFRADO_SECRETO", "ADMIN_EMAIL", "ADMIN_NOMBRE", "ADMIN_HASH", "DEMO_CLAVE",
] as const;

export function leerEntorno() {
  const faltan = REQUERIDAS.filter((k) => !process.env[k]);
  if (faltan.length) throw new Error(`Faltan variables de entorno: ${faltan.join(", ")}`);
  const e = (k: (typeof REQUERIDAS)[number]) => process.env[k]!;
  if (e("DEMO_CLAVE").length < 10) throw new Error("DEMO_CLAVE debe tener al menos 10 caracteres (mínimo de la app)");
  return {
    orthanc: e("ORTHANC_URL").replace(/\/+$/, ""),
    bucket: e("S3_BUCKET_ESTUDIOS"),
    adminEmail: e("ADMIN_EMAIL").trim().toLowerCase(),
    adminNombre: e("ADMIN_NOMBRE"),
    adminHash: e("ADMIN_HASH"),
    demoClave: e("DEMO_CLAVE"),
    secreto: process.env.CIFRADO_SECRETO || e("BETTER_AUTH_SECRET"),
  };
}
export type Entorno = ReturnType<typeof leerEntorno>;

// ---------- Aleatoriedad con semilla fija ----------
export type Rng = ReturnType<typeof crearRng>;
export function crearRng(semilla: string) {
  let a = createHash("sha256").update(semilla).digest().readUInt32LE(0);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;
  const chance = (p: number) => next() < p;
  const weighted = <T>(xs: readonly T[], pesos: readonly number[]): T => {
    const total = pesos.reduce((s, p) => s + p, 0);
    let r = next() * total;
    for (let i = 0; i < xs.length; i++) { r -= pesos[i]!; if (r < 0) return xs[i]!; }
    return xs[xs.length - 1]!;
  };
  const shuffle = <T>(xs: readonly T[]): T[] => {
    const c = [...xs];
    for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [c[i], c[j]] = [c[j]!, c[i]!]; }
    return c;
  };
  return { next, int, pick, chance, weighted, shuffle };
}

/** Hash determinista (hex) para tokens ficticios: no son secretos y nunca se muestran. */
export const hashFicticio = (s: string) => createHash("sha256").update(`demo:${s}`).digest("hex");

// ---------- Fechas relativas a FECHA_BASE (America/Bogota, UTC-5 sin horario de verano) ----------
export const DIA = 86_400_000;
const hoyBogota = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
export const FECHA_BASE = (() => {
  const f = process.env.FECHA_BASE?.trim() || hoyBogota();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(`${f}T00:00:00Z`))) throw new Error(`FECHA_BASE inválida: ${f} (use AAAA-MM-DD)`);
  return f;
})();
const [BY, BM, BD] = FECHA_BASE.split("-").map(Number) as [number, number, number];

/** Instante de la hora `h:m` (Bogotá) del día `offset` respecto de FECHA_BASE (negativo = pasado). */
export const bog = (offset: number, h = 0, m = 0) => new Date(Date.UTC(BY, BM - 1, BD + offset, h + 5, m));
/** Medianoche UTC del día `offset` (para columnas @db.Date y StudyDate). */
export const diaUtc = (offset: number) => new Date(Date.UTC(BY, BM - 1, BD + offset));
/** Día de la semana ISO (1 = lunes … 7 = domingo) del día `offset`. */
export const diaSemana = (offset: number) => ((diaUtc(offset).getUTCDay() + 6) % 7) + 1;
export const mesDe = (offset: number) => diaUtc(offset).getUTCMonth() + 1;
export const enMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);

// ---------- Nombres colombianos ficticios ----------
const NOMBRES_F = ["Valeria", "Daniela", "Mariana", "Natalia", "Luisa", "Paola", "Carolina", "Juliana", "Sofía", "Camila", "Laura", "Andrea", "Manuela", "Isabella", "Catalina", "Alejandra", "Gabriela", "Tatiana", "Lina", "Diana", "Viviana", "Marcela", "Mónica", "Sara", "Karen", "Johana", "Paula", "Lucía", "Verónica", "Estefanía"];
const NOMBRES_M = ["Santiago", "Julián", "Andrés", "Camilo", "Mateo", "Esteban", "Sebastián", "Felipe", "Daniel", "Juan", "Carlos", "Jorge", "Nicolás", "David", "Miguel", "Alejandro", "Ricardo", "Diego", "Mauricio", "Fernando", "Óscar", "Héctor", "Iván", "Cristian", "Samuel", "Tomás", "Simón", "Gustavo", "Álvaro", "Rodrigo"];
const SEGUNDOS = ["Andrea", "Fernanda", "Isabel", "Sofía", "María", "Alejandra", "Esteban", "Felipe", "Alberto", "José", "Camilo", "David", "Stiven", "Elena", "Patricia"];
const APELLIDOS = ["Cardona", "Mejía", "Quintero", "Londoño", "Ocampo", "Cárdenas", "Bedoya", "Sánchez", "Arias", "Restrepo", "Uribe", "Giraldo", "Marín", "Duque", "Zuluaga", "Montoya", "Vélez", "Arango", "Gil", "Toro", "Franco", "Echeverri", "Herrera", "Naranjo", "Posada", "Ríos", "Salazar", "Pineda", "Aguirre", "Henao", "Osorio", "Ramírez", "Gómez", "Castaño", "Valencia", "Jaramillo", "Ospina", "Villegas", "Betancur", "Correa", "Agudelo", "Escobar", "Patiño", "Rendón", "Tobón", "Vargas", "Moreno", "Rojas", "Pérez", "Torres", "Mora", "Cano", "Cortés", "Lozano", "Pardo", "Cifuentes", "Bermúdez", "Acosta"];

export type Persona = { nombre: string; sexo: "F" | "M"; primerNombre: string; apellido: string };
/** Nombres únicos dentro de la instancia (un Set compartido evita repetir personas entre centros). */
export function generadorNombres(rng: Rng, usados = new Set<string>()) {
  return (): Persona => {
    for (;;) {
      const sexo = rng.chance(0.52) ? "F" : "M";
      const primerNombre = rng.pick(sexo === "F" ? NOMBRES_F : NOMBRES_M);
      const segundo = rng.chance(0.45) ? ` ${rng.pick(SEGUNDOS)}` : "";
      const a1 = rng.pick(APELLIDOS);
      const a2 = rng.pick(APELLIDOS);
      const nombre = `${primerNombre}${segundo} ${a1} ${a2}`;
      if (usados.has(nombre)) continue;
      usados.add(nombre);
      return { nombre, sexo, primerNombre, apellido: a1 };
    }
  };
}

/** Documento ficticio: 10 dígitos que empiezan por 99 (rango que la Registraduría no ha emitido), único en toda la instancia. */
export function generadorDocumentos(rng: Rng, usados = new Set<string>()) {
  return () => {
    for (;;) {
      const n = `99${String(rng.int(0, 99_999_999)).padStart(8, "0")}`;
      if (!usados.has(n)) { usados.add(n); return n; }
    }
  };
}
export const celularFicticio = (rng: Rng) => `3${rng.pick(["00", "01", "05", "10", "15", "20", "50"])}555${String(rng.int(0, 9999)).padStart(4, "0")}`;

export const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");

// ---------- Lotes ----------
export async function enLotes<T>(filas: T[], tam: number, fn: (lote: T[]) => Promise<unknown>) {
  for (let i = 0; i < filas.length; i += tam) await fn(filas.slice(i, i + tam));
}

/** Ejecuta tareas asíncronas con concurrencia limitada, conservando el orden de los resultados. */
export async function conConcurrencia<T, R>(xs: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    while (i < xs.length) { const k = i++; out[k] = await fn(xs[k]!, k); }
  }));
  return out;
}

/** Generador de ids legibles y deterministas por centro: "lumia-ord-12". */
export function fabricaIds(slug: string) {
  const c = new Map<string, number>();
  return (tipo: string) => { const n = (c.get(tipo) ?? 0) + 1; c.set(tipo, n); return `${slug}-${tipo}-${n}`; };
}

export const log = (...a: unknown[]) => console.log(`[demo ${new Date().toISOString().slice(11, 19)}]`, ...a);
export const redondear = (n: number, a = 1000) => Math.round(n / a) * a;

/** Agendador de huecos sin cruces por recurso (sala/profesional). `bloqueos` = franjas fijas del día en minutos (almuerzo). */
export function crearAgendador(bloqueos: [number, number][] = [], fin = 17 * 60 + 30) {
  const ocupado = new Map<string, [number, number][]>();
  return (recurso: string, dia: number, dur: number, pref: number) => {
    const k = `${recurso}|${dia}`;
    const l = ocupado.get(k) ?? [...bloqueos];
    const libre = (s: number) => !l.some(([a, b]) => s < b && s + dur > a);
    for (const rango of [[pref, fin - dur], [8 * 60, pref]] as const) {
      for (let s = rango[0]; s <= rango[1]; s += 15) if (libre(s)) { l.push([s, s + dur]); ocupado.set(k, l); return s; }
    }
    return null;
  };
}
