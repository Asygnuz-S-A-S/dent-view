import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/organization/access";

const statement = { ...defaultStatements, estudio: ["ver", "gestionar"] } as const;

export const ac = createAccessControl(statement);

export const roles = {
  admin_tenant: ac.newRole({ ...adminAc.statements, estudio: ["ver", "gestionar"] }),
  recepcion: ac.newRole({ estudio: ["ver", "gestionar"] }),
  especialista: ac.newRole({ estudio: ["ver"] }),
  doctor_remitente: ac.newRole({ estudio: ["ver"] }),
};
