// Catálogos de servicios (COP) y textos clínicos de la demo. Todo ficticio.
export type Sala = "cbct" | "pano" | "intra" | "cons";
export type SrvDef = {
  categoria: string; nombre: string; impreso: number | null; digital: number | null; descuento: number;
  min: number; sala: Sala; peso: number;
  /** Tipo de estudio DICOM que genera este servicio (si aplica). */
  dicom?: "PX" | "CEFALO" | "IO" | "BW" | "CBCT" | "FACIAL";
  tecnica?: string;
};
const s = (categoria: string, nombre: string, impreso: number | null, digital: number | null, descuento: number, min: number, sala: Sala, peso: number, dicom?: SrvDef["dicom"], tecnica?: string): SrvDef =>
  ({ categoria, nombre, impreso, digital, descuento, min, sala, peso, dicom, tecnica });

export const CATALOGO_LUMIA: SrvDef[] = [
  s("ESTUDIO_2D", "Panorámica", 65000, 55000, 5000, 30, "pano", 10, "PX", "Radiografía panorámica digital"),
  s("ESTUDIO_2D", "Cefalométrica lateral (perfil)", 65000, 55000, 5000, 30, "pano", 6, "CEFALO", "Telerradiografía lateral de cráneo con trazado"),
  s("ESTUDIO_2D", "Cefalométrica frontal (PA)", 65000, 55000, 5000, 30, "pano", 2, "CEFALO", "Telerradiografía frontal (PA) de cráneo"),
  s("ESTUDIO_2D", "Panorámica + cefalométrica", 110000, 95000, 10000, 45, "pano", 4, "PX", "Radiografía panorámica y telerradiografía lateral"),
  s("ESTUDIO_2D", "Periapical individual", 18000, 15000, 0, 15, "intra", 8, "IO", "Radiografía periapical, técnica de paralelismo"),
  s("ESTUDIO_2D", "Periapical completo (14 placas)", 150000, 130000, 10000, 45, "intra", 3, "IO", "Serie periapical completa"),
  s("ESTUDIO_2D", "Bite wing (aleta de mordida) x2", 40000, 35000, 0, 15, "intra", 4, "BW", "Radiografías interproximales (bite wing) bilaterales"),
  s("ESTUDIO_2D", "Oclusal", 28000, 25000, 0, 15, "intra", 1, "IO", "Radiografía oclusal"),
  s("ESTUDIO_2D", "ATM (boca abierta y cerrada)", 70000, 60000, 5000, 30, "pano", 2, "PX", "Proyecciones de ATM en boca abierta y cerrada"),
  s("ESTUDIO_2D", "Carpograma", 60000, 50000, 5000, 30, "pano", 1, "PX", "Radiografía de carpo (edad ósea)"),
  s("ESTUDIO_2D", "Fotografías clínicas x8", 70000, 65000, 5000, 30, "intra", 2, undefined, "Serie fotográfica clínica extra e intraoral"),
  s("TOMOGRAFIA", "CBCT 1 zona (FOV 5x5)", 190000, 180000, 10000, 30, "cbct", 6, "CBCT", "Tomografía computarizada de haz cónico, campo reducido"),
  s("TOMOGRAFIA", "CBCT maxilar superior", 240000, 230000, 10000, 30, "cbct", 4, "CBCT", "CBCT de maxilar superior"),
  s("TOMOGRAFIA", "CBCT mandíbula", 240000, 230000, 10000, 30, "cbct", 3, "CBCT", "CBCT de mandíbula"),
  s("TOMOGRAFIA", "CBCT bimaxilar", 360000, 340000, 20000, 30, "cbct", 5, "CBCT", "CBCT de ambas arcadas dentales"),
  s("TOMOGRAFIA", "CBCT ATM bilateral", 320000, 300000, 10000, 30, "cbct", 1, "CBCT", "CBCT de articulaciones temporomandibulares"),
  s("TOMOGRAFIA", "CBCT senos paranasales", 340000, 320000, 10000, 30, "cbct", 1, "CBCT", "CBCT de senos paranasales"),
  s("TOMOGRAFIA", "CBCT vía aérea", 340000, 320000, 10000, 30, "cbct", 1, "CBCT", "CBCT con análisis de vía aérea"),
  s("TOMOGRAFIA", "CBCT cráneo completo", 480000, 450000, 20000, 45, "cbct", 1, "CBCT", "CBCT de cráneo completo"),
  s("TOMOGRAFIA", "CBCT planeación de implantes", 280000, 260000, 10000, 45, "cbct", 3, "CBCT", "CBCT con planeación de implantes"),
  s("PAQUETE", "Paquete ortodoncia inicial", 190000, 170000, 10000, 45, "pano", 5, "PX", "Panorámica, telerradiografía lateral y fotografías clínicas"),
  s("PAQUETE", "Paquete ortodoncia + CBCT", 480000, 440000, 20000, 60, "cbct", 1, "CBCT", "Paquete ortodoncia con tomografía bimaxilar"),
  s("PAQUETE", "Paquete implantes", 270000, 250000, 15000, 45, "cbct", 3, "CBCT", "Panorámica y CBCT de zona para implantes"),
  s("PAQUETE", "Paquete cirugía de terceros molares", 240000, 220000, 10000, 45, "cbct", 2, "CBCT", "Panorámica y CBCT de cordales"),
  s("PAQUETE", "Paquete diseño de sonrisa", 230000, 210000, 10000, 45, "pano", 1, "PX", "Fotografías, panorámica y telerradiografía lateral"),
  s("ESCANEO", "Escaneo facial 3D", 150000, 140000, 0, 30, "cbct", 1, "FACIAL", "Escaneo facial tridimensional"),
  s("ESCANEO", "Escaneo intraoral (arcadas)", 90000, 80000, 0, 30, "intra", 2, undefined, "Escaneo intraoral de ambas arcadas"),
  s("ESCANEO", "Modelos digitales STL ortodoncia", 110000, 100000, 0, 30, "intra", 1, undefined, "Modelos digitales STL para ortodoncia"),
];

export const CATALOGO_RADIA: SrvDef[] = [
  s("ESTUDIO_2D", "Panorámica", 55000, 48000, 3000, 30, "pano", 10, "PX", "Radiografía panorámica digital"),
  s("ESTUDIO_2D", "Cefalométrica lateral", 55000, 48000, 3000, 30, "pano", 6, "CEFALO", "Telerradiografía lateral de cráneo"),
  s("ESTUDIO_2D", "Periapical", 15000, 12000, 0, 15, "intra", 8, "IO", "Radiografía periapical"),
  s("ESTUDIO_2D", "Bite wing x2", 34000, 30000, 0, 15, "intra", 3, "BW", "Radiografías interproximales bilaterales"),
  s("ESTUDIO_2D", "Serie periapical completa", 125000, 110000, 5000, 45, "intra", 2, "IO", "Serie periapical completa"),
  s("ESTUDIO_2D", "ATM boca abierta y cerrada", 62000, 55000, 0, 30, "pano", 2, "PX", "Proyecciones de ATM"),
  s("ESTUDIO_2D", "Carpograma", 52000, 46000, 0, 30, "pano", 1, "PX", "Radiografía de carpo"),
  s("ESTUDIO_2D", "Fotografías clínicas x8", 60000, 55000, 0, 30, "intra", 2, undefined, "Serie fotográfica clínica"),
  s("TOMOGRAFIA", "CBCT 1 zona", 170000, 160000, 10000, 30, "cbct", 6, "CBCT", "CBCT de campo reducido"),
  s("TOMOGRAFIA", "CBCT bimaxilar", 320000, 300000, 15000, 30, "cbct", 4, "CBCT", "CBCT de ambas arcadas"),
  s("TOMOGRAFIA", "CBCT senos paranasales", 300000, 280000, 10000, 30, "cbct", 1, "CBCT", "CBCT de senos paranasales"),
  s("PAQUETE", "Paquete ortodoncia", 160000, 145000, 8000, 45, "pano", 4, "PX", "Panorámica, cefalométrica y fotografías"),
  s("PAQUETE", "Paquete implantes", 240000, 220000, 12000, 45, "cbct", 3, "CBCT", "Panorámica y CBCT de zona"),
  s("ESCANEO", "Escaneo intraoral", 85000, 75000, 0, 30, "intra", 2, undefined, "Escaneo intraoral de ambas arcadas"),
];

export const CATALOGO_ALEJANDRO: SrvDef[] = [
  s("OTRO", "Consulta de valoración", null, 60000, 0, 30, "cons", 8),
  s("OTRO", "Profilaxis (limpieza)", null, 110000, 0, 45, "cons", 9),
  s("OTRO", "Detartraje con ultrasonido", null, 130000, 0, 45, "cons", 5),
  s("OTRO", "Resina 1 superficie", null, 140000, 0, 45, "cons", 8),
  s("OTRO", "Resina 2 superficies", null, 180000, 0, 60, "cons", 6),
  s("OTRO", "Resina 3 superficies", null, 230000, 0, 60, "cons", 3),
  s("OTRO", "Sellantes (por diente)", null, 60000, 0, 30, "cons", 2),
  s("OTRO", "Fluorización", null, 50000, 0, 30, "cons", 2),
  s("OTRO", "Endodoncia unirradicular", null, 450000, 0, 60, "cons", 3),
  s("OTRO", "Endodoncia birradicular", null, 560000, 0, 75, "cons", 2),
  s("OTRO", "Endodoncia multirradicular", null, 720000, 0, 90, "cons", 2),
  s("OTRO", "Corona zirconio", null, 1100000, 0, 60, "cons", 2),
  s("OTRO", "Corona metal-porcelana", null, 780000, 0, 60, "cons", 1),
  s("OTRO", "Blanqueamiento en consultorio", null, 650000, 50000, 90, "cons", 2),
  s("OTRO", "Blanqueamiento casero (kit)", null, 380000, 0, 30, "cons", 1),
  s("OTRO", "Exodoncia simple", null, 120000, 0, 30, "cons", 3),
  s("OTRO", "Exodoncia de tercer molar", null, 420000, 0, 60, "cons", 2),
  s("OTRO", "Implante unitario", null, 2800000, 100000, 90, "cons", 1),
  s("OTRO", "Corona sobre implante", null, 1300000, 0, 60, "cons", 1),
  s("OTRO", "Ortodoncia: instalación de brackets", null, 1800000, 0, 90, "cons", 1),
  s("OTRO", "Ortodoncia: control mensual", null, 120000, 0, 30, "cons", 5),
  s("OTRO", "Retenedores", null, 280000, 0, 30, "cons", 1),
  s("OTRO", "Placa de bruxismo", null, 350000, 0, 30, "cons", 1),
  s("ESTUDIO_2D", "Radiografía periapical", null, 25000, 0, 15, "cons", 6, "IO"),
  s("ESTUDIO_2D", "Radiografía panorámica", null, 60000, 0, 30, "cons", 2, "PX"),
];

export const CATALOGO_ORION: SrvDef[] = [
  s("OTRO", "Corona metal-porcelana", null, 190000, 0, 0, "cons", 8),
  s("OTRO", "Corona zirconio monolítico", null, 380000, 0, 0, "cons", 9),
  s("OTRO", "Corona zirconio estratificado", null, 450000, 0, 0, "cons", 5),
  s("OTRO", "Corona e.max (disilicato)", null, 420000, 0, 0, "cons", 4),
  s("OTRO", "Puente 3 unidades zirconio", null, 1050000, 0, 0, "cons", 3),
  s("OTRO", "Puente 3 unidades metal-porcelana", null, 570000, 0, 0, "cons", 3),
  s("OTRO", "Carilla e.max", null, 400000, 0, 0, "cons", 3),
  s("OTRO", "Carilla porcelana feldespática", null, 380000, 0, 0, "cons", 1),
  s("OTRO", "Incrustación e.max", null, 330000, 0, 0, "cons", 2),
  s("OTRO", "Prótesis total acrílica (par)", null, 520000, 0, 0, "cons", 3),
  s("OTRO", "Prótesis total superior", null, 290000, 0, 0, "cons", 2),
  s("OTRO", "Prótesis parcial removible acrílica", null, 260000, 0, 0, "cons", 3),
  s("OTRO", "Prótesis parcial removible metálica", null, 620000, 0, 0, "cons", 2),
  s("OTRO", "Guarda oclusal rígida", null, 150000, 0, 0, "cons", 5),
  s("OTRO", "Guarda oclusal blanda", null, 110000, 0, 0, "cons", 2),
  s("OTRO", "Modelo de estudio", null, 25000, 0, 0, "cons", 5),
  s("OTRO", "Modelo impreso 3D", null, 45000, 0, 0, "cons", 6),
  s("OTRO", "Guía quirúrgica impresa 3D", null, 280000, 0, 0, "cons", 2),
  s("OTRO", "Provisional impreso 3D", null, 55000, 0, 0, "cons", 4),
  s("OTRO", "Retenedor", null, 80000, 0, 0, "cons", 3),
  s("OTRO", "Pilar personalizado sobre implante", null, 320000, 0, 0, "cons", 2),
  s("OTRO", "Corona atornillada sobre implante", null, 520000, 0, 0, "cons", 2),
];

// ---------- Códigos CUPS por servicio (RIPS) ----------
// Solo códigos del catálogo embebido de la app (lib/catalogos/cups.json, parcial: se valida contra SISPRO antes de reportar).
// Los servicios sin equivalente claro quedan SIN código a propósito (el RIPS de esas órdenes sale "incompleto", como en la vida real).
const CUPS_POR_NOMBRE: [RegExp, string][] = [
  [/^Panorámica( \+ cefalométrica)?$|^Paquete ortodoncia( inicial)?$|^Paquete diseño/i, "870114"],
  [/^ATM \(|^ATM boca/i, "870131"],
  [/^Periapical completo|^Serie periapical/i, "870456"],
  [/^Cefalométrica/i, "870002"],
  [/^Periapical (individual|completo)|^Periapical$|^Serie periapical|^Radiografía periapical/i, "870450"],
  [/^Bite wing/i, "870460"],
  [/^Oclusal$/i, "870440"],
  [/^Fotografías clínicas/i, "893102"],
  [/^Modelos? (digitales|de estudio)/i, "893101"],
  [/^CBCT senos/i, "879131"],
  [/^CBCT ATM/i, "879150"],
  [/^CBCT|^Paquete (implantes|cirugía|ortodoncia \+ CBCT)/i, "879141"],
  [/^Radiografía panorámica/i, "870114"],
  [/^Consulta de valoración/i, "890203"],
  [/^Profilaxis/i, "997001"],
  [/^Detartraje/i, "240201"],
  [/^Resina/i, "232102"],
  [/^Sellantes/i, "997107"],
  [/^Fluorización/i, "997106"],
  [/^Endodoncia unirradicular/i, "237301"],
  [/^Exodoncia simple/i, "230101"],
];
export const cupsDe = (nombre: string) => CUPS_POR_NOMBRE.find(([re]) => re.test(nombre))?.[1] ?? null;
export const tipoRipsDe = (nombre: string): "CONSULTA" | "PROCEDIMIENTO" => (/^Consulta/i.test(nombre) ? "CONSULTA" : "PROCEDIMIENTO");

/** Diagnósticos CIE-10 (4 caracteres, del catálogo embebido) frecuentes según el estudio. */
export const DX_POR_ESTUDIO: Record<string, string[]> = {
  PX: ["K021", "K053", "K011", "K081", "K073", "K010"], CEFALO: ["K073", "K074", "K071"], IO: ["K021", "K041", "K045", "K044"], BW: ["K021", "K053"],
  CBCT: ["K011", "K081", "K048", "K076", "K083"], FACIAL: ["K078"], DEFECTO: ["Z012", "K021"],
};

// ---------- Textos de informes radiológicos (ficticios, genéricos) ----------
export const HALLAZGOS: Record<string, { hallazgos: string[]; impresion: string[]; recomendaciones: string[] }> = {
  PX: {
    hallazgos: [
      "Estructuras óseas maxilares y mandibulares de densidad y trabeculado normales. Senos maxilares neumatizados y simétricos. Cóndilos de morfología conservada. Se observan terceros molares incluidos 38 y 48 en posición mesioangular.",
      "Dentición permanente completa hasta segundos molares. Lesión radiolúcida compatible con caries en la cara distal del 36. Restauración radiopaca en el 46 con adaptación marginal aceptable. Pérdida ósea horizontal leve generalizada.",
      "Ausencia de los dientes 36 y 46. Reabsorción alveolar moderada en las zonas edéntulas, con altura ósea residual adecuada para rehabilitación. Canal mandibular visible bilateralmente.",
      "Dentición mixta tardía con presencia de gérmenes de segundos premolares. Erupción ectópica del 13. Espacio disponible disminuido en el sector anterosuperior.",
    ],
    impresion: [
      "Hallazgos panorámicos sin patología ósea evidente. Terceros molares inferiores incluidos.",
      "Caries distal del 36. Pérdida ósea horizontal leve generalizada.",
      "Edentulismo parcial de 36 y 46 con adecuada altura ósea residual.",
      "Dentición mixta tardía con apiñamiento y erupción ectópica del 13.",
    ],
    recomendaciones: ["Correlacionar con la valoración clínica.", "Se sugiere complementar con tomografía de haz cónico de la zona.", "Control radiográfico en 6 meses."],
  },
  CEFALO: {
    hallazgos: [
      "Patrón esquelético clase II con retrusión mandibular relativa (ANB aumentado). Biotipo facial mesofacial. Incisivos superiores protruidos respecto a la base ósea. Tejidos blandos con perfil convexo.",
      "Relación esquelética clase I (ANB dentro de norma). Inclinación de incisivos inferiores aumentada. Altura facial inferior proporcionada. Vía aérea faríngea sin reducción evidente.",
      "Patrón esquelético clase III por prognatismo mandibular. Mordida cruzada anterior. Perfil blando cóncavo.",
    ],
    impresion: ["Clase esquelética II con retrusión mandibular.", "Clase esquelética I con protrusión dentoalveolar inferior.", "Clase esquelética III con prognatismo mandibular."],
    recomendaciones: ["Se anexa trazado cefalométrico para planeación ortodóntica.", "Correlacionar con modelos de estudio y fotografías clínicas."],
  },
  IO: {
    hallazgos: [
      "Lesión radiolúcida periapical bien delimitada de aproximadamente 4 mm asociada al ápice del diente evaluado. Conducto con obturación incompleta. Ligamento periodontal ensanchado.",
      "Cámara pulpar y conductos de morfología normal. Ligamento periodontal uniforme. Cresta ósea alveolar conservada. Sin lesiones periapicales.",
      "Restauración radiopaca profunda próxima a la cámara pulpar. Lámina dura continua. Sin evidencia de patología periapical.",
    ],
    impresion: ["Periodontitis apical crónica del diente evaluado.", "Sin patología periapical.", "Restauración profunda sin compromiso periapical."],
    recomendaciones: ["Correlacionar con pruebas de vitalidad pulpar.", "Control radiográfico posterior al tratamiento."],
  },
  BW: {
    hallazgos: [
      "Lesiones cariosas incipientes interproximales en la cara mesial del 16 y distal del 25. Niveles óseos interproximales conservados. Sin cálculo subgingival evidente.",
      "Sin lesiones cariosas interproximales evidentes. Crestas óseas a 1 mm de la unión amelocementaria. Restauraciones con márgenes adecuados.",
    ],
    impresion: ["Caries interproximales incipientes en 16 y 25.", "Sin caries interproximales."],
    recomendaciones: ["Aplicar medidas preventivas y control en 6 meses."],
  },
  CBCT: {
    hallazgos: [
      "Reconstrucción multiplanar y cortes transversales de la zona evaluada. Altura ósea disponible de 11 mm y ancho de 6.5 mm en la zona del 36, con distancia al canal dentario inferior de 12 mm. Hueso tipo II. Sin lesiones osteolíticas.",
      "Diente 38 incluido en posición mesioangular con íntimo contacto con el conducto dentario inferior. Corticales vestibular y lingual íntegras. Sin patología quística asociada.",
      "Senos maxilares con ligero engrosamiento mucoso basal bilateral. Complejo ostiomeatal permeable. Piso del seno a 8 mm de la cresta alveolar en la zona 16.",
      "Lesión hipodensa periapical de 5 mm asociada al 21 con adelgazamiento de la cortical vestibular. Resto de estructuras sin alteraciones.",
    ],
    impresion: [
      "Disponibilidad ósea adecuada para implante en la zona 36.",
      "Tercer molar inferior incluido en íntimo contacto con el conducto dentario.",
      "Engrosamiento mucoso leve de senos maxilares. Altura ósea limitada en zona 16 (elevación de seno a considerar).",
      "Lesión periapical del 21 con compromiso cortical vestibular.",
    ],
    recomendaciones: ["Planeación con guía quirúrgica según criterio del tratante.", "Correlacionar con hallazgos clínicos.", "Valoración por cirugía oral."],
  },
  FACIAL: { hallazgos: ["Escaneo facial tridimensional con adecuada captura de superficie. Simetría facial conservada con discreta desviación del mentón hacia la derecha."], impresion: ["Escaneo facial 3D adecuado para planeación."], recomendaciones: ["Integrar con tomografía para planeación."] },
};
export const OBSERVACIONES = [
  "Control de ortodoncia", "Planeación de implante", "Valoración previa a cirugía", "Dolor en zona posterior", "Evaluación de terceros molares",
  "Seguimiento postoperatorio", "Estudio inicial de ortodoncia", "Revisión de tratamiento de conductos", "Rehabilitación oral", "Evaluación de ATM",
];
export const ESPECIALIDADES = ["Ortodoncia", "Implantología", "Endodoncia", "Cirugía oral y maxilofacial", "Periodoncia", "Odontopediatría", "Rehabilitación oral", "Estética y diseño de sonrisa", "Ortopedia maxilar", "Odontología general"];
export const BARRIOS = ["Centro", "La Enea", "Palermo", "Chipre", "Milán", "Cable", "El Prado", "La Francia", "Versalles", "Alta Suiza", "Villa Pilar", "San Jorge", "Chapinero", "Usaquén", "Cedritos", "Suba", "El Poblado", "Laureles", "Envigado", "Belén"];
