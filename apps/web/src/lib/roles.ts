// Grupos de roles por módulo (rol = Member.role del centro activo).
export const GESTION = ["admin_tenant", "recepcion"] as const;
export const CLINICOS = ["admin_tenant", "recepcion", "especialista"] as const;
export const ADMIN = ["admin_tenant"] as const;
/** Historia clínica (antecedentes médicos): lectura y escritura solo para roles clínicos con acceso a datos de salud. */
export const MEDICOS = ["admin_tenant", "especialista"] as const;
