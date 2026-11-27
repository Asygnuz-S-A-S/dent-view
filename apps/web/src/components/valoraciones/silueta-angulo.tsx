import type { Angulo } from "@/lib/valoraciones";

// Ayuda visual simple por ángulo (trazos con currentColor): qué encuadre se espera, no una foto de ejemplo.
// Es decorativa: la etiqueta de la toma ya está en texto al lado, así que se oculta a lectores de pantalla.
const rostro = <ellipse cx="50" cy="48" rx="26" ry="34" />;
const perfil = "M38 14 C60 12 72 28 70 44 L76 54 L68 56 L68 64 C68 78 56 86 44 84 C34 82 30 70 32 58 C26 40 28 20 38 14 Z";
const arcada = (inferior: boolean) => (
  <>
    <path d={inferior ? "M24 40 C24 78 76 78 76 40" : "M24 60 C24 22 76 22 76 60"} />
    {[0, 1, 2, 3, 4, 5, 6].map((i) => { const x = 28 + i * 7.3; const t = (i - 3) / 3; const y = inferior ? 66 - 22 * (1 - t * t) : 34 + 22 * (1 - t * t); return <line key={i} x1={x} y1={y} x2={x} y2={inferior ? y - 6 : y + 6} />; })}
  </>
);
const dientes = (y: number) => [0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={30 + i * 7.5} y={y} width="6" height="9" rx="1.5" />);

function Dibujo({ angulo }: { angulo: Angulo }) {
  switch (angulo) {
    case "FRONTAL_REPOSO": return <>{rostro}<line x1="40" y1="64" x2="60" y2="64" /><circle cx="40" cy="42" r="1.5" /><circle cx="60" cy="42" r="1.5" /></>;
    case "SONRISA": return <>{rostro}<path d="M36 60 C44 72 56 72 64 60" />{dientes(61)}</>;
    case "LATERAL_DERECHA": return <path d={perfil} />;
    case "LATERAL_IZQUIERDA": return <path d={perfil} transform="translate(100 0) scale(-1 1)" />;
    case "OCLUSAL_SUPERIOR": return arcada(false);
    case "OCLUSAL_INFERIOR": return arcada(true);
    case "INTRAORAL_FRONTAL": return <><path d="M18 50 C30 34 70 34 82 50 C70 68 30 68 18 50 Z" /><line x1="30" y1="50" x2="70" y2="50" />{dientes(41)}</>;
    case "INTRAORAL_DERECHA": return <><path d="M16 50 C30 34 70 34 84 50 C70 68 30 68 16 50 Z" /><line x1="30" y1="50" x2="84" y2="50" /><path d="M84 28 L84 72" strokeDasharray="3 3" /></>;
    case "INTRAORAL_IZQUIERDA": return <><path d="M16 50 C30 34 70 34 84 50 C70 68 30 68 16 50 Z" /><line x1="16" y1="50" x2="70" y2="50" /><path d="M16 28 L16 72" strokeDasharray="3 3" /></>;
    case "ZONA_DOLOR": return <><path d="M34 22 C42 16 58 16 66 22 C72 36 64 52 62 72 C58 82 54 70 50 56 C46 70 42 82 38 72 C36 52 28 36 34 22 Z" /><circle cx="68" cy="30" r="9" strokeDasharray="3 3" /></>;
    case "RADIOGRAFIA": return <><rect x="14" y="26" width="72" height="48" rx="4" />{dientes(32)}{dientes(54)}</>;
    case "VIDEO_APERTURA": return <>{rostro}<ellipse cx="50" cy="64" rx="9" ry="6" /><path d="M44 42 L44 52 L53 47 Z" transform="translate(0 -10)" /></>;
    default: return <><rect x="20" y="32" width="60" height="42" rx="6" /><circle cx="50" cy="53" r="12" /><path d="M38 32 L42 24 H58 L62 32" /></>;
  }
}

export function SiluetaAngulo({ angulo, className }: { angulo: Angulo; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <Dibujo angulo={angulo} />
    </svg>
  );
}
