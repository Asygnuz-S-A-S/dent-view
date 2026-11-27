import { VIDEO_MAX_SEG } from "@/lib/valoraciones";

// Guía para el paciente: consejos generales con dibujos simples (decorativos: el texto ya dice todo), guía de video y ejemplos de error.
// Sin hooks ni estado: sirve igual en la captura del paciente y en la página pública /valoracion/guia.
const trazo = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const cara = <><circle cx="32" cy="34" r="12" /><path d="M28 38 Q32 42 36 38" /></>;

const DIBUJOS: Record<string, React.ReactNode> = {
  luz: <><circle cx="10" cy="14" r="5" /><path d="M10 4v2M10 22v2M0 14h2M18 14h2M3 7l1.5 1.5M16.5 19.5L18 21M3 21l1.5-1.5M16.5 8.5L18 7" /><path d="M16 18L26 28" strokeDasharray="3 3" />{cara}</>,
  distancia: <><rect x="6" y="20" width="12" height="22" rx="2" /><path d="M24 31h20" strokeDasharray="2 3" /><path d="M24 28l-3 3 3 3M44 28l3 3-3 3" /><circle cx="52" cy="31" r="7" /><path d="M49 34q3 2 6 0" /></>,
  fondo: <><rect x="8" y="8" width="48" height="48" rx="4" strokeDasharray="4 3" /><circle cx="32" cy="30" r="9" /><path d="M20 52q12-14 24 0" /></>,
  ayuda: <><circle cx="20" cy="22" r="7" /><path d="M8 50q12-22 24 0" /><circle cx="46" cy="26" r="5" /><path d="M38 50q8-16 16 0" /><rect x="34" y="34" width="8" height="12" rx="1.5" /></>,
  lente: <><circle cx="24" cy="32" r="13" /><circle cx="24" cy="32" r="6" /><path d="M46 14l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /><path d="M40 44h16M40 50h16" strokeDasharray="1 4" /></>,
};
const CONSEJOS = [
  { clave: "luz", titulo: "Luz natural de frente", texto: "Ponte frente a una ventana o en un lugar bien iluminado. Evita la luz solo desde atrás o desde arriba." },
  { clave: "distancia", titulo: "Celular a 30-40 cm, a la altura de la boca", texto: "Ni muy cerca ni muy lejos: sostenlo firme y espera a que enfoque antes de tomar la foto." },
  { clave: "fondo", titulo: "Fondo liso", texto: "Una pared clara y sin objetos detrás ayuda a ver mejor tu rostro y tus dientes." },
  { clave: "ayuda", titulo: "Pide ayuda", texto: "Para las fotos dentro de la boca es más fácil si alguien sostiene el celular mientras tú abres." },
  { clave: "lente", titulo: "Lente limpio y labios separados", texto: "Limpia la cámara con un paño suave y separa los labios con los dedos para que se vean los dientes y las encías." },
] as const;
const VIDEO = ["Celular en vertical, de frente", `Dura entre 10 y 20 segundos (máximo ${VIDEO_MAX_SEG})`, "Empieza con la boca en reposo", "Sonríe mostrando los dientes", "Abre y cierra la boca 3 veces, despacio", "Muerde con los dientes juntos y muestra los lados"];

const Dibujo = ({ children, className = "size-14" }: { children: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={`${className} shrink-0 text-primary`} {...trazo}>{children}</svg>
);

/** Tres errores comunes (oscura, cortada, borrosa) dibujados; refuerza por qué se pide repetir la foto. */
export function EjemplosError() {
  const casos = [
    { t: "Oscura", d: "No se distinguen los dientes. Busca más luz.", fig: <><rect x="6" y="14" width="52" height="36" rx="4" fill="currentColor" opacity=".55" /><path d="M20 34q12 10 24 0" /></> },
    { t: "Cortada", d: "Faltan dientes o parte de la zona. Encuadra todo.", fig: <><rect x="6" y="14" width="52" height="36" rx="4" /><path d="M14 40q18-18 36 0" /><path d="M44 14v36" strokeDasharray="3 3" /></> },
    { t: "Borrosa", d: "Movimiento o falta de enfoque. Apoya el celular y espera.", fig: <><rect x="6" y="14" width="52" height="36" rx="4" /><path d="M16 30h32M16 34h32M16 38h32" strokeDasharray="10 4" opacity=".6" /></> },
  ];
  return (
    <ul className="grid gap-2 sm:grid-cols-3" aria-label="Ejemplos de fotos que hay que repetir">
      {casos.map((c) => (
        <li key={c.t} className="flex items-start gap-3 rounded-lg border bg-muted/30 p-2.5 sm:flex-col">
          <Dibujo className="size-12 text-muted-foreground">{c.fig}</Dibujo>
          <div className="space-y-0.5 text-xs"><p className="text-sm font-medium">{c.t}</p><p className="text-muted-foreground">{c.d}</p></div>
        </li>
      ))}
    </ul>
  );
}

/** Bloque plegable «Antes de empezar»: 5 consejos con dibujo, guía del video y errores comunes. `abierta` lo deja desplegado (página pública). */
export function GuiaCaptura({ abierta = false, encabezado = "h2" }: { abierta?: boolean; encabezado?: "h2" | "h3" }) {
  const H = encabezado;
  return (
    <details open={abierta || undefined} className="group rounded-xl border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span>Antes de empezar: 5 consejos para buenas fotos</span>
        <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-5 border-t px-4 py-4">
        <ol className="space-y-3">
          {CONSEJOS.map((c, i) => (
            <li key={c.clave} className="flex items-start gap-3">
              <Dibujo>{DIBUJOS[c.clave]}</Dibujo>
              <div className="min-w-0 space-y-0.5 text-sm"><H className="font-medium"><span className="tabular-nums">{i + 1}.</span> {c.titulo}</H><p className="text-pretty text-muted-foreground">{c.texto}</p></div>
            </li>
          ))}
        </ol>
        <section className="space-y-2">
          <H className="text-sm font-medium">Si vas a grabar el video</H>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{VIDEO.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>
        <section className="space-y-2">
          <H className="text-sm font-medium">Fotos que conviene repetir</H>
          <EjemplosError />
        </section>
      </div>
    </details>
  );
}
