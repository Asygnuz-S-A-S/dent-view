import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EJEMPLO = `import { createHmac, timingSafeEqual } from "node:crypto";

// cuerpo: el cuerpo CRUDO de la petición (string), sin volver a serializar el JSON.
export function verificar(cuerpo, cabeceraFirma, secreto, toleranciaSeg = 300) {
  const p = Object.fromEntries(cabeceraFirma.split(",").map((x) => x.trim().split("=")));
  const t = Number(p.t);
  if (!Number.isInteger(t) || !p.v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranciaSeg) return false; // repetición
  const esperado = createHmac("sha256", secreto).update(\`\${t}.\${cuerpo}\`).digest("hex");
  const a = Buffer.from(esperado), b = Buffer.from(p.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Express: app.post("/dentview", express.raw({ type: "*/*" }), (req, res) => {
//   const ok = verificar(req.body.toString("utf8"), req.get("X-DentView-Signature") ?? "", process.env.DENTVIEW_WEBHOOK_SECRET);
//   if (!ok) return res.sendStatus(400);
//   // Deduplica por req.get("X-DentView-Delivery"): un reintento trae el mismo id.
//   res.sendStatus(200); // cualquier 2xx = recibido
// });`;

export function GuiaVerificacion() {
  return (
    <Card>
      <CardHeader><CardTitle>Cómo verificar la firma</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="list-disc space-y-1 pl-5">
          <li><code className="rounded bg-muted px-1">X-DentView-Event</code>: nombre del evento. <code className="rounded bg-muted px-1">X-DentView-Delivery</code>: id único de la entrega, úsalo para deduplicar.</li>
          <li><code className="rounded bg-muted px-1">X-DentView-Signature: t=&lt;unix&gt;,v1=&lt;HMAC-SHA256 hex de &quot;&lt;t&gt;.&lt;cuerpo&gt;&quot;&gt;</code> con tu secreto <code className="rounded bg-muted px-1">whsec_…</code>. Rechaza si <code>t</code> difiere más de 5 minutos de tu reloj.</li>
          <li>Responde con cualquier 2xx en menos de 10 s. Si no, se reintenta a los 1, 2, 4, 8… minutos (tope 1 h) hasta 8 intentos. No se siguen redirecciones.</li>
          <li>El payload es mínimo: <code className="rounded bg-muted px-1">{"{ id, evento, version, creadoEn, centro, datos }"}</code>, solo ids, estados y, para casar registros, tipo y número de documento. Nunca contenido clínico ni enlaces; consulta el detalle con la API.</li>
        </ul>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{EJEMPLO}</pre>
      </CardContent>
    </Card>
  );
}
