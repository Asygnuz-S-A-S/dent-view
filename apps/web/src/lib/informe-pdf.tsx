// Implementación independiente (sala limpia) a partir de docs/sala-limpia/01-documentos-e-informes.md
// PDF del informe radiológico con membrete del centro. Solo servidor.
import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

export type DatosPdf = {
  membrete: { nombre: string; direccion?: string | null; telefono?: string | null; correo?: string | null; registro?: string | null; logo?: string | null };
  paciente: { nombre: string; documento: string; nacimiento: string; edad: number | null };
  orden: string | null;
  remitente: string | null;
  estudioFecha: string | null;
  motivo: string | null;
  tecnica: string | null;
  hallazgos: string;
  impresion: string;
  recomendaciones: string | null;
  alertas: string[];
  firmante: { nombre: string; tarjeta: string | null };
  emitidoEn: string;
  version: number;
  codigo: string;
  urlVerificacion: string;
};

const s = StyleSheet.create({
  pagina: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  cabecera: { flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "#444", paddingBottom: 10, marginBottom: 14 },
  logo: { width: 56, height: 56, objectFit: "contain" },
  centro: { fontSize: 15, fontWeight: "bold" },
  muted: { color: "#555", fontSize: 9 },
  titulo: { fontSize: 13, fontWeight: "bold", marginBottom: 8, textAlign: "center" },
  caja: { borderWidth: 1, borderColor: "#bbb", padding: 8, marginBottom: 10, flexDirection: "row", flexWrap: "wrap" },
  celda: { width: "50%", marginBottom: 3 },
  etiqueta: { fontWeight: "bold" },
  seccion: { fontSize: 11, fontWeight: "bold", marginTop: 8, marginBottom: 3 },
  firma: { marginTop: 36, width: 220, borderTopWidth: 1, borderTopColor: "#222", paddingTop: 4 },
  pie: { position: "absolute", bottom: 24, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: "#999", paddingTop: 6, fontSize: 8, color: "#555" },
});

const Campo = ({ k, v }: { k: string; v: string | null }) => (v ? <Text style={s.celda}><Text style={s.etiqueta}>{k}: </Text>{v}</Text> : null);
const Bloque = ({ titulo, texto }: { titulo: string; texto: string | null }) =>
  texto ? (<View wrap><Text style={s.seccion}>{titulo}</Text><Text>{texto}</Text></View>) : null;

function Informe({ d, conLogo }: { d: DatosPdf; conLogo: boolean }) {
  const m = d.membrete;
  return (
    <Document title={`Informe radiológico ${d.paciente.nombre}`} author={m.nombre}>
      <Page size="A4" style={s.pagina}>
        <View style={s.cabecera}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf, no es <img> */}
          {conLogo && m.logo ? <Image src={m.logo} style={s.logo} /> : null}
          <View>
            <Text style={s.centro}>{m.nombre}</Text>
            <Text style={s.muted}>{[m.direccion, m.telefono, m.correo].filter(Boolean).join(" · ")}</Text>
            {m.registro ? <Text style={s.muted}>Registro: {m.registro}</Text> : null}
          </View>
        </View>
        <Text style={s.titulo}>INFORME RADIOLÓGICO{d.version > 1 ? ` (versión ${d.version})` : ""}</Text>
        <View style={s.caja}>
          <Campo k="Paciente" v={d.paciente.nombre} />
          <Campo k="Documento" v={d.paciente.documento} />
          <Campo k="Nacimiento" v={`${d.paciente.nacimiento}${d.paciente.edad !== null ? ` (${d.paciente.edad} años)` : ""}`} />
          <Campo k="Orden" v={d.orden} />
          <Campo k="Doctor remitente" v={d.remitente} />
          <Campo k="Fecha del estudio" v={d.estudioFecha} />
        </View>
        <Bloque titulo="Motivo de la remisión" texto={d.motivo} />
        <Bloque titulo="Técnica / estudio" texto={d.tecnica} />
        {d.alertas.length > 0 ? <Bloque titulo="Condiciones del paciente relevantes" texto={d.alertas.join("; ")} /> : null}
        <Bloque titulo="Hallazgos" texto={d.hallazgos} />
        <Bloque titulo="Impresión diagnóstica" texto={d.impresion} />
        <Bloque titulo="Recomendaciones" texto={d.recomendaciones} />
        <View style={s.firma} wrap={false}>
          <Text style={s.etiqueta}>{d.firmante.nombre}</Text>
          <Text style={s.muted}>{d.firmante.tarjeta ? `T.P. ${d.firmante.tarjeta}` : "Especialista informante"}</Text>
          <Text style={s.muted}>Firmado electrónicamente el {d.emitidoEn}</Text>
        </View>
        <View style={s.pie} fixed>
          <Text>Código de verificación: {d.codigo} · Verifique en {d.urlVerificacion}</Text>
          <Text>{m.nombre}. Documento clínico reservado; su difusión requiere autorización del titular.</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Compone el PDF completo. Un logotipo corrupto nunca impide emitir: se reintenta sin él. */
export async function generarPdfInforme(d: DatosPdf): Promise<Buffer> {
  try {
    return await renderToBuffer(<Informe d={d} conLogo />);
  } catch (e) {
    if (!d.membrete.logo) throw e;
    return await renderToBuffer(<Informe d={d} conLogo={false} />);
  }
}
