import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema",
  migrations: { path: "prisma/migrations" },
  // Migraciones con el dueño del esquema; la app se conecta con DATABASE_URL (rol dentview_app sin DDL).
  datasource: { url: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? "" },
});
