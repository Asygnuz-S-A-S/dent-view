import { openapi } from "@/lib/api-openapi";

// Sin credenciales: describe la API, no expone datos.
export const GET = () => Response.json(openapi, { headers: { "Cache-Control": "public, max-age=300" } });
