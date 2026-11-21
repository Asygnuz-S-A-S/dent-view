// Vista previa de los correos: genera un HTML por plantilla y marca (2 centros + plataforma) con datos ficticios.
// Uso: npm run correo:preview -w @dent-view/web -- [carpeta]   (por defecto ./correo-preview)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { renderCorreo, type Marca } from "../src/lib/correo/plantilla";
import { MARCA_PLATAFORMA } from "../src/lib/correo/plantilla";
import { correoEnlaceClave, vistaMensaje } from "../src/lib/correo/vistas";
import { PLANTILLAS_DEFECTO, renderPlantilla, TIPOS_MENSAJE } from "../src/lib/notificaciones";

const salida = path.resolve(process.argv[2] ?? "correo-preview");
fs.mkdirSync(salida, { recursive: true });

const logo = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="88"><rect width="88" height="88" rx="18" fill="#c2410c"/><text x="44" y="60" font-size="48" font-family="Arial" font-weight="700" text-anchor="middle" fill="#fff">R</text><text x="104" y="58" font-size="40" font-family="Arial" font-weight="700" fill="#7c2d12">Radex</text></svg>`)).png().toBuffer();
const marcas: Record<string, Marca> = {
  radex: { nombre: "Radex Imágenes", color: "#c2410c", logo: { contentType: "image/png", datos: logo }, direccion: "Cra 7 # 71-21, Bogotá", telefono: "601 555 0101", correo: "contacto@radex.demo" },
  pepito: { nombre: "Clínica <b>Pepito</b> & Cía", color: "#1d4ed8", direccion: "Calle 10 # 5-20, Medellín", telefono: "604 555 0202" },
  plataforma: MARCA_PLATAFORMA,
};
const vars = { centro: "Radex Imágenes", paciente: "Paciente Demo", destinatario: "Dr. Demo", medico: "Dr. Demo", fecha: "5 de diciembre", hora: "10:30", direccion: "Cra 7 # 71-21", telefono: "601 555 0101", orden: "OR-1042", enlace: "https://dentview.asygnuz.com/resultados/abc123def456ghi789", codigo: "482915", vence: "20 de diciembre de 2026", motivo: "limpieza", mes: "enero" };

for (const [clave, marca] of Object.entries(marcas)) {
  const casos: [string, string, string, ReturnType<typeof vistaMensaje>][] = TIPOS_MENSAJE.map((t) => {
    const p = PLANTILLAS_DEFECTO[t];
    const cuerpo = renderPlantilla(p.cuerpo, vars);
    return [t, renderPlantilla(p.asunto, vars), cuerpo, vistaMensaje(t, cuerpo, t.endsWith("CODIGO") ? vars.codigo : null)];
  });
  for (const bienvenida of [false, true]) {
    const c = correoEnlaceClave({ name: "Ana Demo", email: "ana@demo.co", debeCambiarClave: bienvenida }, "https://dentview.asygnuz.com/recuperar/nueva?token=abc123");
    casos.push([bienvenida ? "BIENVENIDA" : "RESTABLECER", c.asunto, c.cuerpo, c.vista]);
  }
  casos.push(["PAGO", "Tienes un pago pendiente", "Hola Paciente Demo, tienes un pago pendiente de $ 250.000 en Radex.\nPuedes pagarlo de forma segura en este enlace: https://pagos.demo/abc\nEl enlace vence el 20/12/2026.", { titulo: "Tienes un pago pendiente", boton: { texto: "Pagar ahora", url: "https://pagos.demo/abc" }, aviso: "Si no esperabas este mensaje, puedes ignorarlo." }]);
  for (const [tipo, asunto, cuerpo, vista] of casos) {
    const r = renderCorreo({ asunto, cuerpo, vista, marca });
    const html = r.logo ? r.html.replace("cid:logo-centro@dent-view", `data:${r.logo.contentType};base64,${r.logo.datos.toString("base64")}`) : r.html;
    fs.writeFileSync(path.join(salida, `${clave}-${tipo}.html`), html);
    fs.writeFileSync(path.join(salida, `${clave}-${tipo}.txt`), r.texto);
  }
}
console.log(`Vista previa en ${salida}`);
