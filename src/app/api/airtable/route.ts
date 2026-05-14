type AirtableRecord = { id: string; fields: Record<string, unknown> };
type AirtableResponse = { records: AirtableRecord[]; offset?: string };
type AirtableError = { error?: { type?: string; message?: string } | string };

function stringifyCell(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v && typeof v === "object" && "url" in (v as Record<string, unknown>)) {
          return String((v as Record<string, unknown>).url);
        }
        if (v && typeof v === "object" && "name" in (v as Record<string, unknown>)) {
          return String((v as Record<string, unknown>).name);
        }
        return String(v);
      })
      .join(", ");
  }
  if (value && typeof value === "object") return JSON.stringify(value);
  return value;
}

export async function POST(request: Request) {
  let token: string;
  let baseId: string;
  let table: string;
  try {
    const body = (await request.json()) as { token?: string; baseId?: string; table?: string };
    token = (body.token ?? "").trim();
    baseId = (body.baseId ?? "").trim();
    table = (body.table ?? "").trim();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!token || !baseId || !table) {
    return Response.json(
      { ok: false, error: "Token, base ID, and table are all required." },
      { status: 400 },
    );
  }

  const rows: Record<string, unknown>[] = [];
  const headerSet = new Set<string>();
  const headers: string[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as AirtableError;
      const message =
        typeof err.error === "string"
          ? err.error
          : (err.error?.message ?? `Airtable error ${res.status}`);
      return Response.json({ ok: false, error: message }, { status: res.status });
    }

    const data = (await res.json()) as AirtableResponse;
    for (const rec of data.records) {
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rec.fields)) {
        if (!headerSet.has(k)) {
          headerSet.add(k);
          headers.push(k);
        }
        row[k] = stringifyCell(v);
      }
      rows.push(row);
    }
    offset = data.offset;
  } while (offset);

  return Response.json({ ok: true, headers, rows });
}
