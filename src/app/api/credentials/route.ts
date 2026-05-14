import {
  getUserContext,
  supabaseRestUrl,
  supabaseUserHeaders,
  unauthorizedResponse,
} from "@/lib/supabase/user-context";

const TABLE = "data_source_credentials";

type SavedCredential = {
  id: string;
  source: string;
  label: string;
  config: Record<string, unknown>;
  created_at: string;
};

async function readSupabaseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  return body.message ?? body.error ?? `Supabase error ${res.status}`;
}

export async function GET(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return unauthorizedResponse();

  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const params = new URLSearchParams({ select: "*", order: "created_at.desc" });
  if (source) params.set("source", `eq.${source}`);

  const res = await fetch(`${supabaseRestUrl()}/rest/v1/${TABLE}?${params.toString()}`, {
    headers: supabaseUserHeaders(ctx.accessToken),
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
  const ctx = await getUserContext();
  if (!ctx) return unauthorizedResponse();

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

  const res = await fetch(`${supabaseRestUrl()}/rest/v1/${TABLE}`, {
    method: "POST",
    headers: supabaseUserHeaders(ctx.accessToken, { Prefer: "return=representation" }),
    body: JSON.stringify({ source, label, config, user_id: ctx.userId }),
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
  const ctx = await getUserContext();
  if (!ctx) return unauthorizedResponse();

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return Response.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  const res = await fetch(`${supabaseRestUrl()}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: supabaseUserHeaders(ctx.accessToken, { Prefer: "return=minimal" }),
  });

  if (!res.ok) {
    return Response.json(
      { ok: false, error: await readSupabaseError(res) },
      { status: res.status },
    );
  }

  return Response.json({ ok: true });
}
