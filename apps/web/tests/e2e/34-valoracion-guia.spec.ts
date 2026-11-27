import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Guía pública de captura (/valoracion/guia): sin sesión, sin datos de paciente, móvil 390 px, sin violaciones graves de accesibilidad ni scroll horizontal.
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

for (const ruta of ["/valoracion/guia", "/valoracion/guia?tipo=DOLOR", "/valoracion/guia?tipo=ORTODONCIA", "/valoracion/guia?tipo=inventado"]) {
  test(`${ruta}: sin sesión, sin datos de paciente, axe 0 graves y sin scroll horizontal`, async ({ page }) => {
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) errores.push(`CSP: ${m.text()}`); });
    const r = await page.goto(ruta);
    expect(r?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Guía para tus fotos y video", level: 1 })).toBeVisible();
    await expect(page.getByText("Luz natural de frente").first()).toBeVisible();
    await expect(page.getByText("Celular a 30-40 cm, a la altura de la boca")).toBeVisible();
    await expect(page.getByText("Fondo liso")).toBeVisible();
    await expect(page.getByText("Pide ayuda").first()).toBeVisible();
    await expect(page.getByText("Lente limpio y labios separados")).toBeVisible();
    await expect(page.getByText("Celular en vertical, de frente")).toBeVisible(); // guía del video
    await expect(page.getByRole("list", { name: "Ejemplos de fotos que hay que repetir" }).first()).toBeVisible();
    for (const t of ["Oscura", "Cortada", "Borrosa"]) await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    // Sin datos de paciente ni de centro: ni código, ni formulario, ni cookie de valoración.
    await expect(page.getByLabel("Código de acceso")).toHaveCount(0);
    await expect(page.getByText(/Hola,/)).toHaveCount(0);
    expect((await page.context().cookies()).some((c) => c.name === "dv_valoracion")).toBe(false);
    if (ruta.includes("DOLOR")) {
      await expect(page.getByRole("heading", { name: "Zona que te duele" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Perfil derecho" })).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const graves = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(graves.map((v) => `${v.id}: ${v.nodes.length}`), "violaciones axe graves").toEqual([]);
    expect(errores, "errores JS/CSP").toEqual([]);
  });
}
