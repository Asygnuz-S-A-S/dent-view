import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Filtro rápido por cookie; cada página/ruta vuelve a validar la sesión de verdad.
export function proxy(req: NextRequest) {
  if (!getSessionCookie(req)) return NextResponse.redirect(new URL("/ingresar", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/estudios/:path*"] };
