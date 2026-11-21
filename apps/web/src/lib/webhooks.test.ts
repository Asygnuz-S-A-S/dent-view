import { describe, expect, it } from "vitest";
import {
  conConcurrencia, debeDesactivar, decidirTrasIntento, esperaMinutos, firmar, generarSecreto, ipPermitida, MAX_INTENTOS, repartirJusto, resolverDestino, resumirError, validarUrlWebhook, verificarFirma,
} from "./webhooks";

describe("ipPermitida", () => {
  const prohibidas = [
    "127.0.0.1", "127.255.255.254", "0.0.0.0", "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "169.254.0.1",
    "100.64.0.1", "100.127.255.255", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255", "192.0.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1",
    "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::abcd", "febf::1", "fec0::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "::127.0.0.1", "64:ff9b::7f00:1",
    "2001:db8::1", "2001::1", "2002:7f00:1::1", "2002:a9fe:a9fe::", "fe80::1%eth0", "no-es-ip", "", "1.2.3", "::ffff:999.1.1.1",
  ];
  const permitidas = ["8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "198.17.0.1", "198.20.0.1", "223.255.255.255", "2606:4700:4700::1111", "2a00:1450:4001::200e", "::ffff:8.8.8.8", "2002:0808:0808::1"];
  it.each(prohibidas)("rechaza %s", (ip) => expect(ipPermitida(ip)).toBe(false));
  it.each(permitidas)("permite %s", (ip) => expect(ipPermitida(ip)).toBe(true));
  it("con permitirLoopback solo habilita loopback, no redes privadas ni metadato", () => {
    const o = { permitirLoopback: true };
    expect(ipPermitida("127.0.0.1", o) && ipPermitida("::1", o) && ipPermitida("::ffff:127.0.0.1", o)).toBe(true);
    for (const ip of ["10.0.0.1", "169.254.169.254", "192.168.0.1", "fc00::1", "::ffff:10.0.0.1"]) expect(ipPermitida(ip, o)).toBe(false);
  });
});

describe("validarUrlWebhook", () => {
  const ok = (u: string, local = false) => validarUrlWebhook(u, local).ok;
  it("exige https, sin credenciales y puerto estándar", () => {
    expect(ok("https://cliente.example.com/hook")).toBe(true);
    expect(ok("https://cliente.example.com:8443/hook")).toBe(true);
    expect(ok("https://cliente.example.com:8080/hook")).toBe(true);
    expect(ok("http://cliente.example.com/hook")).toBe(false);
    expect(ok("https://u:p@cliente.example.com/hook")).toBe(false);
    expect(ok("https://cliente.example.com:9999/hook")).toBe(false);
    expect(ok("ftp://cliente.example.com")).toBe(false);
    expect(ok("no es url")).toBe(false);
  });
  it("rechaza IP literales internas, incluidas formas ofuscadas que URL normaliza", () => {
    for (const u of ["https://127.0.0.1/", "https://169.254.169.254/latest", "https://[::1]/", "https://2130706433/", "https://0x7f.1/", "https://[::ffff:7f00:1]/", "https://10.1.1.1/", "https://localhost/", "https://intranet/"]) expect(ok(u)).toBe(false);
  });
  it("con permitirLocal acepta http y loopback en cualquier puerto, pero no redes privadas", () => {
    expect(ok("http://localhost:9999/hook", true)).toBe(true);
    expect(ok("http://127.0.0.1:9999/hook", true)).toBe(true);
    expect(ok("http://10.0.0.5:9999/hook", true)).toBe(false);
    expect(ok("http://169.254.169.254/", true)).toBe(false);
  });
});

describe("resolverDestino (anti DNS rebinding)", () => {
  const res = (...a: string[]) => async () => a.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  it("devuelve la IP validada", async () => expect((await resolverDestino("x.example.com", false, res("8.8.8.8"))).address).toBe("8.8.8.8"));
  it("rechaza si el dominio resuelve a una IP interna, o a una pública y otra interna", async () => {
    await expect(resolverDestino("x.example.com", false, res("169.254.169.254"))).rejects.toThrow(/bloqueado/);
    await expect(resolverDestino("x.example.com", false, res("8.8.8.8", "10.0.0.1"))).rejects.toThrow(/bloqueado/);
    await expect(resolverDestino("x.example.com", false, res("::ffff:192.168.0.1"))).rejects.toThrow(/bloqueado/);
  });
  it("rechaza si no resuelve nada", async () => expect(resolverDestino("x.example.com", false, res())).rejects.toThrow());
  it("IP literal no consulta DNS", async () => {
    await expect(resolverDestino("127.0.0.1", false, () => { throw new Error("no debe resolver"); })).rejects.toThrow(/bloqueado/);
  });
});

describe("firma", () => {
  const secreto = generarSecreto();
  const cuerpo = '{"a":1}';
  it("el secreto es whsec_ de 256 bits", () => {
    expect(secreto).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(generarSecreto()).not.toBe(secreto);
  });
  it("verifica la firma vigente y rechaza cuerpo alterado, secreto ajeno, firma mal formada y repetición fuera de 5 min", () => {
    const t = 1_700_000_000;
    const f = firmar(secreto, cuerpo, t);
    expect(f).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
    expect(verificarFirma(secreto, cuerpo, f, t + 299)).toBe(true);
    expect(verificarFirma(secreto, cuerpo, f, t + 301)).toBe(false);
    expect(verificarFirma(secreto, cuerpo, f, t - 301)).toBe(false);
    expect(verificarFirma(secreto, cuerpo + " ", f, t)).toBe(false);
    expect(verificarFirma(generarSecreto(), cuerpo, f, t)).toBe(false);
    expect(verificarFirma(secreto, cuerpo, "basura", t)).toBe(false);
    expect(verificarFirma(secreto, cuerpo, `t=${t},v1=abc`, t)).toBe(false);
  });
});

describe("reintentos", () => {
  const ahora = new Date("2026-01-01T00:00:00Z");
  it("espera exponencial 1, 2, 4, 8… con tope de 1 h", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(esperaMinutos)).toEqual([1, 2, 4, 8, 16, 32, 60, 60]);
  });
  it("2xx entrega; otro código reintenta con la espera; el intento 8 falla", () => {
    expect(decidirTrasIntento({ intentos: 1, codigo: 204, ahora })).toEqual({ estado: "ENTREGADO" });
    expect(decidirTrasIntento({ intentos: 1, codigo: 500, ahora })).toEqual({ estado: "PENDIENTE", proximoIntento: new Date("2026-01-01T00:01:00Z") });
    expect(decidirTrasIntento({ intentos: 3, codigo: null, ahora })).toEqual({ estado: "PENDIENTE", proximoIntento: new Date("2026-01-01T00:04:00Z") });
    expect(decidirTrasIntento({ intentos: 2, codigo: 301, ahora }).estado).toBe("PENDIENTE"); // redirección no es éxito
    expect(decidirTrasIntento({ intentos: MAX_INTENTOS, codigo: 500, ahora })).toEqual({ estado: "FALLIDO" });
    expect(decidirTrasIntento({ intentos: MAX_INTENTOS, codigo: 200, ahora })).toEqual({ estado: "ENTREGADO" });
  });
  it("el resumen de error no filtra secretos y se acota", () => {
    expect(resumirError(new Error("fallo con whsec_abc123-XYZ dentro"))).not.toContain("abc123");
    expect(resumirError(new Error("x".repeat(1000))).length).toBeLessThanOrEqual(300);
  });
});

describe("enviarWebhook (red real contra un receptor local)", () => {
  const cab = { "Content-Type": "application/json" };
  const servir = async (h: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void) => {
    const { createServer } = await import("node:http");
    const s = createServer(h);
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    const port = (s.address() as import("node:net").AddressInfo).port;
    return { url: `http://127.0.0.1:${port}/hook`, cerrar: () => new Promise((r) => s.close(r)) };
  };
  it("envía cuerpo y cabeceras y devuelve el código", async () => {
    let visto = "";
    const s = await servir((req, res) => { req.on("data", (c) => (visto += c)); req.on("end", () => { res.statusCode = 202; res.end(`${req.headers["x-dentview-event"]}`); }); });
    const { enviarWebhook } = await import("./webhooks");
    const r = await enviarWebhook({ url: s.url, cuerpo: '{"a":1}', cabeceras: { ...cab, "X-DentView-Event": "e.x" }, permitirLocal: true });
    expect(r).toEqual({ codigo: 202, respuesta: "e.x" });
    expect(visto).toBe('{"a":1}');
    await s.cerrar();
  });
  it("no sigue redirecciones (devuelve el 302 sin visitar el destino)", async () => {
    let destinoVisitado = false;
    const s = await servir((req, res) => {
      if (req.url === "/hook") { res.statusCode = 302; res.setHeader("Location", "/otro"); res.end(); } else { destinoVisitado = true; res.end(); }
    });
    const { enviarWebhook } = await import("./webhooks");
    expect((await enviarWebhook({ url: s.url, cuerpo: "{}", cabeceras: cab, permitirLocal: true })).codigo).toBe(302);
    expect(destinoVisitado).toBe(false);
    await s.cerrar();
  });
  it("limita la lectura de la respuesta a 64 KB", async () => {
    const s = await servir((_, res) => res.end("x".repeat(500_000)));
    const { enviarWebhook, MAX_RESPUESTA } = await import("./webhooks");
    expect((await enviarWebhook({ url: s.url, cuerpo: "{}", cabeceras: cab, permitirLocal: true })).respuesta.length).toBeLessThanOrEqual(MAX_RESPUESTA);
    await s.cerrar();
  });
  it("corta por tiempo de espera", async () => {
    const s = await servir(() => {});
    const { enviarWebhook } = await import("./webhooks");
    await expect(enviarWebhook({ url: s.url, cuerpo: "{}", cabeceras: cab, permitirLocal: true, timeoutMs: 200 })).rejects.toThrow(/Tiempo de espera/);
    await s.cerrar();
  });
  it("sin el permiso local, rechaza http y loopback antes de conectar", async () => {
    const { enviarWebhook } = await import("./webhooks");
    await expect(enviarWebhook({ url: "http://localhost:9999/x", cuerpo: "{}", cabeceras: cab, permitirLocal: false })).rejects.toThrow();
    await expect(enviarWebhook({ url: "https://169.254.169.254/latest/meta-data", cuerpo: "{}", cabeceras: cab, permitirLocal: true })).rejects.toThrow(/no está permitida/);
  });
});

describe("reparto justo de entregas", () => {
  const e = (id: string, webhookId: string, organizationId = "o1") => ({ id, webhookId, organizationId });
  it("un webhook lento no copa el lote: máximo 2 por webhook, respetando el orden", () => {
    const cola = [e("1", "lento"), e("2", "lento"), e("3", "lento"), e("4", "lento"), e("5", "otro")];
    expect(repartirJusto(cola, { lote: 20 }).map((x) => x.id)).toEqual(["1", "2", "5"]);
  });
  it("máximo 10 por centro y tope del lote", () => {
    const muchos = Array.from({ length: 30 }, (_, i) => e(String(i), `w${i}`, "grande"));
    expect(repartirJusto(muchos, { lote: 20 })).toHaveLength(10);
    const dos = [...muchos, ...Array.from({ length: 30 }, (_, i) => e(`b${i}`, `x${i}`, "chico"))];
    expect(repartirJusto(dos, { lote: 15 })).toHaveLength(15);
  });
});

describe("concurrencia acotada", () => {
  it("nunca excede el límite y procesa todo", async () => {
    let vuelo = 0, pico = 0, hechas = 0;
    await conConcurrencia(Array.from({ length: 12 }, (_, i) => i), 5, async () => {
      pico = Math.max(pico, ++vuelo);
      await new Promise((r) => setTimeout(r, 5));
      vuelo--; hechas++;
    });
    expect(pico).toBe(5);
    expect(hechas).toBe(12);
  });
});

describe("desactivación automática", () => {
  const f = (n: number) => Array(n).fill("FALLIDO");
  it("solo con 20 fallidas consecutivas", () => {
    expect(debeDesactivar(f(19))).toBe(false);
    expect(debeDesactivar(f(20))).toBe(true);
    expect(debeDesactivar([...f(20), "ENTREGADO"])).toBe(true); // el éxito es más antiguo que las 20 más recientes
    expect(debeDesactivar(["ENTREGADO", ...f(25)])).toBe(false); // el éxito más reciente rompe la racha
    expect(debeDesactivar([...f(10), "ENTREGADO", ...f(10)])).toBe(false);
  });
});
