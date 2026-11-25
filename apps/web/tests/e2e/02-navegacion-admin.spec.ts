import { expect, test } from "@playwright/test";
import { authFile, sinErrorDeApp } from "./helpers";

test.use({ storageState: authFile("admin") });

// Rutas del menú lateral del admin (app-sidebar.tsx) + subrutas de listado. radex-demo es CENTRO_RADIOLOGICO: /laboratorio no existe para ese tipo (404, ver 15-tipos-centro).
const RUTAS: [string, string][] = [
  ["/inicio", "Buen"], ["/pacientes", "Pacientes"], ["/ordenes", "Órdenes"], ["/agenda", "Agenda"],
  ["/estudios", "Estudios"], ["/cargar", "Cargar"], ["/informes", "Informes"], ["/seguimiento", "Seguimiento"],
  ["/doctores", "Doctores"], ["/seguimiento-doctores", "Seguimiento"], ["/facturacion", "Facturación"],
  ["/cartera", "Cartera"], ["/reportes", "Reportes"], ["/catalogo", "Catálogo"], ["/usuarios", "Usuarios"],
  ["/ajustes", "Salas"], ["/notificaciones", "Notificaciones"], ["/proteccion-datos", "Protección"],
  ["/convenios", "Convenios"], ["/ingesta", "ingesta"], ["/integraciones", "Integraciones"], ["/integraciones/api", "Integraciones"], ["/integraciones/webhooks", "Integraciones"], ["/integraciones/conectores", "Integraciones"], ["/integraciones/pasarelas", "Integraciones"], ["/perfil", "perfil"], ["/ordenes/nueva", "Nueva orden"], ["/facturacion/nueva", "cobro"],
];

for (const [ruta, titulo] of RUTAS) {
  test(`admin abre ${ruta} sin errores`, async ({ page }) => {
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) errores.push(`CSP: ${m.text()}`); });
    const r = await page.goto(ruta);
    expect(r?.status()).toBe(200);
    await sinErrorDeApp(page);
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(new RegExp(titulo, "i"));
    expect(errores, "errores JS no capturados").toEqual([]);
  });
}

test("los enlaces del menú lateral coinciden con las rutas probadas", async ({ page }) => {
  await page.goto("/inicio");
  const hrefs = await page.locator("[data-sidebar='menu'] a[href^='/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const probadas = RUTAS.map(([r]) => r);
  for (const h of hrefs) expect(probadas, `ruta del menú sin test: ${h}`).toContain(h);
});

test("<main> no está anidado (a11y)", async ({ page }) => {
  await page.goto("/inicio");
  await expect(page.locator("main main")).toHaveCount(0);
});
