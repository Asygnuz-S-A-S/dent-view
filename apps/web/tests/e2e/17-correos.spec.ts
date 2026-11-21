import { expect, test } from "@playwright/test";
import { ROLES } from "./helpers";

const MAILPIT = "http://127.0.0.1:8025/api/v1";
// El enlace del correo apunta a BETTER_AUTH_URL (https local con certificado propio).
test.use({ ignoreHTTPSErrors: true });

test("restablecer contraseña: correo con la marca del centro, texto alterno y enlace funcional", async ({ request, baseURL }) => {
  test.setTimeout(60_000);
  const desde = Date.now() - 2000;
  const r = await request.post("/api/auth/request-password-reset", {
    headers: { Origin: baseURL! }, data: { email: ROLES.admin, redirectTo: "/recuperar/nueva" },
  });
  expect(r.ok()).toBeTruthy();

  let id = "";
  await expect.poll(async () => {
    const lista = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${ROLES.admin} subject:"Recupera"`)}`)).json();
    const m = (lista.messages as { ID: string; Created: string }[]).find((x) => new Date(x.Created).getTime() >= desde);
    id = m?.ID ?? "";
    return !!id;
  }, { timeout: 30_000 }).toBe(true);

  const m = await (await request.get(`${MAILPIT}/message/${id}`)).json();
  // El remitente visible es el centro (no la plataforma) y el HTML lleva su nombre y color.
  expect(m.From.Name).toBeTruthy();
  expect(m.From.Address).toMatch(/@/);
  expect(m.HTML).toContain(m.From.Name);
  expect(m.HTML).toMatch(/bgcolor="#[0-9a-f]{6}"/);
  expect(m.HTML).toContain("prefers-color-scheme:dark");
  expect(m.HTML).toContain("Ley 1581");
  // Texto alterno con el enlace.
  expect(m.Text).toContain("Ley 1581");
  const enlace = /https?:\/\/\S+/.exec(m.Text)?.[0];
  expect(enlace).toBeTruthy();
  expect(m.HTML).toContain(`href="${enlace!.replace(/&/g, "&amp;")}"`);
  // El enlace del correo lleva a la pantalla de nueva contraseña con token (sin consumirlo).
  const t = await request.get(enlace!, { maxRedirects: 0 });
  expect([301, 302, 303, 307, 308]).toContain(t.status());
  expect(t.headers()["location"]).toContain("/recuperar/nueva");
  expect(t.headers()["location"]).toContain("token=");
});
