type StoredCred = {
  id?: string;
  config?: { token?: string; isDefault?: boolean };
};

const SUPA_URL = process.env.SUPABASE_URL ?? "";
const SUPA_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";

async function fetchHubspotCreds(filter: string, userAccessToken: string): Promise<StoredCred[]> {
  if (!SUPA_URL || !SUPA_PUBLISHABLE_KEY || !userAccessToken) return [];
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/data_source_credentials?${filter}`, {
      headers: {
        apikey: SUPA_PUBLISHABLE_KEY,
        Authorization: `Bearer ${userAccessToken}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json()) as StoredCred[];
  } catch {
    return [];
  }
}

function pickToken(rows: StoredCred[]): string | null {
  const token = rows[0]?.config?.token;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

/**
 * Resolve the HubSpot access token for a specific connection id, scoped to
 * the calling user via their access token. Returns null if the id doesn't
 * exist, isn't a HubSpot connection, or doesn't belong to this user.
 *
 * Server-side only — never expose the token to the browser.
 */
export async function getHubspotTokenById(
  id: string,
  userAccessToken: string,
): Promise<string | null> {
  if (!id) return null;
  const rows = await fetchHubspotCreds(
    `source=eq.hubspot&id=eq.${encodeURIComponent(id)}&select=id,config`,
    userAccessToken,
  );
  return pickToken(rows);
}

/**
 * Resolve the calling user's default HubSpot token. Prefers a connection
 * flagged with config.isDefault=true; falls back to the most recently added.
 *
 * Server-side only — never expose the token to the browser.
 */
export async function getActiveHubspotToken(userAccessToken: string): Promise<string | null> {
  const flagged = await fetchHubspotCreds(
    "source=eq.hubspot&config->>isDefault=eq.true&select=id,config&order=created_at.desc&limit=1",
    userAccessToken,
  );
  const t = pickToken(flagged);
  if (t) return t;
  const fallback = await fetchHubspotCreds(
    "source=eq.hubspot&select=id,config&order=created_at.desc&limit=1",
    userAccessToken,
  );
  return pickToken(fallback);
}

/**
 * Resolve a HubSpot token, preferring the explicit id when given, otherwise
 * the user's default connection.
 */
export async function resolveHubspotToken(
  id: string | null | undefined,
  userAccessToken: string,
): Promise<string | null> {
  if (id) {
    const byId = await getHubspotTokenById(id, userAccessToken);
    if (byId) return byId;
  }
  return getActiveHubspotToken(userAccessToken);
}

export const HUBSPOT_NOT_CONFIGURED_ERROR =
  "No HubSpot token configured. Click the HubSpot button in the header to connect.";
