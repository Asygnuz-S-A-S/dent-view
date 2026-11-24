import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { expect, type Browser } from "@playwright/test";
import { PASSWORD } from "./helpers";

/** SQL de prueba contra el Postgres del stack local (datos ficticios). */
export function sql(consulta: string): string {
  return execFileSync("docker", ["exec", "-i", "dent-view-postgres-1", "psql", "-U", "dentview", "-d", "dentview", "-At", "-q"], { input: consulta, encoding: "utf8" }).trim();
}

export type RolQa = "recepcion" | "especialista";
const correo = (rol: RolQa) => `qa-${rol}@radex.demo`;
const archivo = (rol: RolQa) => `tests/e2e/.auth/qa-${rol}.json`;

/** Crea (si falta) un usuario del centro radex-demo con ese rol, con la misma clave demo que el admin (sin MFA: solo lo exige admin). */
export function asegurarUsuario(rol: RolQa) {
  sql(`do $$
  declare org text; pw text; uid text := 'qa-user-${rol}';
  begin
    select id into org from "Organization" where slug='radex-demo';
    select a.password into pw from "Account" a join "User" u on u.id=a."userId" where u.email='admin@radex.demo' and a."providerId"='credential';
    if not exists (select 1 from "User" where email='${correo(rol)}') then
      insert into "User"(id,name,email,"emailVerified","updatedAt") values (uid,'QA ${rol}','${correo(rol)}',true,now());
      insert into "Account"(id,"accountId","providerId","userId",password,"updatedAt") values ('qa-acc-${rol}',uid,'credential',uid,pw,now());
      insert into "Member"(id,"organizationId","userId",role) values ('qa-mem-${rol}',org,uid,'${rol}');
    end if;
  end $$;`);
}

/** Ruta del estado de sesión del usuario QA; inicia sesión una vez (y reutiliza la sesión si tiene menos de 20 min). */
export async function sesionQa(browser: Browser, rol: RolQa, baseURL: string): Promise<string> {
  asegurarUsuario(rol);
  const f = archivo(rol);
  if (fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < 20 * 60_000) return f;
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  for (let intento = 0; intento < 6; intento++) {
    await page.goto("/ingresar");
    await page.getByLabel("Correo").fill(correo(rol));
    await page.getByLabel("Contraseña").fill(PASSWORD);
    const resp = page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email"));
    await page.getByRole("button", { name: "Ingresar" }).click();
    const status = (await resp).status();
    if (status === 429) { await new Promise((r) => setTimeout(r, 30_000)); continue; }
    expect(status).toBe(200);
    await page.waitForURL((u) => !u.pathname.startsWith("/ingresar"));
    await ctx.storageState({ path: f });
    await ctx.close();
    return f;
  }
  throw new Error(`Login ${rol}: 429 persistente`);
}
