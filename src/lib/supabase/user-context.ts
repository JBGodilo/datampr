import { createClient } from "./server";

const SUPA_URL = process.env.SUPABASE_URL ?? "";
const SUPA_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";

export type UserContext = {
  userId: string;
  // The user's Supabase JWT. Passed as `Authorization: Bearer <token>` to
  // PostgREST so RLS sees `auth.uid()` matching the user.
  accessToken: string;
};

/**
 * Resolve the calling user's identity + access token from the session cookie.
 * Returns null when the request isn't authenticated. Server-side only.
 */
export async function getUserContext(): Promise<UserContext | null> {
  const supabase = await createClient();
  // getUser() validates the JWT with the Auth server, getSession() then has
  // the (possibly refreshed) access token.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) return null;
  return {
    userId: userData.user.id,
    accessToken: sessionData.session.access_token,
  };
}

export function unauthorizedResponse() {
  return Response.json({ ok: false, error: "You must be signed in to do that." }, { status: 401 });
}

/**
 * Build the headers PostgREST expects when acting on behalf of the user:
 * the publishable apikey (to reach PostgREST) plus the user's JWT (so RLS
 * filters by auth.uid()). The publishable key alone gives `anon`, which has
 * no access after migration 0005.
 */
export function supabaseUserHeaders(
  accessToken: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    apikey: SUPA_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function supabaseRestUrl(): string {
  return SUPA_URL;
}
