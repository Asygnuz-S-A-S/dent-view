/** Versión desplegada: la inyecta el flujo de despliegue (APP_VERSION, APP_SHA, APP_BUILT_AT en infra/.env). En local es "local". */
export const versionApp = () => ({
  version: process.env.APP_VERSION || "local",
  sha: process.env.APP_SHA || "dev",
  builtAt: process.env.APP_BUILT_AT || null,
});
