// Guía pública de captura (sin datos de paciente ni de centro): se comparte por WhatsApp antes de abrir el enlace de la valoración.
// Es una ruta estática distinta de /valoracion/[token]; no pide código ni sesión.
import Link from "next/link";
import { EjemplosError, GuiaCaptura } from "@/components/valoraciones/guia-captura";
import { SiluetaAngulo } from "@/components/valoraciones/silueta-angulo";
import { ANGULOS, CLAVES_PLANTILLA, INFO_ANGULO, PLANTILLAS_CAPTURA, ordenarTomas } from "@/lib/valoraciones";

export const metadata = { title: "Guía para tus fotos y video", description: "Cómo tomar las fotos y el video de tu valoración virtual.", robots: { index: false, follow: false } };

export default async function GuiaPublica({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams;
  const clave = CLAVES_PLANTILLA.find((k) => k === tipo && k !== "PERSONALIZADA");
  const plantilla = clave ? PLANTILLAS_CAPTURA[clave] : null;
  const tomas = ordenarTomas(plantilla ? plantilla.angulos : ANGULOS.filter((a) => a !== "OTRO"));
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Guía para tus fotos y video</h1>
        <p className="text-sm text-muted-foreground">
          {plantilla ? `Estas son las tomas que suelen pedirse para: ${plantilla.nombre}.` : "Así se toman las fotos y el video de una valoración virtual."} Tu odontólogo te indicará cuáles necesita; con 3 fotos buenas ya puede empezar.
        </p>
      </header>
      <GuiaCaptura abierta />
      <section aria-labelledby="tomas" className="space-y-3">
        <h2 id="tomas" className="text-lg font-semibold">Las tomas, una por una</h2>
        <ul className="space-y-3">
          {tomas.map((a) => (
            <li key={a} className="flex gap-3 rounded-xl border bg-card p-3">
              <SiluetaAngulo angulo={a} className="size-16 shrink-0 text-muted-foreground" />
              <div className="min-w-0 space-y-1 text-sm">
                <h3 className="font-medium">{INFO_ANGULO[a].etiqueta}{INFO_ANGULO[a].opcional && <span className="text-xs font-normal text-muted-foreground"> (opcional)</span>}</h3>
                <p className="text-pretty text-muted-foreground">{INFO_ANGULO[a].instruccion}</p>
                <p className="text-xs text-muted-foreground">Así sí: {INFO_ANGULO[a].bien.join("; ")}. Evita: {INFO_ANGULO[a].evita.join("; ")}.</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="errores" className="space-y-3">
        <h2 id="errores" className="text-lg font-semibold">Fotos que conviene repetir</h2>
        <EjemplosError />
      </section>
      <nav aria-label="Guías por tipo de consulta" className="space-y-2 text-sm">
        <h2 className="font-medium">Ver la guía para otra consulta</h2>
        <ul className="flex flex-wrap gap-2">
          {CLAVES_PLANTILLA.filter((k) => k !== "PERSONALIZADA").map((k) => (
            <li key={k}><Link href={`/valoracion/guia?tipo=${k}`} aria-current={k === clave ? "page" : undefined} className="inline-flex min-h-10 items-center rounded-lg border px-3 underline-offset-4 hover:underline aria-[current=page]:bg-muted aria-[current=page]:font-medium">{PLANTILLAS_CAPTURA[k].nombre}</Link></li>
          ))}
        </ul>
      </nav>
      <p className="text-xs text-muted-foreground">Esta guía es general y no contiene datos personales. Tus fotos solo se suben desde el enlace personal que recibas de tu centro.</p>
    </main>
  );
}
