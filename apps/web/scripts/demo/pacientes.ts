// Pacientes ficticios: documentos 99xxxxxxxx, teléfonos 3xx555xxxx y SIN correo (ningún proceso puede escribirles).
import { calcularEdad } from "../../src/lib/pacientes";
import { Acum, eventoCreacion } from "./nucleo";
import { BARRIOS } from "./catalogos";
import { bog, celularFicticio, diaUtc, type Persona, type Rng } from "./util";

export type Pac = {
  id: string; personaId: string; nombre: string; primerNombre: string; sexo: "F" | "M"; tipoDoc: "CC" | "TI"; doc: string; nac: Date; edad: number;
  celular: string; direccion: string; alertas: string | null; creadoEn: Date; ultimaVisitaEn: Date | null; proximoControlEn: Date | null; fotoKey: string | null;
};

export function crearPacientes(o: { slug: string; rng: Rng; n: number; nombre: () => Persona; documento: () => string; ciudad: string; minEdad?: number; maxEdad?: number; menores?: number }): Pac[] {
  const { rng } = o;
  return Array.from({ length: o.n }, (_, i) => {
    const p = o.nombre();
    const menor = i < (o.menores ?? Math.round(o.n * 0.12));
    const edad = menor ? rng.int(5, 17) : rng.int(o.minEdad ?? 18, o.maxEdad ?? 72);
    const nac = diaUtc(-(edad * 365 + rng.int(0, 364)));
    return {
      id: `${o.slug}-pac-${i + 1}`, personaId: `${o.slug}-per-${i + 1}`, nombre: p.nombre, primerNombre: p.primerNombre, sexo: p.sexo, tipoDoc: menor ? "TI" : "CC", doc: o.documento(),
      nac, edad: calcularEdad(nac, bog(0)), celular: celularFicticio(rng), direccion: `Barrio ${rng.pick(BARRIOS)}, ${o.ciudad}`,
      alertas: menor ? "Menor de edad: acompañante obligatorio." : null, creadoEn: bog(-30), ultimaVisitaEn: null, proximoControlEn: null, fotoKey: null,
    };
  });
}

/** Inserta personas y pacientes del centro (sin correo) y el evento de creación de cada uno. */
export function registrarPacientes(A: Acum, o: { orgId: string; slug: string; pacientes: Pac[]; actor: string }) {
  o.pacientes.forEach((p, i) => {
    A.add("persona", { id: p.personaId, tipoDocumento: p.tipoDoc, numeroDocumento: p.doc, creadoEn: p.creadoEn });
    A.add("pacienteTenant", {
      id: p.id, organizationId: o.orgId, personaId: p.personaId, nombre: p.nombre, fechaNacimiento: p.nac, celular: p.celular, correo: null, direccion: p.direccion,
      alertas: p.alertas, fotoKey: p.fotoKey, ultimaVisitaEn: p.ultimaVisitaEn, proximoControlEn: p.proximoControlEn, creadoEn: p.creadoEn,
    });
    eventoCreacion(A, { orgId: o.orgId, slug: o.slug, pacienteId: p.id, fecha: p.creadoEn, actor: o.actor, n: i + 1 });
  });
}

/** Historia clínica de apoyo (contexto médico, alergias, medicación, enfermedades, contacto de emergencia). */
export function historiaClinica(A: Acum, o: { orgId: string; slug: string; rng: Rng; pacientes: Pac[]; fraccion: number; actor: string }) {
  const { rng } = o;
  const alergias: [string, string, string][] = [["Penicilina", "ALTA", "Urticaria"], ["Látex", "ALTA", "Dermatitis de contacto"], ["Ibuprofeno", "MEDIA", "Malestar gástrico"], ["Anestésicos locales (lidocaína)", "CRITICA", "Edema facial"], ["Yodo", "BAJA", "Enrojecimiento"], ["Metronidazol", "MEDIA", "Náuseas"]];
  const meds = ["Losartán 50 mg", "Metformina 850 mg", "Levotiroxina 75 mcg", "Anticonceptivo oral", "Omeprazol 20 mg", "Atorvastatina 20 mg", "Salbutamol inhalador"];
  const enfs: [string, boolean][] = [["Hipertensión arterial", true], ["Diabetes mellitus tipo 2", true], ["Hipotiroidismo", false], ["Asma", false], ["Gastritis crónica", false], ["Rinitis alérgica", false]];
  let n = 0;
  for (const p of o.pacientes) {
    if (!rng.chance(o.fraccion)) continue;
    n++;
    const creadoEn = p.creadoEn;
    const mujer = p.sexo === "F" && p.edad >= 18 && p.edad <= 42;
    A.add("contextoMedico", {
      pacienteId: p.id, organizationId: o.orgId, embarazo: mujer && rng.chance(0.08), semanasEmbarazo: null, lactancia: false, anticoagulantes: rng.chance(0.05), anticoagulanteNombre: null,
      implantesMetalicos: rng.chance(0.05), marcapasos: false, claustrofobia: rng.chance(0.04), reaccionAnestesia: false, actualizadoEn: creadoEn, actualizadoPorId: o.actor,
    });
    if (rng.chance(0.4)) { const [nombre, gravedad, reaccion] = rng.pick(alergias); A.add("alergiaPaciente", { id: `${o.slug}-ale-${n}`, organizationId: o.orgId, pacienteId: p.id, nombre, gravedad, reaccion, activo: true, creadoEn }); }
    if (p.edad > 30 && rng.chance(0.45)) A.add("medicacionPaciente", { id: `${o.slug}-med-${n}`, organizationId: o.orgId, pacienteId: p.id, nombre: rng.pick(meds), activo: true, creadoEn });
    if (p.edad > 35 && rng.chance(0.4)) { const [nombre, critica] = rng.pick(enfs); A.add("enfermedadPaciente", { id: `${o.slug}-enf-${n}`, organizationId: o.orgId, pacienteId: p.id, nombre, critica, activo: true, creadoEn }); }
    if (rng.chance(0.5)) A.add("contactoEmergencia", { pacienteId: p.id, organizationId: o.orgId, nombre: `Familiar de ${p.primerNombre}`, parentesco: rng.pick(["Madre", "Esposo(a)", "Hermano(a)", "Hijo(a)"]), telefono: p.celular.replace(/\d{4}$/, "0000"), esRepresentante: p.edad < 18 });
  }
}
