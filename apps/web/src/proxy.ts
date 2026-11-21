import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Filtro rápido por cookie en /estudios; cada página/ruta vuelve a validar la sesión de verdad.
// Además expone la ruta como x-pathname: los layouts no la reciben y el guard por tipo de centro la necesita.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if ((pathname === "/estudios" || pathname.startsWith("/estudios/")) && !getSessionCookie(req)) {
    return NextResponse.redirect(new URL("/ingresar", req.url));
  }
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

// Sin API, assets ni visor: nunca se bloquean por tipo de centro.
export const config = { matcher: ["/((?!api|_next|visor|.*\\..*).*)"] };
