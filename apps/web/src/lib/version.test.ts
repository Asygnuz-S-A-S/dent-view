import { afterEach, describe, expect, it } from "vitest";
import { versionApp } from "./version";

describe("versionApp", () => {
  afterEach(() => { delete process.env.APP_VERSION; delete process.env.APP_SHA; delete process.env.APP_BUILT_AT; });
  it("en local es 'local'", () => expect(versionApp()).toEqual({ version: "local", sha: "dev", builtAt: null }));
  it("usa lo que inyecta el despliegue", () => {
    process.env.APP_VERSION = "2026.11.26-r45"; process.env.APP_SHA = "a1b2c3d"; process.env.APP_BUILT_AT = "2026-11-26T10:00:00Z";
    expect(versionApp()).toEqual({ version: "2026.11.26-r45", sha: "a1b2c3d", builtAt: "2026-11-26T10:00:00Z" });
  });
});
