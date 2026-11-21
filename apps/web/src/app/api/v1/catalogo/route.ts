import { prisma } from "@dent-view/db";
import { listarApi } from "@/lib/api-lista";
import { rutaApi } from "@/lib/api-ruta";
import { servicioJson } from "@/lib/api-serializar";

// Catálogo vigente del centro (servicios activos). No incluye tarifas de doctores ni convenios.
export const GET = rutaApi("catalogo:leer", (c) =>
  listarApi(c.url, {
    filtros: { organizationId: c.organizationId, activo: true },
    consulta: (a) => prisma.servicio.findMany(a),
    fecha: (s) => s.creadoEn,
    mapear: servicioJson,
  }),
);
