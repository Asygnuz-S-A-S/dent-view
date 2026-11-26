import { versionApp } from "@/lib/version";

export const metadata = { title: "Ingresar" };
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  const v = versionApp();
  return (
    <>
      {children}
      {/* Pie discreto con la versión desplegada, visible antes de iniciar sesión. */}
      <p className="pointer-events-none fixed inset-x-0 bottom-2 text-center text-[10px] text-muted-foreground" aria-hidden>{v.version} · {v.sha}</p>
    </>
  );
}
