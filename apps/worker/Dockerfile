FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/db packages/db
COPY apps/worker apps/worker
# Lógica compartida con la app (sin dependencias de Next): webhooks (firma, SSRF, eventos), cifrado y conectores a sistemas de pacientes.
COPY apps/web/src/lib/webhooks.ts apps/web/src/lib/webhooks-eventos.ts apps/web/src/lib/cifrado.ts apps/web/src/lib/pacientes-centro.ts apps/web/src/lib/
COPY apps/web/src/lib/integraciones apps/web/src/lib/integraciones
RUN npm ci --workspace @dent-view/worker --include-workspace-root && DATABASE_URL=postgresql://x:x@localhost:5432/x npm run generate -w @dent-view/db
WORKDIR /app/apps/worker
# El worker solo lee /app y escribe en memoria/red (Prisma, S3, Orthanc): corre sin root.
USER node
CMD ["node", "src/index.ts"]
