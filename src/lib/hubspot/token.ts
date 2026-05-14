type StoredCred = {
  id?: string;
  config?: { token?: string; isDefault?: boolean };
};

async function fetchHubspotCreds(filter: string): Promise<StoredCred[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/rest/v1/data_source_credentials?${filter}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
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
 * Resolve the HubSpot access token for a specific connection id.
 * Returns null if the id doesn't exist or isn't a HubSpot connection.
 *
 * Server-side only — never expose the token to the browser.
 */
export async function getHubspotTokenById(id: string): Promise<string | null> {
  if (!id) return null;
  const rows = await fetchHubspotCreds(
    `source=eq.hubspot&id=eq.${encodeURIComponent(id)}&select=id,config`,
  );
  return pickToken(rows);
}

/**
 * Resolve the default HubSpot token. Prefers a connection flagged
 * with config.isDefault=true; falls back to the most recently added.
 *
 * Server-side only — never expose the token to the browser.
 */
export async function getActiveHubspotToken(): Promise<string | null> {
  const flagged = await fetchHubspotCreds(
    "source=eq.hubspot&config->>isDefault=eq.true&select=id,config&order=created_at.desc&limit=1",
  );
  const t = pickToken(flagged);
  if (t) return t;
  const fallback = await fetchHubspotCreds(
    "source=eq.hubspot&select=id,config&order=created_at.desc&limit=1",
  );
  return pickToken(fallback);
}

/**
 * Resolve a HubSpot token, preferring the explicit id when given,
 * otherwise the default connection.
 */
export async function resolveHubspotToken(id?: string | null): Promise<string | null> {
  if (id) {
    const byId = await getHubspotTokenById(id);
    if (byId) return byId;
  }
  return getActiveHubspotToken();
}

export const HUBSPOT_NOT_CONFIGURED_ERROR =
  "No HubSpot token configured. Click the HubSpot button in the header to connect.";
