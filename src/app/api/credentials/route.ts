const SUPA_URL = process.env.SUPABASE_URL ?? "";
const SUPA_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const TABLE = "data_source_credentials";

type SavedCredential = {
  id: string;
  source: string;
  label: string;
  config: Record<string, unknown>;
  created_at: string;
};

function envError() {
  if (!SUPA_URL || !SUPA_KEY) {
    return Response.json(
      { ok: false, error: "SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is not set." },
      { status: 500 },
    );
  }
  return null;
}

function headers(extra: Record<string, string> = {}) {
  return {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function readSupabaseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  return body.message ?? body.error ?? `Supabase error ${res.status}`;
}

export async function GET(request: Request) {
  const err = envError();
  if (err) return err;

  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const params = new URLSearchParams({ select: "*", order: "created_at.desc" });
  if (source) params.set("source", `eq.${source}`);

  const res = await fetch(`${SUPA_URL}/rest/v1/${TABLE}?${params.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });

  if (!res.ok) {
    return Response.json(
      { ok: false, error: await readSupabaseError(res) },
      { status: res.status },
    );
  }

  const credentials = (await res.json()) as SavedCredential[];
  return Response.json({ ok: true, credentials });
}

export async function POST(request: Request) {
  const err = envError();
  if (err) return err;

  let body: { source?: string; label?: string; config?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const source = body.source?.trim();
  const label = body.label?.trim();
  const config = body.config;
  if (!source || !label || !config || typeof config !== "object") {
    return Response.json(
      { ok: false, error: "source, label, and config are required." },
      { status: 400 },
    );
  }

  const res = await fetch(`${SUPA_URL}/rest/v1/${TABLE}`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify({ source, label, config }),
  });

  if (!res.ok) {
    return Response.json(
      { ok: false, error: await readSupabaseError(res) },
      { status: res.status },
    );
  }

  const [credential] = (await res.json()) as SavedCredential[];
  return Response.json({ ok: true, credential });
}

export async function DELETE(request: Request) {
  const err = envError();
  if (err) return err;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return Response.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  const res = await fetch(`${SUPA_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers({ Prefer: "return=minimal" }),
  });

  if (!res.ok) {
    return Response.json(
      { ok: false, error: await readSupabaseError(res) },
      { status: res.status },
    );
  }

  return Response.json({ ok: true });
}
