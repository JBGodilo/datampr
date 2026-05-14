import type { HsObjectId } from "@/lib/hubspot-objects";
import type { ValidationRuleSet } from "@/lib/validators";

const SUPA_URL = process.env.SUPABASE_URL ?? "";
const SUPA_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const TABLE = "object_validation_rules";

const ALLOWED_OBJECT_TYPES: readonly HsObjectId[] = ["contacts", "companies", "deals", "tickets"];
const ALLOWED_FORMATS = new Set(["email", "phone", "url", "company_domain"]);

type SavedRule = {
  id: string;
  object_type: HsObjectId;
  label: string;
  rules: ValidationRuleSet;
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

function isObjectType(v: unknown): v is HsObjectId {
  return typeof v === "string" && (ALLOWED_OBJECT_TYPES as readonly string[]).includes(v);
}

function normalizeRuleSet(raw: unknown): ValidationRuleSet | null {
  if (!raw || typeof raw !== "object") return null;
  const fieldsRaw = (raw as { fields?: unknown }).fields;
  if (!Array.isArray(fieldsRaw)) return null;
  const fields = [] as ValidationRuleSet["fields"];
  for (const f of fieldsRaw) {
    if (!f || typeof f !== "object") continue;
    const name = (f as { name?: unknown }).name;
    if (typeof name !== "string" || !name.trim()) continue;
    const required = Boolean((f as { required?: unknown }).required);
    const format = (f as { format?: unknown }).format;
    const field: ValidationRuleSet["fields"][number] = { name: name.trim(), required };
    if (typeof format === "string" && ALLOWED_FORMATS.has(format)) {
      field.format = format as ValidationRuleSet["fields"][number]["format"];
    }
    fields.push(field);
  }
  return { fields };
}

export async function GET(request: Request) {
  const err = envError();
  if (err) return err;

  const url = new URL(request.url);
  const objectType = url.searchParams.get("object_type");
  const params = new URLSearchParams({ select: "*", order: "created_at.desc" });
  if (objectType) {
    if (!isObjectType(objectType)) {
      return Response.json(
        { ok: false, error: `Unknown object_type: ${objectType}` },
        { status: 400 },
      );
    }
    params.set("object_type", `eq.${objectType}`);
  }

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

  const rules = (await res.json()) as SavedRule[];
  return Response.json({ ok: true, rules });
}

export async function POST(request: Request) {
  const err = envError();
  if (err) return err;

  let body: { object_type?: unknown; label?: unknown; rules?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isObjectType(body.object_type)) {
    return Response.json(
      { ok: false, error: "object_type must be one of contacts, companies, deals, tickets." },
      { status: 400 },
    );
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) {
    return Response.json({ ok: false, error: "label is required." }, { status: 400 });
  }
  const rules = normalizeRuleSet(body.rules);
  if (!rules) {
    return Response.json({ ok: false, error: "rules must be { fields: [...] }." }, { status: 400 });
  }

  const res = await fetch(`${SUPA_URL}/rest/v1/${TABLE}`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify({ object_type: body.object_type, label, rules }),
  });

  if (!res.ok) {
    return Response.json(
      { ok: false, error: await readSupabaseError(res) },
      { status: res.status },
    );
  }

  const [rule] = (await res.json()) as SavedRule[];
  return Response.json({ ok: true, rule });
}

export async function PUT(request: Request) {
  const err = envError();
  if (err) return err;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return Response.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  let body: { label?: unknown; rules?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.label === "string") {
    const label = body.label.trim();
    if (!label) {
      return Response.json({ ok: false, error: "label cannot be empty." }, { status: 400 });
    }
    patch.label = label;
  }
  if (body.rules !== undefined) {
    const rules = normalizeRuleSet(body.rules);
    if (!rules) {
      return Response.json(
        { ok: false, error: "rules must be { fields: [...] }." },
        { status: 400 },
      );
    }
    patch.rules = rules;
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  const res = await fetch(`${SUPA_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    return Response.json(
      { ok: false, error: await readSupabaseError(res) },
      { status: res.status },
    );
  }

  const [rule] = (await res.json()) as SavedRule[];
  return Response.json({ ok: true, rule });
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
