import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { authFile } from "./helpers";
import { sesionQa, sql } from "./qa-usuarios";

// Seguridad: web sin credencial de superusuario, módulos deshabilitados que responden 404 (UI y API), valoraciones sin contenido clínico para recepción,
// tope de cuerpos antes de leerlos, inmutabilidad en BD. Datos propios con sufijo; todo lo que se cambia en la BD se restaura.
test.describe.configure({ mode: "serial" });
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";
const SUFIJO = String(Date.now()).slice(-6);
const MOTIVO = `Dolor de muela secreto ${SUFIJO}`;
const ORG = `(SELECT id FROM "Organization" WHERE slug='radex-demo')`;
const ADMIN = `(SELECT id FROM "User" WHERE email='admin@radex.demo')`;
const NOTA = `NOTA-INTERNA-SECRETA-${SUFIJO}`;
const COMENTARIO = `COMENTARIO-FOTO-SECRETO-${SUFIJO}`;

test.describe("sin sesión de admin: contenedor y base de datos", () => {
  test("web no recibe la credencial del dueño de la base ni las claves de infraestructura", () => {
    const env = execFileSync("docker", ["exec", "dent-view-web-1", "env"], { encoding: "utf8" });
    for (const k of ["MIGRATE_DATABASE_URL", "POSTGRES_PASSWORD", "APP_DB_PASSWORD"]) expect(env, k).not.toMatch(new RegExp(`^${k}=`, "m"));
    expect(env).toMatch(/^DATABASE_URL=postgresql:\/\/dentview_app:/m);
  });

  test("dentview_app: sin UPDATE/DELETE en tablas clínicas inmutables, con UPDATE en Informe (borradores)", () => {
    const priv = (t: string, p: string) => sql(`select has_table_privilege('dentview_app','public."${t}"','${p}');`);
    for (const t of ["NotaClinica", "Autorizacion", "OdontogramaHistorial", "Evento"]) {
      expect(priv(t, "UPDATE"), `${t} UPDATE`).toBe("f");
      expect(priv(t, "DELETE"), `${t} DELETE`).toBe("f");
      expect(priv(t, "INSERT"), `${t} INSERT`).toBe("t");
    }
    expect(priv("Informe", "UPDATE")).toBe("t");
  });

  test("CHECK: una cuenta de cobro no puede quedar con total negativo", () => {
    // ON_ERROR_STOP: sin él psql sale con código 0 aunque el CHECK rechace la fila.
    expect(() => sql(`\\set ON_ERROR_STOP on\nupdate "Factura" set total=-1 where id=(select id from "Factura" limit 1);`)).toThrow();
  });
});

test.describe("B1/B2: centro radiológico (admin@radex.demo)", () => {
  test.use({ storageState: authFile("admin") });
  test("la API de valoraciones responde 404 aunque el rol sea válido, y un x-pathname forjado no abre el módulo", async ({ request }) => {
    expect((await request.get("/api/valoraciones/x/medios/y")).status()).toBe(404);
    expect((await request.get("/valoraciones", { headers: { "x-pathname": "/inicio" } })).status()).toBe(404);
  });
});

test.describe("B6: tope de cuerpo (Caddy rechaza antes de la app)", () => {
  test.use({ storageState: authFile("admin") });
  test("imágenes: más de 150 MB y foto de paciente: más de 6 MB dan 413", async ({ request }) => {
    const r1 = await request.post("/api/imagenes", { data: Buffer.alloc(151 * 1024 * 1024), headers: { "content-type": "application/octet-stream" } });
    expect(r1.status()).toBe(413);
    const r2 = await request.post("/pacientes/inexistente/foto", { data: Buffer.alloc(7 * 1024 * 1024), headers: { "content-type": "application/octet-stream" } });
    expect(r2.status()).toBe(413);
  });
});

test.describe("M5: valoraciones sin contenido clínico para recepción", () => {
  let idVal = "";
  const idAjena = `qa-val-ajena-${SUFIJO}`;
  let tipoOriginal = "";
  test.beforeAll(() => {
    tipoOriginal = sql(`select "tipoCentro" from "ConfigCentro" where "organizationId"=${ORG};`);
    sql(`update "ConfigCentro" set "tipoCentro"='CENTRO_ODONTOLOGICO' where "organizationId"=${ORG};`);
    sql(`update "Member" set "esOdontologo"=false where "userId"=${ADMIN} and "organizationId"=${ORG};`);
    idVal = `qa-val-${SUFIJO}`;
    sql(`insert into "Valoracion"(id,"organizationId",nombre,telefono,motivo,estado,"tokenHash","expiraEn","actualizadoEn","doctorId","plantillaCaptura","angulosPedidos","notasInternas")
         values ('${idVal}',${ORG},'QA Segura ${SUFIJO}','3001112233','${MOTIVO}','RECIBIDA','h-${SUFIJO}',now()+interval '7 days',now(),null,'DOLOR','{ZONA_DOLOR}','${NOTA}');`);
    // Una foto con comentario: recepción puede ver que hay 1 foto, nunca el comentario.
    sql(`insert into "ValoracionMedia"(id,"organizationId","valoracionId",tipo,angulo,"claveS3",mime,bytes,nota)
         values ('qa-med-${SUFIJO}',${ORG},'${idVal}','FOTO','ZONA_DOLOR','tenants/x/valoraciones/${idVal}/m/original.jpg','image/jpeg',10,'${COMENTARIO}');`);
    // Valoración de OTRO centro: una acción con su id no debe poder tocarla.
    sql(`insert into "Valoracion"(id,"organizationId",nombre,motivo,estado,"tokenHash","expiraEn","actualizadoEn","notasInternas")
         values ('${idAjena}',(SELECT id FROM "Organization" WHERE slug='radex-2-demo'),'QA Ajena ${SUFIJO}','otro centro','RECIBIDA','ha-${SUFIJO}',now()+interval '7 days',now(),'ORIGINAL-AJENA');`);
  });
  test.afterAll(() => {
    try {
      sql(`delete from "Valoracion" where id in ('${idVal}','${idAjena}');`);
      sql(`update "Member" set "esOdontologo"=false where "userId"=${ADMIN} and "organizationId"=${ORG};`);
      if (tipoOriginal) sql(`update "ConfigCentro" set "tipoCentro"='${tipoOriginal}' where "organizationId"=${ORG};`);
    } catch { /* sin docker */ }
  });

  test("recepción ve estado y contacto, pero ni motivo, ni cuestionario, ni fotos; la API responde 403", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: await sesionQa(browser, "recepcion", BASE), baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto(`/valoraciones/${idVal}`);
    await expect(page.getByRole("heading", { name: `QA Segura ${SUFIJO}` })).toBeVisible();
    await expect(page.getByText("Contenido clínico")).toBeVisible();
    await expect(page.getByText(MOTIVO)).toHaveCount(0);
    await expect(page.getByText("Motivo y cuestionario")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Fotos" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reenviar enlace" })).toHaveCount(0); // RECIBIDA no espera al paciente
    // M5: solo conteos; ni notas internas, ni comentarios de fotos, ni el nombre de la plantilla de captura.
    await expect(page.getByText("Ha subido 1 foto y 0 videos")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0); // sin Responder / Mensajes / Notas internas
    await expect(page.getByText("Notas internas")).toHaveCount(0);
    const html = await page.content();
    for (const secreto of [NOTA, COMENTARIO, "Dolor / urgencia", "ZONA_DOLOR", "Zona que te duele", "Comentario de esta foto", "Guardar en la ficha"]) expect(html, secreto).not.toContain(secreto);
    // La lista tampoco los filtra.
    await page.goto("/valoraciones?pestana=todas");
    const lista = await page.content();
    for (const secreto of [NOTA, COMENTARIO, "Dolor / urgencia", MOTIVO]) expect(lista, secreto).not.toContain(secreto);
    for (const q of ["", "?v=original", "?v=thumb"]) expect((await ctx.request.get(`/api/valoraciones/${idVal}/medios/cualquiera${q}`)).status(), q).toBe(403);
    await ctx.close();
  });

  test("el admin marcado como odontólogo sí ve el motivo y las notas internas", async ({ browser }) => {
    sql(`update "Member" set "esOdontologo"=true where "userId"=${ADMIN} and "organizationId"=${ORG};`);
    const ctx = await browser.newContext({ storageState: authFile("admin"), baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto(`/valoraciones/${idVal}`);
    await expect(page.getByText(MOTIVO)).toBeVisible();
    await page.getByRole("tab", { name: "Notas internas" }).click();
    await expect(page.getByRole("textbox", { name: "Notas internas" })).toHaveValue(NOTA);
    await ctx.close();
  });

  test("el especialista crea una solicitud (queda asignada a sí mismo, sin elegir odontólogo) y no ve las que no son suyas", async ({ browser }) => {
    const nombre = `QA Espec ${SUFIJO}`;
    const ctx = await browser.newContext({ storageState: await sesionQa(browser, "especialista", BASE), baseURL: BASE });
    const page = await ctx.newPage();
    try {
      await page.goto("/valoraciones/nueva");
      await expect(page.getByLabel("Odontólogo asignado (opcional)")).toHaveCount(0);
      await page.getByLabel("Nombre", { exact: true }).fill(nombre);
      await page.getByLabel("Correo", { exact: true }).fill(`qa-espec-${SUFIJO}@dentview.demo`);
      await page.getByLabel("Motivo de la consulta").fill("Control");
      await page.getByRole("button", { name: "Crear solicitud y generar enlace" }).click();
      await page.getByRole("button", { name: "Listo" }).click();
      await expect(page).toHaveURL(/\/valoraciones\/(?!nueva)[^/]+$/);
      expect(sql(`select "doctorId" from "Valoracion" where nombre='${nombre}';`)).toBe("qa-user-especialista");
      // Las solicitudes sin asignar (como la de idVal) no son suyas: 404.
      expect((await page.goto(`/valoraciones/${idVal}`))?.status()).toBe(404);
    } finally {
      try { sql(`delete from "Valoracion" where nombre='${nombre}'; delete from "Lead" where nombre='${nombre}';`); } catch { /* sin docker */ }
      await ctx.close();
    }
  });

  test("guardar notas con el id de una valoración de otro centro falla y no la modifica", async ({ browser }) => {
    sql(`update "Member" set "esOdontologo"=true where "userId"=${ADMIN} and "organizationId"=${ORG};`);
    const ctx = await browser.newContext({ storageState: authFile("admin"), baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto(`/valoraciones/${idVal}`);
    await page.getByRole("tab", { name: "Notas internas" }).click();
    // La acción de servidor viaja con el id en el cuerpo: se reescribe por el de la valoración ajena, como haría un cliente manipulado.
    let reescrita = false;
    await page.route("**/valoraciones/**", async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"] && req.postData()?.includes(idVal)) { reescrita = true; return route.continue({ postData: req.postData()!.replaceAll(idVal, idAjena) }); }
      return route.continue();
    });
    await page.getByRole("textbox", { name: "Notas internas" }).fill("INTENTO-CRUZADO");
    await page.getByRole("button", { name: "Guardar notas" }).click();
    await expect(page.getByText("No tienes permiso para escribir notas internas.")).toBeVisible();
    expect(reescrita).toBe(true);
    expect(sql(`select "notasInternas" from "Valoracion" where id='${idAjena}';`)).toBe("ORIGINAL-AJENA");
    expect(sql(`select "notasInternas" from "Valoracion" where id='${idVal}';`)).toBe(NOTA);
    await ctx.close();
  });

  test("comentar una foto con el id de una valoración de otro centro falla y no modifica el comentario", async ({ browser }) => {
    sql(`update "Member" set "esOdontologo"=true where "userId"=${ADMIN} and "organizationId"=${ORG};`);
    const ctx = await browser.newContext({ storageState: authFile("admin"), baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto(`/valoraciones/${idVal}`);
    await page.getByRole("button", { name: "Ampliar: Zona que te duele" }).click();
    await expect(page.getByLabel("Comentario de esta foto")).toHaveValue(COMENTARIO);
    let reescrita = false;
    await page.route("**/valoraciones/**", async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"] && req.postData()?.includes(idVal)) { reescrita = true; return route.continue({ postData: req.postData()!.replaceAll(idVal, idAjena) }); }
      return route.continue();
    });
    await page.getByLabel("Comentario de esta foto").fill("INTENTO-CRUZADO-FOTO");
    await page.getByRole("button", { name: "Guardar comentario" }).click();
    await expect(page.getByText("No tienes permiso para comentar fotos.")).toBeVisible();
    expect(reescrita).toBe(true);
    expect(sql(`select nota from "ValoracionMedia" where id='qa-med-${SUFIJO}';`)).toBe(COMENTARIO);
    await ctx.close();
  });
});
