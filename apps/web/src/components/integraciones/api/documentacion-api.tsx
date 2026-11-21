import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISOS } from "@/lib/api-token";

const Codigo = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed"><code>{children}</code></pre>
);

const ENDPOINTS: [string, string, string][] = [
  ["GET", "/pacientes · /pacientes/{id}", "pacientes:leer"],
  ["POST", "/pacientes", "pacientes:escribir"],
  ["PATCH", "/pacientes/{id}", "pacientes:escribir"],
  ["GET", "/ordenes · /ordenes/{id}", "ordenes:leer"],
  ["POST", "/ordenes", "ordenes:escribir"],
  ["GET", "/citas · /salas", "citas:leer"],
  ["POST", "/citas", "citas:escribir"],
  ["GET", "/estudios · /estudios/{id}", "estudios:leer"],
  ["GET", "/informes · /informes/{id}/pdf", "informes:leer"],
  ["GET", "/doctores", "doctores:leer"],
  ["GET", "/catalogo", "catalogo:leer"],
];

/** Documentación de la API pública, dentro de /integraciones/api. La especificación completa está en /api/v1/openapi.json. */
export function DocumentacionApi() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentación de la API v1</CardTitle>
        <CardDescription>
          Especificación OpenAPI 3.1: <a className="underline underline-offset-2" href="/api/v1/openapi.json">/api/v1/openapi.json</a>. Fechas ISO 8601 en UTC; montos en COP enteros.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <section className="space-y-2">
          <h3 className="font-medium">Autenticación</h3>
          <p className="text-muted-foreground">Envía el token en cada petición. Cada token da acceso a un solo centro; con un token no se puede ver información de otro. Un token inexistente, vencido o revocado responde siempre el mismo 401.</p>
          <Codigo>{`curl -H "Authorization: Bearer dvk_xxxxxxxx_…" https://TU-DOMINIO/api/v1/pacientes?limite=20`}</Codigo>
        </section>

        <section className="space-y-2">
          <h3 className="font-medium">Permisos por ruta</h3>
          <ul className="divide-y rounded-md border">
            {ENDPOINTS.map(([m, ruta, p]) => (
              <li key={m + ruta} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                <span><code className="mr-2 font-semibold">{m}</code><code>{ruta}</code></span>
                <span className="text-xs text-muted-foreground" title={PERMISOS[p as keyof typeof PERMISOS]}>{p}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">Un permiso de lectura nunca implica escritura. Sin el permiso, la respuesta es 403.</p>
        </section>

        <section className="space-y-2">
          <h3 className="font-medium">Paginación y filtros</h3>
          <p className="text-muted-foreground">Las listas devuelven <code>{`{ datos, siguienteCursor }`}</code>. Pide la siguiente página con <code>?cursor=</code> (opaco, no lo construyas). <code>limite</code> va de 1 a 100 (50 por defecto). <code>actualizadoDesde</code> (ISO 8601) trae solo lo modificado desde esa fecha; en pacientes, citas, catálogo y doctores filtra por fecha de creación.</p>
          <Codigo>{`curl -H "Authorization: Bearer $TOKEN" \\
  "https://TU-DOMINIO/api/v1/ordenes?limite=50&actualizadoDesde=2026-11-01T00:00:00Z"`}</Codigo>
        </section>

        <section className="space-y-2">
          <h3 className="font-medium">Errores</h3>
          <p className="text-muted-foreground">Siempre <code>{`{ "error": { "codigo", "mensaje" } }`}</code>. Códigos HTTP: 400 parámetro inválido, 401 sin autenticar, 403 sin permiso, 404 no existe en tu centro, 409 cruce de sala, 422 cuerpo inválido (también campos desconocidos), 429 límite superado.</p>
          <p className="text-muted-foreground">Límite: 120 peticiones por minuto por token. Cada respuesta trae <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code> y <code>RateLimit-Reset</code>; al superarlo recibes 429 con <code>Retry-After</code>.</p>
        </section>

        <section className="space-y-2">
          <h3 className="font-medium">Idempotencia</h3>
          <p className="text-muted-foreground">En los POST envía <code>Idempotency-Key</code> (hasta 80 caracteres). Repetir la misma petición con la misma clave devuelve la respuesta original (cabecera <code>Idempotent-Replayed: true</code>) sin duplicar; con un cuerpo distinto responde 422. Las claves duran 24 horas.</p>
          <Codigo>{`curl -X POST https://TU-DOMINIO/api/v1/ordenes \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: orden-2026-11-20-0001" \\
  -d '{"pacienteId":"…","doctorCorreo":"doctor@ejemplo.com","entrega":"DIGITAL",
       "servicios":[{"servicioId":"…"}]}'`}</Codigo>
          <p className="text-muted-foreground">Los precios nunca se envían: el servidor los calcula con el catálogo, las tarifas del doctor y los convenios, y los congela en la orden.</p>
        </section>

        <section className="space-y-2">
          <h3 className="font-medium">Ejemplos</h3>
          <Codigo>{`# Buscar un paciente por documento
curl -H "Authorization: Bearer $TOKEN" "https://TU-DOMINIO/api/v1/pacientes?documento=1053123456"

# Crear paciente (si el documento ya existe en el centro devuelve 200 y "creado": false)
curl -X POST https://TU-DOMINIO/api/v1/pacientes -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"tipoDocumento":"CC","numeroDocumento":"1053123456","nombre":"Ana Pérez","celular":"3001234567"}'

# Agendar una cita (hora de Bogotá 07:00–19:00, bloques de 15 min)
curl -X POST https://TU-DOMINIO/api/v1/citas -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"salaId":"…","pacienteId":"…","inicio":"2026-11-23T15:00:00Z","duracion":30}'

# Descargar el PDF de un informe emitido
curl -H "Authorization: Bearer $TOKEN" -o informe.pdf https://TU-DOMINIO/api/v1/informes/ID/pdf`}</Codigo>
          <p className="text-muted-foreground">Los estudios se exponen solo como metadatos y estado; las imágenes DICOM no se descargan por la API.</p>
        </section>
      </CardContent>
    </Card>
  );
}
