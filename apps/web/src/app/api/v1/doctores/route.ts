import { prisma } from "@dent-view/db";
import { listarApi } from "@/lib/api-lista";
import { rutaApi } from "@/lib/api-ruta";
import { doctorJson } from "@/lib/api-serializar";

export const GET = rutaApi("doctores:leer", (c) =>
  listarApi(c.url, {
    filtros: { organizationId: c.organizationId, role: "doctor_remitente" },
    campo: "createdAt",
    consulta: (a) => prisma.member.findMany({ ...a, include: { user: { include: { perfilDoctor: true } } } }),
    fecha: (m) => m.createdAt,
    mapear: doctorJson,
  }),
);
