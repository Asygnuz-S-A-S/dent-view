// Definición de los cuatro centros de la demo (nombres, marca y volúmenes). Todo ficticio.
import type { DefCentro } from "./nucleo";
import type { ParamsRad } from "./radiologico";
import { CATALOGO_LUMIA, CATALOGO_RADIA } from "./catalogos";

export const DEF: Record<"lumia" | "radia" | "alejandro-restrepo" | "orion-laboratorio", DefCentro> = {
  lumia: { slug: "lumia", nombre: "Lumia Imágenes Dentales", tipo: "CENTRO_RADIOLOGICO", color: "#0f766e", iniciales: "LI", ciudad: "Manizales", direccion: "Carrera 23 # 62-45, Edificio Torre Médica, piso 3", telefono: "606 555 0142", correo: "contacto@lumia.ejemplo.invalid", registro: "Registro sanitario DEMO-17-0042" },
  radia: { slug: "radia", nombre: "Radia Centro Radiológico", tipo: "CENTRO_RADIOLOGICO", color: "#1d4ed8", iniciales: "RC", ciudad: "Bogotá", direccion: "Calle 127 # 19-30, Consultorio 405", telefono: "601 555 0188", correo: "contacto@radia.ejemplo.invalid", registro: "Registro sanitario DEMO-11-0317" },
  "alejandro-restrepo": { slug: "alejandro-restrepo", nombre: "Alejandro Restrepo Odontología", tipo: "ODONTOLOGO_PARTICULAR", color: "#15803d", iniciales: "AR", ciudad: "Manizales", direccion: "Avenida Santander # 53-18, Consultorio 202", telefono: "606 555 0173", correo: "consultorio@alejandro-restrepo.ejemplo.invalid", registro: "Registro profesional DEMO-RO-2291" },
  "orion-laboratorio": { slug: "orion-laboratorio", nombre: "Orion Laboratorio Dental", tipo: "CENTRO_ODONTOLOGICO", color: "#7c3aed", iniciales: "OL", ciudad: "Medellín", direccion: "Carrera 43A # 14-25, Local 118", telefono: "604 555 0166", correo: "pedidos@orion-laboratorio.ejemplo.invalid", registro: "Registro sanitario DEMO-05-0129" },
};

export const LUMIA: ParamsRad = {
  def: DEF.lumia, catalogo: CATALOGO_LUMIA, salas: [["CBCT · Tomografía", "teal", "cbct"], ["Panorámico", "sky", "pano"], ["Intraoral", "violet", "intra"]],
  nPacientes: 80, nOrdenes: 450, histDias: 365, adminNombre: "Camila Restrepo Ospina", esGrande: true,
  recepcion: [{ email: "recepcion@lumia.ejemplo.invalid", nombre: "Paola Giraldo Marín" }, { email: "tecnico1@lumia.ejemplo.invalid", nombre: "Sebastián Henao Toro" }, { email: "tecnico2@lumia.ejemplo.invalid", nombre: "Lina Cifuentes Arias" }],
  radiologos: [{ email: "radiologo1@lumia.ejemplo.invalid", nombre: "Dra. Sofía Arango Villegas", tarjeta: "TP-61850" }, { email: "radiologo2@lumia.ejemplo.invalid", nombre: "Dr. Daniel Cortés Pardo", tarjeta: "TP-61904" }],
  doctores: [
    { nombre: "Dra. Marcela Ríos Henao", email: "marcela.rios@lumia.ejemplo.invalid", especialidad: "Ortodoncia", ciudad: "Manizales", peso: 3, inicio: 362, ultimo: 1, semaforo: "ACTIVO" },
    { nombre: "Dr. Ricardo Salazar Giraldo", email: "ricardo.salazar@lumia.ejemplo.invalid", especialidad: "Implantología", ciudad: "Manizales", peso: 2.5, inicio: 355, ultimo: 1, semaforo: "ACTIVO" },
    { nombre: "Dra. Juliana Pineda Ocampo", email: "juliana.pineda@lumia.ejemplo.invalid", especialidad: "Endodoncia", ciudad: "Manizales", peso: 2, inicio: 340, ultimo: 2, semaforo: "ACTIVO" },
    { nombre: "Dr. Felipe Aguirre Mejía", email: "felipe.aguirre@lumia.ejemplo.invalid", especialidad: "Cirugía oral y maxilofacial", ciudad: "Pereira", peso: 1.8, inicio: 330, ultimo: 2, semaforo: "ACTIVO" },
    { nombre: "Dra. Catalina Duque Arango", email: "catalina.duque@lumia.ejemplo.invalid", especialidad: "Odontopediatría", ciudad: "Manizales", peso: 1.4, inicio: 300, ultimo: 3, semaforo: "ACTIVO" },
    { nombre: "Dr. Mauricio Toro Valencia", email: "mauricio.toro@lumia.ejemplo.invalid", especialidad: "Periodoncia", ciudad: "Chinchiná", peso: 1.6, inicio: 350, ultimo: 31, semaforo: "EN_RIESGO" },
    { nombre: "Dra. Tatiana Bedoya Cardona", email: "tatiana.bedoya@lumia.ejemplo.invalid", especialidad: "Rehabilitación oral", ciudad: "Villamaría", peso: 1.5, inicio: 345, ultimo: 28, semaforo: "EN_RIESGO" },
    { nombre: "Dr. Álvaro Escobar Patiño", email: "alvaro.escobar@lumia.ejemplo.invalid", especialidad: "Ortopedia maxilar", ciudad: "Armenia", peso: 1, inicio: 320, ultimo: 70, semaforo: "INACTIVO" },
    { nombre: "Dra. Verónica Osorio Rendón", email: "veronica.osorio@lumia.ejemplo.invalid", especialidad: "Estética y diseño de sonrisa", ciudad: "Pereira", peso: 1, inicio: 360, ultimo: 118, semaforo: "CRITICO" },
    { nombre: "Dr. Cristian Londoño Betancur", email: "cristian.londono@lumia.ejemplo.invalid", especialidad: "Odontología general", ciudad: "Manizales", peso: 0, inicio: 25, ultimo: 6, semaforo: "NUEVO" },
  ],
  convenios: [
    { nombre: "Salud Andina (convenio empresarial)", nit: "900.555.101-1", contacto: "Convenios · 606 555 0300", descuento: 12, tarifas: [["Panorámica", 45000], ["CBCT 1 zona (FOV 5x5)", 150000]] },
    { nombre: "Prepagada Cafetera Plus", nit: "900.555.202-2", contacto: "Autorizaciones · 606 555 0310", descuento: null, tarifas: [["Panorámica", 48000], ["CBCT bimaxilar", 290000], ["Paquete ortodoncia inicial", 150000]] },
    { nombre: "Clínica del Eje (convenio institucional)", nit: "900.555.303-3", contacto: "Cartera · 606 555 0320", descuento: 8, tarifas: [] },
    { nombre: "Asociación Odontológica de Caldas", nit: "800.555.404-4", contacto: "Secretaría · 606 555 0330", descuento: 15, tarifas: [["Periapical individual", 12000]] },
  ],
  nEstudios: { PX: 4, CEFALO: 2, IO: 2, BW: 1, CBCT: 4, FACIAL: 1 },
  hoy: ["A", "A", "A", "E", "L", "L", "C", "C", "P", "P", "P"], futuras: [2, 4], solicitadas: 6, cajaDias: 45, mensajes: 70, solicitudes: 6,
};

export const RADIA: ParamsRad = {
  def: DEF.radia, catalogo: CATALOGO_RADIA, salas: [["Tomografía", "sky", "cbct"], ["Panorámico y cefalométrico", "indigo", "pano"], ["Intraoral", "violet", "intra"]],
  nPacientes: 35, nOrdenes: 150, histDias: 180, adminNombre: "Andrés Mauricio Pardo Lozano", esGrande: false,
  recepcion: [{ email: "recepcion@radia.ejemplo.invalid", nombre: "Natalia Moreno Rojas" }, { email: "recepcion2@radia.ejemplo.invalid", nombre: "Diego Torres Cano" }],
  radiologos: [{ email: "radiologo@radia.ejemplo.invalid", nombre: "Dra. Isabella Acosta Bermúdez", tarjeta: "TP-70212" }],
  doctores: [
    { nombre: "Dr. Gustavo Rojas Cortés", email: "gustavo.rojas@radia.ejemplo.invalid", especialidad: "Ortodoncia", ciudad: "Bogotá", peso: 3, inicio: 175, ultimo: 1, semaforo: "ACTIVO" },
    { nombre: "Dra. Lucía Mora Pardo", email: "lucia.mora@radia.ejemplo.invalid", especialidad: "Implantología", ciudad: "Bogotá", peso: 2.5, inicio: 170, ultimo: 2, semaforo: "ACTIVO" },
    { nombre: "Dr. Héctor Cano Lozano", email: "hector.cano@radia.ejemplo.invalid", especialidad: "Endodoncia", ciudad: "Chía", peso: 1.8, inicio: 165, ultimo: 26, semaforo: "EN_RIESGO" },
    { nombre: "Dra. Karen Cifuentes Vargas", email: "karen.cifuentes@radia.ejemplo.invalid", especialidad: "Periodoncia", ciudad: "Bogotá", peso: 1, inicio: 160, ultimo: 66, semaforo: "INACTIVO" },
    { nombre: "Dr. Simón Bermúdez Gil", email: "simon.bermudez@radia.ejemplo.invalid", especialidad: "Odontología general", ciudad: "Soacha", peso: 0, inicio: 20, ultimo: 4, semaforo: "NUEVO" },
  ],
  convenios: [
    { nombre: "Plan Dental Capital (convenio)", nit: "900.555.505-5", contacto: "Convenios · 601 555 0400", descuento: 10, tarifas: [["Panorámica", 42000]] },
    { nombre: "Colegio Odontológico (afiliados)", nit: "800.555.606-6", contacto: "Secretaría · 601 555 0410", descuento: 12, tarifas: [] },
  ],
  nEstudios: { PX: 2, CEFALO: 1, IO: 1, CBCT: 2 },
  hoy: ["A", "A", "E", "L", "C", "P"], futuras: [1, 2], solicitadas: 3, cajaDias: 30, mensajes: 30, solicitudes: 4,
};
