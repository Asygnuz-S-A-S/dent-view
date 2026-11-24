import { describe, expect, it } from "vitest";
import { contraste } from "../marca";
import { PLANTILLAS_DEFECTO, renderPlantilla, TIPOS_MENSAJE, TONO_FORMAL_PROHIBIDO } from "../notificaciones";
import { correoEnlaceClave, vistaMensaje } from "./vistas";
import { decodificarLogo, MARCA_PLATAFORMA, renderCorreo, urlSegura, type Marca } from "./plantilla";

const marca: Marca = { nombre: "Radex", color: "#c2410c", direccion: "Cra 7", telefono: "601", correo: "c@radex.co" };
const PNG = "data:image/png;base64," + Buffer.from("png-falso").toString("base64");

describe("renderCorreo", () => {
  it("escapa nombre de centro, cuerpo y vista", () => {
    const r = renderCorreo({ asunto: "<x>", cuerpo: "Hola <script>alert(1)</script>", marca: { ...marca, nombre: '<img src=x onerror=1>"' }, vista: { titulo: "<b>t</b>", aviso: "<i>a</i>" } });
    expect(r.html).not.toMatch(/<script|<img src=x|<b>t|<i>a/);
    expect(r.html).toContain("&lt;script&gt;");
  });

  it("un color inválido (incluso intento de inyectar CSS) cae al de la plataforma", () => {
    const r = renderCorreo({ asunto: "a", cuerpo: "b", marca: { ...marca, color: "red;}</style><script>x</script>" } });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain(`bgcolor="${MARCA_PLATAFORMA.color}"`);
  });

  it("el texto del botón cumple AA sobre el color de la marca, también con colores claros", () => {
    for (const color of ["#c2410c", "#ffeb3b", "#0e6b8a", "#ffffff"]) {
      const r = renderCorreo({ asunto: "a", cuerpo: "b", marca: { ...marca, color }, vista: { boton: { texto: "Ir", url: "https://x.co/a" } } });
      const texto = /color:(#[0-9a-f]{6});text-decoration:none/.exec(r.html)![1]!;
      expect(contraste(color, texto)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("botón + enlace en claro + texto plano; la URL deja de repetirse en el párrafo", () => {
    const url = "https://dentview.test/resultados/tok";
    const cuerpo = renderPlantilla(PLANTILLAS_DEFECTO.ESTUDIO_ENLACE.cuerpo, { destinatario: "Ana", centro: "Radex", enlace: url, vence: "hoy" });
    const r = renderCorreo({ asunto: "s", cuerpo, marca, vista: vistaMensaje("ESTUDIO_ENLACE", cuerpo) });
    expect(r.html).toContain(`href="${url}"`);
    expect(r.html.split(url).length - 1).toBe(3); // href botón, href y texto del enlace en claro
    expect(r.html).not.toContain("Ábralo");
    expect(r.texto).toContain(url);
    expect(r.texto).toContain("Ley 1581");
    expect(r.html).toContain("prefers-color-scheme:dark");
  });

  it("no hace botón con URLs no http(s)", () => {
    expect(urlSegura("javascript:alert(1)")).toBe(false);
    const r = renderCorreo({ asunto: "a", cuerpo: "b", vista: { boton: { texto: "x", url: "javascript:alert(1)" } } });
    expect(r.html).not.toContain("javascript:");
  });

  it("logo: solo png/jpeg/webp acotado; sin logo muestra el nombre", () => {
    expect(decodificarLogo(PNG)?.contentType).toBe("image/png");
    expect(decodificarLogo("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(decodificarLogo("data:image/png;base64," + "A".repeat(500_000))).toBeNull();
    const con = renderCorreo({ asunto: "a", cuerpo: "b", marca: { ...marca, logo: decodificarLogo(PNG) } });
    expect(con.logo?.cid).toBeTruthy();
    expect(con.html).toContain("cid:" + con.logo!.cid);
    const sin = renderCorreo({ asunto: "a", cuerpo: "b", marca });
    expect(sin.logo).toBeNull();
    expect(sin.html).not.toContain("cid:");
  });

  it("el código solo aparece destacado en los mensajes de código", () => {
    expect(vistaMensaje("ESTUDIO_CODIGO", "x", "123456").destacado).toBe("123456");
    expect(vistaMensaje("ESTUDIO_ENLACE", "x https://a.co").destacado).toBeUndefined();
  });

  it("correo de clave: bienvenida vs recuperación, con aviso de seguridad", () => {
    const rec = correoEnlaceClave({ name: "Ana", email: "a@a.co" }, "https://x.co/r");
    expect(rec.vista.aviso).toMatch(/no solicitaste/i);
    expect(correoEnlaceClave({ name: "Ana", email: "a@a.co", debeCambiarClave: true }, "https://x.co/r").vista.titulo).toBe("Activa tu cuenta");
  });
});

describe("tono de las vistas de correo", () => {
  it("títulos, avisos y correo de clave tutean", () => {
    const textos: string[] = [];
    for (const t of TIPOS_MENSAJE) { const v = vistaMensaje(t, "x https://a.co/b"); textos.push(v.titulo ?? "", v.aviso ?? "", v.boton?.texto ?? ""); }
    for (const debeCambiarClave of [true, false]) {
      const c = correoEnlaceClave({ name: "Ana", email: "a@x.co", debeCambiarClave }, "https://a.co/b");
      textos.push(c.asunto, c.cuerpo, c.vista.titulo ?? "", c.vista.aviso ?? "", c.vista.preheader ?? "");
    }
    for (const t of textos) expect(t.match(TONO_FORMAL_PROHIBIDO), t).toBeNull();
  });
});
