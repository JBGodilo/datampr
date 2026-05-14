type AirtableTable = { id: string; name: string };
type AirtableMetaResponse = { tables?: AirtableTable[] };
type AirtableError = { error?: { type?: string; message?: string } | string };

export async function POST(request: Request) {
  let token: string;
  let baseId: string;
  try {
    const body = (await request.json()) as { token?: string; baseId?: string };
    token = (body.token ?? "").trim();
    baseId = (body.baseId ?? "").trim();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!token || !baseId) {
    return Response.json({ ok: false, error: "Token and base ID are required." }, { status: 400 });
  }

  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const text = await res.text();
  let data: AirtableMetaResponse & AirtableError = {};
  try {
    data = JSON.parse(text);
  } catch {
    // non-JSON body, fall through to error path
  }

  if (!res.ok) {
    const message =
      typeof data.error === "string"
        ? data.error
        : (data.error?.message ??
          (text.slice(0, 200).replace(/\s+/g, " ").trim() || `Airtable error ${res.status}`));
    return Response.json({ ok: false, error: message }, { status: res.status });
  }

  const tables = (data.tables ?? []).map((t) => ({ id: t.id, name: t.name }));
  return Response.json({ ok: true, tables });
}
