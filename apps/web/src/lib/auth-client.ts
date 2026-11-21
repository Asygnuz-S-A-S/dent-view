import { adminClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, roles } from "./permisos";

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles }), adminClient(), twoFactorClient()],
});
