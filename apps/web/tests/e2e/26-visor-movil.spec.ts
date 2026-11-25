import { type Browser, type BrowserContext, type Page, devices, expect, test } from "@playwright/test";
import { authFile, CBCT_UID } from "./helpers";

// Visor OHIF usable en teléfono y tableta (parche viewer/patches/0001-dent-view-es.patch, ver docs/visor-i18n-fork.md "Móvil").
// Corre en el proyecto `chrome`; cada caso crea su propio contexto con el dispositivo emulado.
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";
const VISOR = `/visor/viewer?StudyInstanceUIDs=${CBCT_UID}`;

// defaultBrowserType no es opción de contexto: se descarta de los perfiles de dispositivo.
const perfil = (nombre: string) => {
  const { defaultBrowserType: _omitido, ...opciones } = devices[nombre];
  return opciones;
};

type Dispositivo = { nombre: string; opciones: Parameters<Browser["newContext"]>[0] };
const MOVILES: Dispositivo[] = [
  { nombre: "360x740", opciones: { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true } },
  { nombre: "iPhone 13 (390)", opciones: perfil("iPhone 13") },
  { nombre: "430x932", opciones: { viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true } },
  { nombre: "Pixel 7", opciones: perfil("Pixel 7") },
  { nombre: "tableta 820x1180", opciones: { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true } },
];

async function abrir(browser: Browser, opciones: Dispositivo["opciones"], ruta = VISOR) {
  const context = await browser.newContext({ ...opciones, baseURL: BASE, storageState: authFile("admin") });
  const page = await context.newPage();
  await page.goto(ruta);
  await page.waitForSelector("canvas", { timeout: 40_000 });
  await page.waitForTimeout(3_000); // deja asentar el layout y la primera imagen
  return { context, page };
}

const medidas = (page: Page) =>
  page.evaluate(() => {
    const w = window.innerWidth;
    const ancho = (s: string) => document.querySelector(s)?.getBoundingClientRect().width ?? 0;
    const botones = [...document.querySelectorAll("button")]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.top < 52 && r.width > 0 && r.right > 0 && r.left < w;
      })
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { id: b.getAttribute("data-cy") ?? "", w: r.width, h: r.height };
      });
    const logo = document.querySelector('[data-cy="return-to-work-list"]')!.getBoundingClientRect();
    const barra = document.querySelector('[data-cy="return-to-work-list"]')!.parentElement!.parentElement!;
    const centro = barra.children[2].getBoundingClientRect();
    return {
      w,
      scrollW: document.documentElement.scrollWidth,
      imagen: ancho('[data-cy="viewport-pane"]'),
      izq: ancho("#viewerLayoutResizableLeftPanel"),
      der: ancho("#viewerLayoutResizableRightPanel"),
      botones,
      logoDerecha: logo.right,
      centroIzquierda: centro.left,
    };
  });

const corte = (page: Page) =>
  page.evaluate(() => (window as any).cornerstone.getRenderingEngines()[0].getViewports()[0].getCurrentImageIdIndex() as number);

/** Arrastre táctil real por CDP (page.touchscreen solo sabe tocar). */
async function arrastrar(context: BrowserContext, page: Page, desde: [number, number][], hasta: [number, number][]) {
  const cdp = await context.newCDPSession(page);
  const pts = (a: [number, number][]) => a.map(([x, y], id) => ({ x, y, id }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(desde) });
  for (let s = 1; s <= 10; s++) {
    const p = desde.map(([x, y], i) => [x + ((hasta[i][0] - x) * s) / 10, y + ((hasta[i][1] - y) * s) / 10] as [number, number]);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(p) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(600);
}

test.describe("visor móvil y tableta", () => {
  test.setTimeout(120_000);

  for (const d of MOVILES) {
    test(`${d.nombre}: imagen amplia, paneles cerrados, sin scroll horizontal y barra táctil`, async ({ browser }) => {
      const { context, page } = await abrir(browser, d.opciones);
      const m = await medidas(page);
      expect(m.scrollW, "sin scroll horizontal de la página").toBeLessThanOrEqual(m.w);
      expect(m.imagen / m.w, "el área de imagen ocupa >= 60 % del ancho").toBeGreaterThanOrEqual(0.6);
      expect(m.izq, "panel izquierdo cerrado al inicio").toBeLessThan(60);
      expect(m.der, "panel derecho cerrado al inicio").toBeLessThan(60);
      expect(m.logoDerecha, "la barra de herramientas no se superpone al logo").toBeLessThanOrEqual(m.centroIzquierda + 1);
      expect(m.botones.length).toBeGreaterThan(3);
      // Las flechas de los botones desplegables (20 px) son la única excepción de ancho.
      for (const b of m.botones) {
        expect(b.h, `alto de ${b.id}`).toBeGreaterThanOrEqual(40);
        if (b.w > 24) expect(b.w, `ancho de ${b.id}`).toBeGreaterThanOrEqual(40);
      }
      await context.close();
    });
  }

  test("los paneles abren superpuestos sin aplastar la imagen y cierran", async ({ browser }) => {
    const { context, page } = await abrir(browser, MOVILES[1].opciones);
    const antes = await medidas(page);
    for (const lado of ["left", "right"] as const) {
      await page.locator(`[data-cy="side-panel-header-${lado}"]`).tap();
      await expect.poll(() => page.evaluate((l) => document.querySelector(`#viewerLayoutResizable${l === "left" ? "Left" : "Right"}Panel`)!.getBoundingClientRect().width, lado)).toBeGreaterThan(200);
      const abierto = await medidas(page);
      expect(abierto.imagen, `imagen intacta con el panel ${lado} abierto`).toBeGreaterThanOrEqual(antes.imagen - 2);
      expect(abierto.scrollW).toBeLessThanOrEqual(abierto.w);
      await page.locator(`[data-cy="side-panel-header-${lado}"]`).tap();
      await expect.poll(() => page.evaluate((l) => document.querySelector(`#viewerLayoutResizable${l === "left" ? "Left" : "Right"}Panel`)!.getBoundingClientRect().width, lado)).toBeLessThan(60);
    }
    await context.close();
  });

  test("miniaturas livianas: /rendered responde 200 con el control de acceso", async ({ browser }) => {
    const { context, page } = await abrir(browser, MOVILES[1].opciones);
    const respuesta = page.waitForResponse((r) => r.url().includes("/rendered"));
    await page.locator('[data-cy="side-panel-header-left"]').tap();
    const r = await respuesta;
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("image/jpeg");
    await context.close();
  });

  test("un dedo pasa cortes y dos dedos hacen zoom/pan", async ({ browser }) => {
    const { context, page } = await abrir(browser, MOVILES[1].opciones);
    const camara = () =>
      page.evaluate(() => {
        const c = (window as any).cornerstone.getRenderingEngines()[0].getViewports()[0].getCamera();
        return { escala: c.parallelScale as number, foco: c.focalPoint.slice(0, 2) as number[] };
      });
    const i0 = await corte(page);
    await arrastrar(context, page, [[195, 300]], [[195, 500]]);
    expect(await corte(page), "un dedo cambia de corte").not.toBe(i0);
    const c0 = await camara();
    await arrastrar(context, page, [[150, 400], [250, 400]], [[90, 400], [310, 400]]);
    expect((await camara()).escala, "pellizco = zoom").toBeLessThan(c0.escala);
    const c1 = await camara();
    await arrastrar(context, page, [[150, 400], [250, 400]], [[150, 300], [250, 300]]);
    expect((await camara()).foco, "dos dedos desplazan = pan").not.toEqual(c1.foco);
    await context.close();
  });

  test("el botón de volver regresa a dent-view", async ({ browser }) => {
    const { context, page } = await abrir(browser, MOVILES[1].opciones);
    const volver = page.getByRole("link", { name: "Volver a dent-view" });
    await expect(volver).toBeVisible();
    expect((await volver.boundingBox())!.width).toBeGreaterThanOrEqual(40);
    await volver.tap();
    await page.waitForURL("**/estudios**");
    await context.close();
  });

  test("escritorio 1440: sin regresiones (panel de series abierto, logo completo, mouse = ventana/nivel)", async ({ browser }) => {
    const { context, page } = await abrir(browser, { viewport: { width: 1440, height: 900 } });
    const m = await medidas(page);
    expect(m.scrollW).toBeLessThanOrEqual(m.w);
    expect(m.izq).toBeGreaterThan(200);
    await expect(page.getByText("dent-view", { exact: true })).toBeVisible();
    await expect(page.getByText("Volver", { exact: true })).toBeVisible();
    const vr = () =>
      page.evaluate(() => JSON.stringify((window as any).cornerstone.getRenderingEngines()[0].getViewports()[0].getProperties().voiRange));
    const antes = await vr();
    const caja = (await page.locator('[data-cy="viewport-pane"]').boundingBox())!;
    await page.mouse.move(caja.x + caja.width / 2, caja.y + 200);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width / 2 + 80, caja.y + 260, { steps: 8 });
    await page.mouse.up();
    expect(await vr(), "el arrastre con mouse sigue cambiando ventana/nivel").not.toBe(antes);
    await context.close();
  });
});
