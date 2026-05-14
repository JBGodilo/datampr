import {
  getUserContext,
  supabaseRestUrl,
  supabaseUserHeaders,
  unauthorizedResponse,
} from "@/lib/supabase/user-context";

const TABLE = "data_source_credentials";

type StoredConfig = {
  token?: string;
  portalId?: number;
  uiDomain?: string;
  accountType?: string;
  isDefault?: boolean;
};

type StoredCred = {
  id: string;
  source: string;
  label: string;
  config: StoredConfig;
  created_at: string;
};

type HubspotAccount = { portalId?: number; uiDomain?: string; accountType?: string };

function tokenPreview(token: string): string {
  if (token.length <= 8) return "•".repeat(token.length);
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

function toClient(row: StoredCred) {
  const token = row.config?.token ?? "";
  return {
    id: row.id,
    label: row.label,
    tokenPreview: tokenPreview(token),
    portalId: row.config?.portalId,
    uiDomain: row.config?.uiDomain,
    accountType: row.config?.accountType,
    isDefault: !!row.config?.isDefault,
    created_at: row.created_at,
  };
}

async function fetchAll(accessToken: string): Promise<StoredCred[]> {
  const res = await fetch(
    `${supabaseRestUrl()}/rest/v1/${TABLE}?source=eq.hubspot&select=*&order=created_at.desc`,
    { headers: supabaseUserHeaders(accessToken), cache: "no-store" },
  );
  if (!res.ok) return [];
  return (await res.json()) as StoredCred[];
}

async function fetchById(id: string, accessToken: string): Promise<StoredCred | null> {
  const res = await fetch(
    `${supabaseRestUrl()}/rest/v1/${TABLE}?source=eq.hubspot&id=eq.${encodeURIComponent(id)}&select=*`,
    { headers: supabaseUserHeaders(accessToken), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as StoredCred[];
  return rows[0] ?? null;
}

async function patchConfig(
  id: string,
  nextConfig: StoredConfig,
  accessToken: string,
  nextLabel?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body: Record<string, unknown> = { config: nextConfig };
  if (nextLabel !== undefined) body.label = nextLabel;
  const res = await fetch(`${supabaseRestUrl()}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: supabaseUserHeaders(accessToken, { Prefer: "return=representation" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: `Supabase PATCH ${res.status}: ${text.slice(0, 200).replace(/\s+/g, " ").trim()}`,
    };
  }
  // Verify the row was actually returned — Prefer=return=representation with an empty array
  // means no row matched the filter (e.g. RLS blocked the update without surfacing an error).
  try {
    const rows = (await res.json()) as unknown[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        ok: false,
        error:
          "Supabase accepted the request but did not update any row. Check the table's update permissions / RLS policies for data_source_credentials.",
      };
    }
  } catch {
    // No JSON body returned — treat as success since the HTTP status was ok.
  }
  return { ok: true };
}

async function clearAllDefaults(
  accessToken: string,
  except?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await fetchAll(accessToken);
  for (const r of rows) {
    if (r.id === except || !r.config?.isDefault) continue;
    const result = await patchConfig(r.id, { ...r.config, isDefault: false }, accessToken);
    if (!result.ok) return result;
  }
  return { ok: true };
}

async function ensureSomeDefault(accessToken: string): Promise<void> {
  const rows = await fetchAll(accessToken);
  if (rows.length === 0) return;
  if (rows.some((r) => r.config?.isDefault)) return;
  const first = rows[0];
  await patchConfig(first.id, { ...first.config, isDefault: true }, accessToken);
}

async function validateToken(
  token: string,
): Promise<{ ok: true; account: HubspotAccount } | { ok: false; error: string }> {
  const res = await fetch("https://api.hubapi.com/account-info/v3/details", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const text = await res.text();
  let body: HubspotAccount & { message?: string } = {};
  try {
    body = JSON.parse(text);
  } catch {
    // ignore
  }
  if (!res.ok) {
    const msg = body.message ?? text.slice(0, 200).replace(/\s+/g, " ").trim();
    return { ok: false, error: msg || `HubSpot error ${res.status}` };
  }
  return {
    ok: true,
    account: {
      portalId: body.portalId,
      uiDomain: body.uiDomain,
      accountType: body.accountType,
    },
  };
}

export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return unauthorizedResponse();

  const rows = await fetchAll(ctx.accessToken);
  return Response.json({ ok: true, connections: rows.map(toClient) });
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return unauthorizedResponse();

  let body: { token?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return Response.json({ ok: false, error: "token is required." }, { status: 400 });
  }
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : "HubSpot";

  const check = await validateToken(token);
  if (!check.ok) {
    return Response.json(
      { ok: false, error: `HubSpot rejected the token: ${check.error}` },
      { status: 400 },
    );
  }

  const existing = await fetchAll(ctx.accessToken);
  // If this portalId already exists for this user, replace its token + label rather than duplicating.
  const dupe = check.account.portalId
    ? existing.find((r) => r.config?.portalId === check.account.portalId)
    : undefined;

  if (dupe) {
    const nextConfig: StoredConfig = {
      ...dupe.config,
      token,
      portalId: check.account.portalId,
      uiDomain: check.account.uiDomain,
      accountType: check.account.accountType,
    };
    const updateResult = await patchConfig(dupe.id, nextConfig, ctx.accessToken, label);
    if (!updateResult.ok) {
      return Response.json({ ok: false, error: updateResult.error }, { status: 500 });
    }
    const refreshed = await fetchById(dupe.id, ctx.accessToken);
    if (!refreshed) {
      return Response.json({ ok: false, error: "Failed to read back updated connection." });
    }
    return Response.json({
      ok: true,
      connection: toClient(refreshed),
      account: check.account,
      replaced: true,
    });
  }

  const isFirst = existing.length === 0;
  const insertRes = await fetch(`${supabaseRestUrl()}/rest/v1/${TABLE}`, {
    method: "POST",
    headers: supabaseUserHeaders(ctx.accessToken, { Prefer: "return=representation" }),
    body: JSON.stringify({
      source: "hubspot",
      label,
      user_id: ctx.userId,
      config: {
        token,
        portalId: check.account.portalId,
        uiDomain: check.account.uiDomain,
        accountType: check.account.accountType,
        isDefault: isFirst,
      } satisfies StoredConfig,
    }),
  });

  if (!insertRes.ok) {
    const text = await insertRes.text().catch(() => "");
    return Response.json(
      { ok: false, error: `Supabase error ${insertRes.status}: ${text.slice(0, 200)}` },
      { status: insertRes.status },
    );
  }

  const [row] = (await insertRes.json()) as StoredCred[];
  return Response.json({
    ok: true,
    connection: toClient(row),
    account: check.account,
  });
}

export async function PATCH(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return unauthorizedResponse();

  let body: { id?: unknown; isDefault?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return Response.json({ ok: false, error: "id is required." }, { status: 400 });
  }
  if (body.isDefault !== true) {
    return Response.json(
      { ok: false, error: "Only isDefault:true is supported." },
      { status: 400 },
    );
  }

  const row = await fetchById(id, ctx.accessToken);
  if (!row) {
    return Response.json({ ok: false, error: "Connection not found." }, { status: 404 });
  }

  const clearResult = await clearAllDefaults(ctx.accessToken, id);
  if (!clearResult.ok) {
    return Response.json({ ok: false, error: clearResult.error }, { status: 500 });
  }
  const setResult = await patchConfig(id, { ...row.config, isDefault: true }, ctx.accessToken);
  if (!setResult.ok) {
    return Response.json({ ok: false, error: setResult.error }, { status: 500 });
  }
  const updated = await fetchById(id, ctx.accessToken);
  return Response.json({ ok: true, connection: updated ? toClient(updated) : null });
}

export async function DELETE(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return unauthorizedResponse();

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    // Legacy behavior: delete all HubSpot connections (for this user) if no id given.
    await fetch(`${supabaseRestUrl()}/rest/v1/${TABLE}?source=eq.hubspot`, {
      method: "DELETE",
      headers: supabaseUserHeaders(ctx.accessToken, { Prefer: "return=minimal" }),
    });
    return Response.json({ ok: true });
  }

  const res = await fetch(
    `${supabaseRestUrl()}/rest/v1/${TABLE}?source=eq.hubspot&id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: supabaseUserHeaders(ctx.accessToken, { Prefer: "return=minimal" }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return Response.json(
      { ok: false, error: `Supabase error ${res.status}: ${text.slice(0, 200)}` },
      { status: res.status },
    );
  }

  await ensureSomeDefault(ctx.accessToken);
  return Response.json({ ok: true });
}
