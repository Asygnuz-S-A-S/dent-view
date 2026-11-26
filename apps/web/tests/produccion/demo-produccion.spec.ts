import { expect, test, request as pwRequest, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { anotar, authFile, foto, MALOS, PAGINA_ERROR, URL_PROD, vigilar, type Usuario } from "./demo-helpers";

// Validacion de SOLO LECTURA de la demo en produccion. Las sesiones vienen del proyecto "setup".
// Unica escritura incidental: la descarga del zip DICOM registra el evento de auditoria "estudio.descargado".

const cop = (s: string) => Number(s.replace(/[^\d]/g, ""));
const ctxDe = (b: Browser, u: Usuario, o: Parameters<Browser["newContext"]>[0] = {}) => b.newContext({ baseURL: URL_PROD, storageState: authFile(u), viewport: { width: 1440, height: 900 }, ...o });
const apiDe = (u: Usuario) => pwRequest.newContext({ baseURL: URL_PROD, storageState: authFile(u) });
const listo = async (p: Page) => { await expect(p.getByRole("heading", { level: 1 }).first()).toBeVisible(); await p.waitForLoadState("networkidle").catch(() => undefined); };
const timing = (p: Page) => p.evaluate(() => { const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming; return { ttfb: Math.round(n.responseStart - n.startTime), carga: Math.round(n.loadEventEnd - n.startTime) }; });
const exceso = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function menu(p: Page): Promise<{ href: string; label: string }[]> {
  await p.goto("/inicio"); await listo(p);
  return p.locator('[data-sidebar="menu-button"][href]').evaluateAll((els) => els.map((e) => ({ href: e.getAttribute("href")!, label: (e.textContent ?? "").trim() })));
}

// ================= 1) Login y menu por rol =================
const SOLO_RADIO = ["Seguimiento de doctores"];
const ODONTO = ["CRM", "Valoraciones virtuales", "Laboratorio"];
const SIN_LAB = ["Agenda", "Estudios", "Cargar estudios", "Informes", "CRM", "Valoraciones virtuales", "Remisiones"];
const ESPERADO: Record<Usuario, { con: string[]; sin: string[] }> = {
  LUMIA_ADMIN: { con: [...SOLO_RADIO, "Reportes", "Cartera", "Usuarios del centro", "Convenios y tarifas"], sin: ODONTO },
  LUMIA_RECEPCION: { con: [...SOLO_RADIO, "Cartera", "Facturación"], sin: [...ODONTO, "Reportes", "Usuarios del centro"] },
  LUMIA_RADIOLOGO: { con: ["Informes", "Estudios", "Agenda"], sin: [...ODONTO, ...SOLO_RADIO, "Cartera", "Reportes", "Usuarios del centro"] },
  LUMIA_DOCTOR: { con: ["Inicio", "Pacientes", "Órdenes", "Estudios", "Informes"], sin: [...ODONTO, ...SOLO_RADIO, "Doctores remitentes", "Agenda", "Cartera", "Reportes", "Usuarios del centro", "Facturación"] },
  RADIA_ADMIN: { con: [...SOLO_RADIO, "Reportes", "Cartera", "Usuarios del centro"], sin: ODONTO },
  RADIA_RECEPCION: { con: [...SOLO_RADIO, "Cartera"], sin: [...ODONTO, "Reportes", "Usuarios del centro"] },
  RADIA_RADIOLOGO: { con: ["Informes", "Estudios"], sin: [...ODONTO, ...SOLO_RADIO, "Cartera", "Reportes"] },
  ALEJANDRO_ADMIN: { con: [...ODONTO, "Facturación", "Catálogo y precios"], sin: ["Usuarios del centro", "Cartera", "Reportes", ...SOLO_RADIO] },
  // Orion es LABORATORIO_DENTAL: trabajos, cartera y convenios por volumen; sin agenda, imágenes ni informes, CRM ni valoraciones.
  ORION_ADMIN: { con: ["Laboratorio", "Órdenes", "Cartera", "Reportes", "Usuarios del centro", "Facturación", "Convenios y tarifas"], sin: [...SOLO_RADIO, ...SIN_LAB] },
  ORION_TECNICO: { con: ["Laboratorio", "Órdenes", "Cartera", "Facturación"], sin: [...SOLO_RADIO, ...SIN_LAB, "Reportes", "Usuarios del centro"] },
};
test.describe("C1 login y menu por rol", () => {
  for (const u of Object.keys(ESPERADO) as Usuario[]) {
    test(`C1 ${u}: /inicio y menu`, async ({ browser }) => {
      const c = await ctxDe(browser, u); const p = await c.newPage(); const v = vigilar(p);
      const r = await p.goto("/inicio"); await listo(p);
      expect(r?.status()).toBe(200); expect(p.url()).toMatch(/\/inicio$/);
      const m = (await menu(p)).map((x) => x.label);
      anotar("menu", { u, menu: m });
      for (const e of ESPERADO[u].con) expect.soft(m, `${u} deberia ver "${e}"`).toContain(e);
      for (const e of ESPERADO[u].sin) expect.soft(m, `${u} NO deberia ver "${e}"`).not.toContain(e);
      expect.soft(v.consola, `consola ${u}: ${v.consola.join(" | ")}`).toEqual([]);
      await foto(p, `C1-inicio-${u}`);
      await c.close();
    });
  }
});

// ================= 2) Recorrido de lectura por todas las rutas del menu =================
const ADMINS: Usuario[] = ["LUMIA_ADMIN", "RADIA_ADMIN", "ALEJANDRO_ADMIN", "ORION_ADMIN"];
const TOP10 = ["/inicio", "/pacientes", "/ordenes", "/agenda", "/estudios", "/informes", "/cartera", "/reportes", "/facturacion", "/seguimiento-doctores", "/laboratorio", "/crm"];
const rutasDe: Partial<Record<Usuario, { href: string; label: string }[]>> = {};
test.describe("C2 recorrido de rutas", () => {
  for (const u of ADMINS) {
    test(`C2 ${u}: escritorio, estado, errores, tiempos y capturas`, async ({ browser }) => {
      test.setTimeout(300_000);
      const c = await ctxDe(browser, u); const p = await c.newPage();
      const rutas = rutasDe[u] ??= await menu(p);
      for (const { href } of rutas) {
        const v = vigilar(p);
        const r = await p.goto(href); await listo(p);
        const t = await timing(p);
        const texto = await p.locator("main").innerText();
        anotar("ruta", { u, href, status: r?.status(), ...t, consola: v.consola, red: v.red, malos: texto.match(MALOS)?.[0] ?? null });
        expect.soft(r?.status(), `${u} ${href} status`).toBe(200);
        expect.soft(texto, `${u} ${href}: pantalla de error`).not.toMatch(PAGINA_ERROR);
        expect.soft(texto, `${u} ${href}: texto sospechoso (NaN/undefined/null)`).not.toMatch(MALOS);
        expect.soft(v.consola, `${u} ${href} consola`).toEqual([]);
        expect.soft(v.red, `${u} ${href} red 4xx/5xx`).toEqual([]);
        if (u === "LUMIA_ADMIN" || TOP10.includes(href)) await foto(p, `C2-${u}${href.replace(/\//g, "_")}`);
      }
      await c.close();
    });
    test(`C2 ${u}: sin scroll horizontal a 390 px`, async ({ browser }) => {
      test.setTimeout(300_000);
      const c = await ctxDe(browser, u, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const p = await c.newPage();
      for (const { href } of (rutasDe[u] ??= await menu(p))) {
        await p.goto(href); await listo(p);
        const x = await exceso(p);
        anotar("movil", { u, href, exceso: x });
        expect.soft(x, `${u} ${href} desborda ${x}px a 390`).toBeLessThanOrEqual(0);
      }
      await c.close();
    });
  }
  test("C2 capturas oscuro e iPhone 390: inicio, reportes, cartera, ficha de paciente (Lumia)", async ({ browser }) => {
    test.setTimeout(240_000);
    const api = await apiDe("LUMIA_ADMIN");
    for (const [modo, o] of [["oscuro", { colorScheme: "dark" as const }], ["iphone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]] as const) {
      const c = await ctxDe(browser, "LUMIA_ADMIN", o); const p = await c.newPage();
      for (const [n, ruta] of [["inicio", "/inicio"], ["reportes", "/reportes"], ["cartera", "/cartera"], ["paciente", "/pacientes/lumia-pac-5"]] as const) {
        await p.goto(ruta); await listo(p);
        if (modo === "oscuro" && n === "inicio") anotar("tema", { dark: await p.evaluate(() => document.documentElement.classList.contains("dark")) });
        await foto(p, `C2-${modo}-${n}`);
      }
      await c.close();
    }
    await api.dispose();
  });
});

// ================= 3) Volumen y coherencia (Lumia) =================
test.describe("C3 volumen y coherencia", () => {
  test("C3 pacientes Lumia: 80, paginacion por 50", async ({ browser }) => {
    const c = await ctxDe(browser, "LUMIA_ADMIN"); const p = await c.newPage();
    await p.goto("/pacientes"); await listo(p);
    expect.soft(await p.getByText(/^80 pacientes$/).count(), "texto '80 pacientes'").toBe(1);
    const a = await p.locator("tbody a").evaluateAll((e) => e.map((x) => x.getAttribute("href")!));
    expect.soft(a.length, "filas pagina 1").toBe(50);
    await p.goto("/pacientes?pagina=2"); await listo(p);
    const b = await p.locator("tbody a").evaluateAll((e) => e.map((x) => x.getAttribute("href")!));
    expect.soft(b.length, "filas pagina 2").toBe(30);
    expect.soft(new Set([...a, ...b]).size, "pacientes unicos").toBe(80);
    anotar("paginacion", { control: await p.getByRole("navigation").allInnerTexts() });
    await c.close();
  });
  test("C3 ordenes Lumia: ~700 con paginacion", async ({ browser }) => {
    const c = await ctxDe(browser, "LUMIA_ADMIN"); const p = await c.newPage();
    const ids = new Set<string>(); let paginas = 0;
    for (let n = 1; n <= 18; n++) {
      await p.goto(n === 1 ? "/ordenes" : `/ordenes?pagina=${n}`); await listo(p);
      const h = await p.locator("tbody a").evaluateAll((e) => e.map((x) => x.getAttribute("href")!).filter((x) => /\/ordenes\/lumia-ord-/.test(x)));
      if (!h.length) break; h.forEach((x) => ids.add(x)); paginas = n;
      if (h.length < 50) break;
    }
    anotar("ordenes", { paginas, total: ids.size });
    expect.soft(ids.size, "ordenes unicas paginando").toBeGreaterThanOrEqual(650);
    expect.soft(ids.size).toBeLessThanOrEqual(760);
    await c.close();
  });
  test("C3 cartera Lumia: suma por responsable = total", async ({ browser }) => {
    const c = await ctxDe(browser, "LUMIA_ADMIN"); const p = await c.newPage();
    await p.goto("/cartera"); await listo(p);
    const main = await p.locator("main").innerText();
    const total = cop(main.match(/Cartera total\s+(\$\s?[\d.]+)/)![1]!);
    const tabla = p.locator("table").filter({ hasText: "Responsable" }).first();
    const filas = await tabla.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent ?? "")));
    const suma = filas.reduce((s, f) => s + cop(f[f.length - 1]!), 0);
    const buckets = [1, 2, 3, 4].map((i) => filas.reduce((s, f) => s + cop(f[i]!), 0));
    const cabecera = [...main.matchAll(/(0–30|31–60|61–90|> 90) días\s+\$\s?(\d{1,3}(?:\.\d{3})*)\d{1,3} %/g)].map((m) => cop(m[2]!));
    anotar("cartera", { total, suma, filas: filas.length, buckets, cabecera });
    expect.soft(suma, `suma por responsable ${suma} vs total ${total}`).toBe(total);
    expect.soft(buckets.reduce((a, b) => a + b, 0)).toBe(total);
    if (cabecera.length === 4) expect.soft(buckets, "tramos tabla vs tramos cabecera").toEqual(cabecera);
    await c.close();
  });
  test("C3 reportes Lumia: 12 meses con datos, sin NaN", async ({ browser }) => {
    const c = await ctxDe(browser, "LUMIA_ADMIN"); const p = await c.newPage();
    await p.goto("/reportes?desde=2025-12-01&hasta=2026-11-25"); await listo(p);
    const t = await p.locator("main").innerText();
    expect.soft(t).not.toMatch(MALOS);
    const titulos = await p.locator("main h2, main h3, main [data-slot='card-title']").allInnerTexts();
    anotar("reportes12m", { titulos, ceros: (t.match(/\$ 0(?![\d.])/g) ?? []).length, svgs: await p.locator("main svg").count(), kpis: t.slice(0, 1200) });
    expect.soft(await p.locator("main svg").count(), "graficas svg").toBeGreaterThan(3);
    await foto(p, "C3-reportes-12m");
    await p.goto("/reportes?desde=2026-11-01&hasta=2026-11-25"); await listo(p);
    await c.close();
  });
  test("C3 inicio Lumia: citas de hoy; seguimiento de doctores con 5 estados", async ({ browser }) => {
    const c = await ctxDe(browser, "LUMIA_ADMIN"); const p = await c.newPage();
    await p.goto("/inicio"); await listo(p);
    const t = await p.locator("main").innerText();
    expect.soft(Number(t.match(/Citas de hoy\s+(\d+)/)?.[1] ?? 0), "citas de hoy").toBeGreaterThan(0);
    await p.goto("/seguimiento-doctores"); await listo(p);
    const estados = await p.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => (tr.querySelectorAll("td")[1]?.textContent ?? "").trim()));
    anotar("semaforo", { estados });
    for (const e of ["Activo", "En riesgo", "Inactivo", "Crítico", "Nuevo"]) expect.soft(estados.some((s) => s.startsWith(e)), `estado ${e} presente`).toBe(true);
    await c.close();
  });
  test("C3 informes emitidos: 3 PDFs descargables", async ({ browser }) => {
    const c = await ctxDe(browser, "LUMIA_ADMIN"); const p = await c.newPage();
    await p.goto("/informes"); await listo(p);
    const ids = await p.locator("tbody tr").filter({ hasText: "Emitido" }).locator("a").evaluateAll((e) => [...new Set(e.map((x) => x.getAttribute("href")!.split("/").pop()!))]);
    anotar("emitidos", { n: ids.length });
    expect(ids.length).toBeGreaterThanOrEqual(3);
    const api = await apiDe("LUMIA_ADMIN");
    for (const id of [ids[0]!, ids[Math.floor(ids.length / 2)]!, ids[ids.length - 1]!]) {
      const r = await api.get(`/api/informes/${id}/pdf`); const b = await r.body();
      anotar("pdf", { id, status: r.status(), tipo: r.headers()["content-type"], bytes: b.length, magic: b.subarray(0, 5).toString() });
      expect.soft(r.status(), `pdf ${id}`).toBe(200);
      expect.soft(r.headers()["content-type"]).toContain("application/pdf");
      expect.soft(b.length, `pdf ${id} bytes`).toBeGreaterThan(5000);
    }
    await api.dispose(); await c.close();
  });
});

// ================= 3b) Estudios, visor, zip, escaneo facial =================
const filaMod = (p: Page, mod: string) => p.locator("tbody tr").filter({ has: p.getByRole("cell", { name: mod, exact: true }) });
async function idsDeFila(p: Page, fila: ReturnType<typeof filaMod>) {
  await fila.first().getByRole("button", { name: "Más acciones" }).click();
  const hrefs = await p.getByRole("menu").locator("a").evaluateAll((e) => e.map((x) => x.getAttribute("href")!));
  await p.keyboard.press("Escape");
  return { zip: hrefs.find((h) => h.includes("/descargar")), superficie: hrefs.find((h) => h.includes("/superficie")), hrefs };
}
async function abrirVisor(ctx: BrowserContext, p: Page, mod: string, n = 0) {
  await p.goto("/estudios"); await listo(p);
  const [v] = await Promise.all([ctx.waitForEvent("page"), filaMod(p, mod).nth(n).getByRole("link", { name: "Abrir visor" }).click()]);
  return v;
}
const omitirTour = async (v: Page) => { const o = v.getByText("Omitir todo"); if (await o.isVisible().catch(() => false)) await o.click(); };
const indiceCorte = (v: Page) => v.getByText(/I:\d+ \(\d+\/\d+\)/).first();
test.describe("C3b estudios y visor", () => {
  test("C3b CBCT: visor en pestana nueva, espanol, canvas con imagen, rueda cambia de corte", async ({ browser }) => {
    test.setTimeout(180_000);
    const c = await ctxDe(browser, "LUMIA_ADMIN"); const p = await c.newPage();
    const malas: string[] = []; c.on("response", (r) => { if (r.url().includes("/dicom-web") && (r.status() >= 500 || r.status() === 401)) malas.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    const v = await abrirVisor(c, p, "CT");
    await expect(v).toHaveURL(/\/visor\/viewer\?StudyInstanceUIDs=/);
    expect.soft(await v.evaluate(() => document.documentElement.lang), "lang visor").toBe("es");
    await expect(v.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await expect(indiceCorte(v)).toBeVisible({ timeout: 60_000 });
    await omitirTour(v); await v.waitForTimeout(2500);
    const png = await v.locator("canvas").first().screenshot();
    anotar("visor-cbct", { canvasBytes: png.length, texto: (await v.locator("body").innerText()).slice(0, 400) });
    expect.soft(png.length, "canvas con contenido").toBeGreaterThan(8000);
    await foto(v, "C3b-visor-cbct", false);
    const antes = await indiceCorte(v).innerText();
    const box = (await v.locator("canvas").first().boundingBox())!;
    await v.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await v.mouse.wheel(0, 300);
    await expect.poll(() => indiceCorte(v).innerText(), { message: "la rueda no cambio de corte" }).not.toBe(antes);
    await foto(v, "C3b-visor-cbct-corte", false);
    expect.soft(malas, "dicom-web 401/5xx").toEqual([]);
    await c.close();
  });
  for (const [nombre, mod] of [["panoramica", "PX"], ["periapical", "IO"], ["cefalometrica", "DX"]] as const) {
    test(`C3b ${nombre}: el visor muestra imagen`, async ({ browser }) => {
      test.setTimeout(120_000);
      const c = await ctxDe(browser, "LUMIA_ADMIN"); const p = await c.newPage();
      const v = await abrirVisor(c, p, mod);
      await expect(v.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
      await omitirTour(v); await v.waitForTimeout(4000);
      const png = await v.locator("canvas").first().screenshot();
      anotar("visor-" + nombre, { canvasBytes: png.length });
      expect.soft(png.length, `${nombre} canvas con contenido`).toBeGreaterThan(8000);
      await foto(v, `C3b-visor-${nombre}`, false);
      await c.close();
    });
  }
  test("C3b zip DICOM y escaneo facial 3D", async ({ browser }) => {
    test.setTimeout(180_000);
    const c = await ctxDe(browser, "LUMIA_ADMIN"); const p = await c.newPage();
    await p.goto("/estudios"); await listo(p);
    const cbct = await idsDeFila(p, filaMod(p, "CT"));
    const api = await apiDe("LUMIA_ADMIN");
    const z = await api.get(cbct.zip!); const zb = await z.body();
    anotar("zip", { ruta: cbct.zip, status: z.status(), tipo: z.headers()["content-type"], bytes: zb.length, magic: zb.subarray(0, 2).toString() });
    expect.soft(z.status()).toBe(200); expect.soft(z.headers()["content-type"]).toContain("zip"); expect.soft(zb.subarray(0, 2).toString()).toBe("PK");
    const ot = filaMod(p, "OT");
    if (!(await ot.count())) { anotar("superficie", { hay: false }); test.info().annotations.push({ type: "NO PROBADO", description: "ningun estudio OT en la lista" }); return; }
    const sup = await idsDeFila(p, ot);
    expect.soft(sup.superficie, "menu con 'Escaneo facial'").toBeTruthy();
    await p.goto(sup.superficie!); await listo(p);
    await expect(p.locator("canvas").first()).toBeVisible({ timeout: 45_000 }); await p.waitForTimeout(4000);
    const png = await p.locator("canvas").first().screenshot();
    const m = await api.get(sup.superficie!.replace("/estudios/", "/api/estudios/"));
    anotar("superficie", { canvasBytes: png.length, malla: m.status(), bytes: (await m.body()).length });
    expect.soft(png.length, "canvas 3D con contenido").toBeGreaterThan(8000);
    expect.soft(m.status()).toBe(200);
    await foto(p, "C3b-superficie", false);
    await api.dispose(); await c.close();
  });
});

// ================= 3c) Alejandro y Orion =================
test.describe("C3c Alejandro y Orion", () => {
  test("C3c Alejandro: foto, odontograma y plan, agenda, valoracion, CRM, laboratorio", async ({ browser }) => {
    test.setTimeout(180_000);
    const api = await apiDe("ALEJANDRO_ADMIN"); const c = await ctxDe(browser, "ALEJANDRO_ADMIN"); const p = await c.newPage();
    const f = await api.get("/pacientes/alejandro-restrepo-pac-8/foto");
    expect.soft(f.status(), "foto paciente 8").toBe(200); expect.soft(f.headers()["content-type"]).toContain("image");
    await p.goto("/pacientes/alejandro-restrepo-pac-8"); await listo(p);
    const img = p.locator("main img").first();
    anotar("foto-ui", { n: await p.locator("main img").count(), natural: await img.evaluate((i: HTMLImageElement) => i.naturalWidth).catch(() => -1) });
    expect.soft(await img.evaluate((i: HTMLImageElement) => i.naturalWidth).catch(() => 0), "foto de perfil cargada en la ficha").toBeGreaterThan(0);
    await p.getByRole("tab", { name: /Módulo clínico/ }).click();
    await expect(p.getByText("Odontograma").first()).toBeVisible(); await expect(p.getByText(/Plan de tratamiento/).first()).toBeVisible();
    await p.waitForTimeout(1500); await foto(p, "C3c-alejandro-odontograma");
    await p.getByText(/Plan de tratamiento/).first().click().catch(() => undefined); await p.waitForTimeout(1000); await foto(p, "C3c-alejandro-plan");
    await p.goto("/agenda"); await listo(p);
    const citas = await p.locator("main").innerText();
    expect.soft((citas.match(/\d\d:\d\d · /g) ?? []).length, "citas hoy en la agenda").toBeGreaterThan(3);
    await p.goto("/valoraciones/alejandro-restrepo-val-2"); await listo(p);
    const imgs = await p.locator("main img").evaluateAll((e) => e.map((i) => ({ src: (i as HTMLImageElement).src.slice(-40), w: (i as HTMLImageElement).naturalWidth })));
    anotar("valoracion", { imgs });
    expect.soft(imgs.length, "fotos en la valoracion recibida").toBeGreaterThanOrEqual(4);
    expect.soft(imgs.filter((i) => i.w === 0).length, "fotos rotas").toBe(0);
    await foto(p, "C3c-alejandro-valoracion");
    await p.goto("/crm/leads"); await listo(p);
    anotar("crm", { texto: (await p.locator("main").innerText()).slice(0, 1500) }); await foto(p, "C3c-alejandro-crm-leads");
    await p.goto("/laboratorio"); await listo(p);
    expect.soft(await p.locator("tbody tr").count(), "casos de laboratorio").toBeGreaterThan(3);
    await api.dispose(); await c.close();
  });
  test("C3c Orion: tablero de laboratorio y cartera por odontologo", async ({ browser }) => {
    const c = await ctxDe(browser, "ORION_ADMIN"); const p = await c.newPage();
    await p.goto("/laboratorio"); await listo(p);
    const t = await p.locator("main").innerText();
    anotar("orion-lab", { filas: await p.locator("tbody tr").count(), vencidos: (t.match(/Vencido/g) ?? []).length, estados: ["Pendiente", "Enviado", "Recibido", "Entregado", "Cancelado"].map((e) => [e, (t.match(new RegExp(e, "g")) ?? []).length]) });
    await foto(p, "C3c-orion-laboratorio");
    expect.soft((t.match(/Vencido/g) ?? []).length, "casos atrasados").toBeGreaterThan(0);
    await p.goto("/cartera"); await listo(p);
    const ct = await p.locator("main").innerText();
    anotar("orion-cartera", { texto: ct.slice(0, 1500), doctores: (ct.match(/Doctor/g) ?? []).length });
    await foto(p, "C3c-orion-cartera");
    await c.close();
  });
});

// ================= 4) Seguridad basica =================
test.describe("C4 seguridad", () => {
  test("C4 Lumia no ve datos de Radia", async () => {
    const radia = await apiDe("RADIA_ADMIN"); const lumia = await apiDe("LUMIA_ADMIN");
    const pr = await radia.get("/pacientes"); const pid = (await pr.text()).match(/\/pacientes\/(radia-pac-\d+)/)?.[1];
    const oid = (await (await radia.get("/ordenes")).text()).match(/\/ordenes\/(radia-ord-\d+)/)?.[1];
    expect(pid, "id de paciente de Radia").toBeTruthy();
    for (const ruta of [`/pacientes/${pid}`, `/ordenes/${oid}`, `/pacientes/${pid}/foto`]) {
      const r = await lumia.get(ruta, { maxRedirects: 0 }); const cuerpo = await r.text();
      anotar("cruce", { ruta, status: r.status() });
      expect.soft([403, 404], `Lumia -> ${ruta}: ${r.status()}`).toContain(r.status());
      expect.soft(cuerpo).not.toMatch(/Radia Centro/);
    }
    // estudio de Radia: se obtiene su id con la sesion de Radia (menu de acciones) y se intenta con la de Lumia
    const b = await (await import("@playwright/test")).chromium.launch({ channel: "chrome" });
    const c = await ctxDe(b, "RADIA_ADMIN"); const p = await c.newPage();
    await p.goto("/estudios"); await listo(p);
    const fila = p.locator("tbody tr").filter({ has: p.getByRole("button", { name: "Más acciones" }) }).first();
    const uid = (await fila.getByRole("link", { name: "Abrir visor" }).getAttribute("href"))!.split("=")[1]!;
    await fila.getByRole("button", { name: "Más acciones" }).click();
    const zip = (await p.getByRole("menu").locator("a").evaluateAll((e) => e.map((x) => x.getAttribute("href")!))).find((h) => h.includes("/descargar"));
    if (zip) { const r = await lumia.get(zip); anotar("cruce", { ruta: zip, status: r.status() }); expect.soft([403, 404], `Lumia -> zip Radia ${r.status()}`).toContain(r.status()); }
    const d = await lumia.get(`/dicom-web/studies?StudyInstanceUID=${uid}`); const dt = await d.text();
    anotar("cruce", { ruta: "dicom-web studies radia", status: d.status(), bytes: dt.length });
    expect.soft(dt.includes("0020000D") && d.status() === 200, "dicom-web de Lumia devuelve estudio de Radia").toBe(false);
    const vv = await lumia.get(`/dicom-web/studies/${uid}/series`); anotar("cruce", { ruta: "series radia", status: vv.status(), bytes: (await vv.text()).length });
    expect.soft(vv.status() >= 400 || (await vv.text()).trim() === "[]" || (await vv.text()).trim() === "", `series de Radia visibles para Lumia (${vv.status()})`).toBe(true);
    await b.close(); await radia.dispose(); await lumia.dispose();
  });
  test("C4 doctor remitente Lumia: sin usuarios/cartera, solo lo suyo", async ({ browser }) => {
    const doc = await apiDe("LUMIA_DOCTOR"); const adm = await apiDe("LUMIA_ADMIN");
    for (const ruta of ["/usuarios", "/cartera", "/reportes", "/seguimiento-doctores", "/doctores", "/facturacion"]) {
      const r = await doc.get(ruta, { maxRedirects: 0 }); const t = await r.text();
      anotar("doctor-ruta", { ruta, status: r.status(), loc: r.headers()["location"] });
      expect.soft([307, 308, 302, 403, 404], `doctor -> ${ruta}: ${r.status()}`).toContain(r.status());
      expect.soft(t, `${ruta} filtra contenido al doctor`).not.toMatch(/Cartera total|Usuarios del centro<\/h1>/);
    }
    // ordenes: solo las del doctor
    const c = await ctxDe(browser, "LUMIA_DOCTOR"); const p = await c.newPage();
    await p.goto("/ordenes"); await listo(p);
    const docs = await p.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => (tr.querySelectorAll("td")[3]?.textContent ?? "").trim()));
    anotar("doctor-ordenes", { n: docs.length, distintos: [...new Set(docs)] });
    expect.soft([...new Set(docs)].filter((d) => d && d !== "—" && !/Marcela Ríos/.test(d)), "ordenes de otros doctores visibles").toEqual([]);
    await p.goto("/estudios"); await listo(p);
    const tt = await p.locator("main").innerText(); anotar("doctor-estudios", { filas: await p.locator("tbody tr").count(), muestra: tt.slice(0, 600) });
    await p.goto("/pacientes"); await listo(p);
    anotar("doctor-pacientes", { texto: (await p.locator("main").innerText()).match(/\d+ pacientes?/)?.[0] });
    const tieneOtros = await p.getByText(/Ricardo Salazar|Catalina Duque|Verónica Osorio/).count();
    expect.soft(tieneOtros, "pacientes del doctor muestran otros doctores remitentes").toBe(0);
    // una orden de otro doctor (admin): la 449 es de Ricardo Salazar; un estudio ajeno via zip
    const r1 = await doc.get("/ordenes/lumia-ord-449", { maxRedirects: 0 }); anotar("doctor-ajena", { ruta: "orden 449", status: r1.status() });
    expect.soft([403, 404], `orden ajena ${r1.status()}`).toContain(r1.status());
    const ap = await ctxDe(browser, "LUMIA_ADMIN"); const pa = await ap.newPage();
    await pa.goto("/estudios"); await listo(pa);
    // Un CT que el doctor NO ve en su propia lista (el volumen de la demo cambia, no se fija un paciente).
    const pd = await c.newPage(); await pd.goto("/estudios"); await listo(pd);
    const propios = await pd.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => (tr.textContent ?? "").trim()));
    const candidatas = pa.locator("tbody tr").filter({ has: pa.getByRole("cell", { name: "CT", exact: true }) });
    const textos = await candidatas.evaluateAll((trs) => trs.map((tr) => (tr.textContent ?? "").trim()));
    const idx = textos.findIndex((t) => !propios.includes(t));
    anotar("doctor-ajena", { ruta: "CT ajeno elegido", idx, candidatas: textos.length });
    expect.soft(idx, "hay un CT ajeno para probar").toBeGreaterThanOrEqual(0);
    const fila = candidatas.nth(Math.max(idx, 0));
    const ajeno = await idsDeFila(pa, fila);
    if (ajeno.zip) { const z = await doc.get(ajeno.zip); anotar("doctor-ajena", { ruta: "zip ajeno", status: z.status() }); expect.soft([403, 404], `zip ajeno ${z.status()}`).toContain(z.status()); }
    const inf = await doc.get("/api/informes/lumia-inf-343/pdf"); anotar("doctor-ajena", { ruta: "pdf ajeno", status: inf.status() });
    expect.soft([403, 404], `pdf de informe ajeno ${inf.status()}`).toContain(inf.status());
    await c.close(); await ap.close(); await doc.dispose(); await adm.dispose();
  });
  test("C4 sin sesion redirige a /ingresar", async () => {
    const anon = await pwRequest.newContext({ baseURL: URL_PROD });
    for (const ruta of ["/inicio", "/pacientes", "/pacientes/lumia-pac-5", "/ordenes", "/estudios", "/informes", "/cartera", "/reportes", "/usuarios", "/agenda"]) {
      const r = await anon.get(ruta, { maxRedirects: 0 });
      anotar("anon", { ruta, status: r.status(), loc: r.headers()["location"] });
      expect.soft(r.headers()["location"] ?? "", `${ruta} -> ${r.status()}`).toMatch(/\/ingresar/);
    }
    // El shell del visor (OHIF estatico) es publico; lo que importa es que sus datos (/dicom-web) exijan sesion.
    const sh = await anon.get("/visor/viewer?StudyInstanceUIDs=1.2.3", { maxRedirects: 0 }); anotar("anon", { ruta: "visor shell", status: sh.status() });
    for (const ruta of ["/dicom-web/studies?limit=5", "/dicom-web/studies?StudyInstanceUID=1.2.3", "/api/estudios/x/descargar", "/api/informes/lumia-inf-344/pdf", "/pacientes/lumia-pac-5/foto"]) {
      const r = await anon.get(ruta, { maxRedirects: 0 });
      anotar("anon", { ruta, status: r.status(), loc: r.headers()["location"] });
      expect.soft([301, 302, 303, 307, 308, 401, 403, 404], `${ruta}: ${r.status()}`).toContain(r.status());
    }
    await anon.dispose();
  });
});
