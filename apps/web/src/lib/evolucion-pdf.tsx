// PDF de la historia clínica por folios (membrete del centro, firma, hash y adendas, marca de agua "COPIA"). Solo servidor.
// El original es el registro digital firmado en el sistema; todo PDF exportado es una copia.
import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

export type FolioPdf = {
  folio: number; fecha: string; profesional: string; tarjeta: string | null; especialidad: string | null; orden: string | null;
  campos: { titulo: string; texto: string }[]; hashCorto: string; integra: boolean;
  adendas: { texto: string; firmante: string; tarjeta: string | null; fecha: string; hashCorto: string }[];
};
export type DatosHistoriaPdf = {
  membrete: { nombre: string; direccion?: string | null; telefono?: string | null; correo?: string | null; registro?: string | null; logo?: string | null };
  paciente: { nombre: string; documento: string };
  titulo: string; colorPrimario: string | null; folios: FolioPdf[]; exportadoEn: string; exportadoPor: string;
};

const s = StyleSheet.create({
  pagina: { padding: 40, paddingBottom: 64, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  cabecera: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 10, marginBottom: 10 },
  logo: { width: 52, height: 52, objectFit: "contain" },
  centro: { fontSize: 15, fontWeight: "bold" },
  muted: { color: "#555", fontSize: 9 },
  titulo: { fontSize: 13, fontWeight: "bold", marginBottom: 6, textAlign: "center" },
  caja: { borderWidth: 1, borderColor: "#bbb", padding: 8, marginBottom: 10 },
  folio: { marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#888" },
  folioTitulo: { fontSize: 11, fontWeight: "bold" },
  seccion: { fontSize: 9, fontWeight: "bold", marginTop: 5, color: "#444" },
  firma: { marginTop: 6, fontSize: 8, color: "#444" },
  adenda: { marginTop: 6, marginLeft: 12, paddingLeft: 6, borderLeftWidth: 1, borderLeftColor: "#999" },
  marca: { position: "absolute", top: 330, left: 60, fontSize: 110, color: "#000", opacity: 0.06, transform: "rotate(-35deg)", fontWeight: "bold" },
  pie: { position: "absolute", bottom: 24, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: "#999", paddingTop: 6, fontSize: 8, color: "#555" },
  pieFila: { flexDirection: "row", justifyContent: "space-between" },
});

function Historia({ d, conLogo }: { d: DatosHistoriaPdf; conLogo: boolean }) {
  const m = d.membrete;
  const color = d.colorPrimario ?? "#1a1a1a";
  return (
    <Document title={`${d.titulo} ${d.paciente.nombre}`} author={m.nombre}>
      <Page size="A4" style={s.pagina}>
        <Text style={s.marca} fixed>COPIA</Text>
        <View style={[s.cabecera, { borderBottomColor: color, borderBottomWidth: 2 }]}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf, no es <img> */}
          {conLogo && m.logo ? <Image src={m.logo} style={s.logo} /> : null}
          <View>
            <Text style={[s.centro, { color }]}>{m.nombre}</Text>
            <Text style={s.muted}>{[m.direccion, m.telefono, m.correo].filter(Boolean).join(" · ")}</Text>
            {m.registro ? <Text style={s.muted}>Registro: {m.registro}</Text> : null}
          </View>
        </View>
        <Text style={s.titulo}>{d.titulo.toUpperCase()}</Text>
        <View style={s.caja}><Text><Text style={{ fontWeight: "bold" }}>Paciente: </Text>{d.paciente.nombre}   <Text style={{ fontWeight: "bold" }}>Documento: </Text>{d.paciente.documento}</Text></View>
        {d.folios.length === 0 && <Text>No hay evoluciones firmadas.</Text>}
        {d.folios.map((f) => (
          <View key={f.folio} style={s.folio}>
            <View wrap={false}>
              <Text style={[s.folioTitulo, { color }]}>Folio {f.folio}{f.orden ? ` · Orden ${f.orden}` : ""}</Text>
              <Text style={s.muted}>{f.fecha} · {f.profesional}{f.especialidad ? ` · ${f.especialidad}` : ""}{f.tarjeta ? ` · T.P. ${f.tarjeta}` : ""}</Text>
            </View>
            {f.campos.map((c) => (<View key={c.titulo}><Text style={s.seccion}>{c.titulo}</Text><Text>{c.texto}</Text></View>))}
            <Text style={s.firma}>Firmado electrónicamente por {f.profesional}{f.tarjeta ? ` (T.P. ${f.tarjeta})` : ""} el {f.fecha} · Hash SHA-256 {f.hashCorto}… · {f.integra ? "Integridad verificada" : "INTEGRIDAD NO VERIFICADA"}</Text>
            {f.adendas.map((a, i) => (
              <View key={i} style={s.adenda} wrap={false}>
                <Text style={s.seccion}>Adenda · {a.firmante}{a.tarjeta ? ` · T.P. ${a.tarjeta}` : ""} · {a.fecha}</Text>
                <Text>{a.texto}</Text>
                <Text style={s.firma}>Hash {a.hashCorto}…</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={s.pie} fixed>
          <View style={s.pieFila}>
            <Text style={{ flex: 1, paddingRight: 8 }}>COPIA de la historia clínica; el original es el registro digital firmado. Documento reservado: su difusión requiere autorización del titular. Exportado el {d.exportadoEn} por {d.exportadoPor}.</Text>
            <Text style={{ width: 70, textAlign: "right" }} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Un logotipo corrupto nunca impide exportar: se reintenta sin él. */
export async function generarPdfHistoria(d: DatosHistoriaPdf): Promise<Buffer> {
  try {
    return await renderToBuffer(<Historia d={d} conLogo />);
  } catch (e) {
    if (!d.membrete.logo) throw e;
    return await renderToBuffer(<Historia d={d} conLogo={false} />);
  }
}
