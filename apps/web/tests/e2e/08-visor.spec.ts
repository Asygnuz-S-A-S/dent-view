import { expect, test } from "@playwright/test";
import { authFile, CBCT_UID } from "./helpers";

const URL = `/dicom-web/studies?StudyInstanceUID=${CBCT_UID}`;

test.describe("visor DICOMweb protegido por centro", () => {
  test.describe("admin Radex", () => {
    test.use({ storageState: authFile("admin") });
    test("200 sobre el estudio CBCT del centro", async ({ request }) => {
      const r = await request.get(URL);
      expect(r.status()).toBe(200);
    });
  });

  test.describe("admin de otro centro", () => {
    test.use({ storageState: authFile("admin2") });
    test("403 sobre un estudio ajeno", async ({ request }) => {
      expect((await request.get(URL)).status()).toBe(403);
    });
  });

  test.describe("sin sesión", () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test("401 sin autenticar", async ({ request }) => {
      expect((await request.get(URL)).status()).toBe(401);
    });
  });
});
