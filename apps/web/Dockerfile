# Contexto de build = raíz del repo:  docker build -f apps/web/Dockerfile .
FROM node:24-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS build
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
RUN npm ci --no-audit --no-fund
COPY apps/web apps/web
COPY packages/db packages/db
# DATABASE_URL de relleno: generate/build no se conectan a la base
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x npm run generate -w @dent-view/db
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x BETTER_AUTH_SECRET=build npm run build -w @dent-view/web

FROM base AS migrador
WORKDIR /migrar
RUN npm init -y >/dev/null && npm install --no-audit --no-fund prisma@7.10.1
COPY packages/db/prisma ./prisma
COPY packages/db/prisma.config.ts ./
COPY infra/postgres/rol-app.sql ./

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static apps/web/.next/static
COPY --from=migrador /migrar /migrar
USER node
EXPOSE 3000
# Solo arranca el servidor con DATABASE_URL (dentview_app). Las migraciones las corre el servicio `migrador` de compose
# (mismo build, command distinto: prisma migrate deploy + rol-app.sql en /migrar) para que web no reciba la credencial del dueño.
CMD ["node", "apps/web/server.js"]
