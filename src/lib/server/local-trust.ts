import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { auth } from "@/lib/auth/server";
import { getSql } from "@/lib/db";

const TEN_YEARS_SECONDS = 60 * 60 * 24 * 365 * 10;

function assertLocalMode(): Request {
  const request = getRequest();
  if (!request || process.env.TALKAI_LOCAL_MODE !== "1") {
    throw new Error("Trusted-device login is only available in the local Talk AI app.");
  }
  const host = new URL(request.url).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new Error("Trusted-device login requires the local Talk AI address.");
  }
  return request;
}

/**
 * Return the already-authenticated Better Auth session token so the local PWA
 * can keep it in this origin's storage. No password is stored. The token stays
 * scoped to this user and can still be revoked by normal sign-out.
 */
export const issueLocalTrustToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const request = assertLocalMode();
    const result = await auth.api.getSession({ headers: request.headers });
    const token = result?.session?.token;
    if (!token || result.user.id !== context.userId) {
      return { ok: false as const, error: "Your current sign-in session could not be trusted." };
    }

    // Existing sessions may have been created before local mode extended the
    // Better Auth lifetime. Extend this exact token immediately rather than
    // waiting for the normal session refresh window.
    const sql = await getSql();
    await sql.query(
      `update "session"
          set "expiresAt" = now() + ($1 * interval '1 second'),
              "updatedAt" = now()
        where "token" = $2 and "userId" = $3`,
      [TEN_YEARS_SECONDS, token, context.userId],
    );

    return { ok: true as const, token };
  });
