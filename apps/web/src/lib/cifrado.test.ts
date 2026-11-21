import { afterEach, describe, expect, it } from "vitest";
import { cifrar, descifrar, secretoCifrado } from "./cifrado";

describe("secretoCifrado", () => {
  const antes = { c: process.env.CIFRADO_SECRETO, b: process.env.BETTER_AUTH_SECRET };
  afterEach(() => {
    for (const [k, v] of [["CIFRADO_SECRETO", antes.c], ["BETTER_AUTH_SECRET", antes.b]] as const) v === undefined ? delete process.env[k] : (process.env[k] = v);
  });
  it("usa CIFRADO_SECRETO si existe y cae a BETTER_AUTH_SECRET si no (sin invalidar lo ya cifrado)", () => {
    process.env.BETTER_AUTH_SECRET = "auth-secret";
    delete process.env.CIFRADO_SECRETO;
    expect(secretoCifrado()).toBe("auth-secret");
    const previo = cifrar("dato", secretoCifrado()!);
    process.env.CIFRADO_SECRETO = "cifrado-secret";
    expect(secretoCifrado()).toBe("cifrado-secret");
    expect(descifrar(cifrar("dato", secretoCifrado()!), secretoCifrado()!)).toBe("dato");
    expect(() => descifrar(previo, secretoCifrado()!)).toThrow();
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.CIFRADO_SECRETO;
    expect(secretoCifrado()).toBeUndefined();
  });
});
