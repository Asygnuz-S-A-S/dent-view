import { type Page, expect } from "@playwright/test";

export const PASSWORD = "dentview-demo-2026";
export const ROLES = {
  admin: "admin@radex.demo",
  admin2: "admin@radex2.demo",
  doctor: "doctor@pepito.demo",
  superadmin: "superadmin@dentview.demo",
} as const;
export type Rol = keyof typeof ROLES;
export const authFile = (r: Rol) => `tests/e2e/.auth/${r}.json`;
export const CBCT_UID = "1.2.826.0.1.3680043.8.498.78182257232867113345810282580024747876";

// Estado compartido entre specs (los specs corren en orden alfabético, workers: 1).
import fs from "node:fs";
const ESTADO = "tests/e2e/.auth/estado.json";
export type Estado = {
  doc?: string; nombre?: string; pacienteId?: string; ordenId?: string; ordenNumero?: string; ordenConvenioId?: string; informeId?: string;
  codigo?: string; facturaId?: string; citaHora?: string;
};
export const leerEstado = (): Estado => (fs.existsSync(ESTADO) ? JSON.parse(fs.readFileSync(ESTADO, "utf8")) : {});
export const guardarEstado = (p: Estado) => fs.writeFileSync(ESTADO, JSON.stringify({ ...leerEstado(), ...p }, null, 2));

export async function sinErrorDeApp(page: Page) {
  await expect(page.getByText(/Application error/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}
