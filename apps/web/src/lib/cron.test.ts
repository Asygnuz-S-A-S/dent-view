import { afterEach, describe, expect, it } from "vitest";
import { cronAutorizado } from "./cron";

const req = (auth?: string) => new Request("http://x/", { method: "POST", headers: auth ? { authorization: auth } : {} });
afterEach(() => { delete process.env.CRON_SECRET; });

describe("cronAutorizado", () => {
  it("falla sin CRON_SECRET aunque el encabezado coincida", () => { expect(cronAutorizado(req("Bearer "))).toBe(false); });
  it("acepta el secreto correcto y rechaza otro de igual o distinta longitud", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(cronAutorizado(req("Bearer s3cret"))).toBe(true);
    expect(cronAutorizado(req("Bearer s3creT"))).toBe(false);
    expect(cronAutorizado(req("Bearer s3cret-mas-largo"))).toBe(false);
    expect(cronAutorizado(req())).toBe(false);
  });
});
