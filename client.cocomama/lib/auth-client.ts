import { createAuthClient } from "better-auth/react";
import { emailOTPClient, magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL:
    process.env.NEXT_PUBLIC_AUTH_BASE_URL ??
    (typeof window === "undefined"
      ? "http://localhost:3001/api/auth"
      : `${window.location.origin}/api/auth`),
  plugins: [emailOTPClient(), magicLinkClient()],
});

export type AuthClientSession = Awaited<
  ReturnType<typeof authClient.getSession>
>["data"];
