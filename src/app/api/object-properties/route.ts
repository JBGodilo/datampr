import { getHsObject } from "@/lib/hubspot-objects";
import { hubspotFetch } from "@/lib/hubspot/fetch";
import { HUBSPOT_NOT_CONFIGURED_ERROR, resolveHubspotToken } from "@/lib/hubspot/token";
import { getUserContext, unauthorizedResponse } from "@/lib/supabase/user-context";

type HsProperty = {
  name: string;
  label: string;
  type?: string;
  fieldType?: string;
  hidden?: boolean;
  calculated?: boolean;
  modificationMetadata?: { readOnlyValue?: boolean };
};

export type ObjectProperty = {
  name: string;
  label: string;
  type: string;
  fieldType: string;
};

export type NewPropertyType =
  | "string"
  | "longtext"
  | "number"
  | "date"
  | "datetime"
  | "bool"
  | "enumeration_single"
  | "enumeration_multi";

const PROPERTY_TYPE_MAP: Record<NewPropertyType, { type: string; fieldType: string }> = {
  string: { type: "string", fieldType: "text" },
  longtext: { type: "string", fieldType: "textarea" },
  number: { type: "number", fieldType: "number" },
  date: { type: "date", fieldType: "date" },
  datetime: { type: "datetime", fieldType: "date" },
  bool: { type: "bool", fieldType: "booleancheckbox" },
  enumeration_single: { type: "enumeration", fieldType: "select" },
  enumeration_multi: { type: "enumeration", fieldType: "checkbox" },
};

const PROPERTY_NAME_RE = /^[a-z][a-z0-9_]*$/;

export async function GET(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return unauthorizedResponse();

  const url = new URL(request.url);
  const connectionId = url.searchParams.get("hubspotConnectionId");
  const token = await resolveHubspotToken(connectionId, ctx.accessToken);
  if (!token) {
    return Response.json({ ok: false, error: HUBSPOT_NOT_CONFIGURED_ERROR }, { status: 401 });
  }

  const objectType = url.searchParams.get("objectType");
  const obj = getHsObject(objectType);
  if (!obj) {
    return Response.json(
      { ok: false, error: `Unknown object type: ${objectType}` },
      { status: 400 },
    );
  }

  const res = await hubspotFetch(`https://api.hubapi.com/crm/v3/properties/${obj.apiName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  let data: { results?: HsProperty[]; message?: string } = {};
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    // HubSpot occasionally returns an HTML error page (e.g. invalid token,
    // edge proxy). Fall through with empty data so the error path below fires.
  }

  if (!res.ok) {
    const snippet = data.message ?? text.slice(0, 200).replace(/\s+/g, " ").trim();
    return Response.json(
      { ok: false, error: `HubSpot error ${res.status}: ${snippet}` },
      { status: res.status },
    );
  }

  const properties: ObjectProperty[] = (data.results ?? [])
    .filter((p) => !p.hidden && !p.calculated && !p.modificationMetadata?.readOnlyValue)
    .map((p) => ({
      name: p.name,
      label: p.label,
      type: p.type ?? "string",
      fieldType: p.fieldType ?? "text",
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return Response.json({ ok: true, properties });
}

type NewPropertyOption = { label: string; value: string };

function normalizeOptions(raw: unknown): NewPropertyOption[] | null {
  if (!Array.isArray(raw)) return null;
  const out: NewPropertyOption[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const label = (item as { label?: unknown }).label;
    const value = (item as { value?: unknown }).value;
    if (typeof label !== "string" || typeof value !== "string") continue;
    const l = label.trim();
    const v = value.trim();
    if (!l || !v || seen.has(v)) continue;
    seen.add(v);
    out.push({ label: l, value: v });
  }
  return out;
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return unauthorizedResponse();

  let body: {
    hubspotConnectionId?: unknown;
    objectType?: unknown;
    name?: unknown;
    label?: unknown;
    type?: unknown;
    options?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const connectionId =
    typeof body.hubspotConnectionId === "string" ? body.hubspotConnectionId : null;
  const token = await resolveHubspotToken(connectionId, ctx.accessToken);
  if (!token) {
    return Response.json({ ok: false, error: HUBSPOT_NOT_CONFIGURED_ERROR }, { status: 401 });
  }

  const obj = getHsObject(typeof body.objectType === "string" ? body.objectType : null);
  if (!obj) {
    return Response.json(
      { ok: false, error: `Unknown objectType: ${String(body.objectType)}` },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const type = typeof body.type === "string" ? body.type : "";

  if (!name) return Response.json({ ok: false, error: "name is required." }, { status: 400 });
  if (!PROPERTY_NAME_RE.test(name)) {
    return Response.json(
      {
        ok: false,
        error:
          "name must start with a letter and contain only lowercase letters, digits, or underscores.",
      },
      { status: 400 },
    );
  }
  if (!label) return Response.json({ ok: false, error: "label is required." }, { status: 400 });
  if (!(type in PROPERTY_TYPE_MAP)) {
    return Response.json({ ok: false, error: `Unsupported type: ${type}` }, { status: 400 });
  }

  const mapped = PROPERTY_TYPE_MAP[type as NewPropertyType];
  const isEnum = mapped.type === "enumeration";
  let options: NewPropertyOption[] | null = null;
  if (isEnum) {
    options = normalizeOptions(body.options);
    if (!options || options.length === 0) {
      return Response.json(
        { ok: false, error: "Enumeration properties require at least one option." },
        { status: 400 },
      );
    }
  }

  const payload: Record<string, unknown> = {
    name,
    label,
    type: mapped.type,
    fieldType: mapped.fieldType,
    groupName: obj.groupName,
  };
  if (isEnum && options) {
    payload.options = options.map((o, i) => ({
      label: o.label,
      value: o.value,
      displayOrder: i,
      hidden: false,
    }));
  }

  const res = await hubspotFetch(`https://api.hubapi.com/crm/v3/properties/${obj.apiName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: { name?: string; label?: string; type?: string; fieldType?: string; message?: string } =
    {};
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    // fall through
  }

  if (!res.ok) {
    // HubSpot enforces unique labels per object. When the label we tried to create
    // already exists under a different internal name, transparently reuse it —
    // the caller can then key its imported data to the existing property's name.
    const reused = await maybeReuseConflictingProperty(
      res.status,
      data.message,
      obj.apiName,
      token,
    );
    if (reused) {
      return Response.json({ ok: true, property: reused, reused: true });
    }

    const snippet = data.message ?? text.slice(0, 200).replace(/\s+/g, " ").trim();
    return Response.json(
      { ok: false, error: `HubSpot error ${res.status}: ${snippet}` },
      { status: res.status },
    );
  }

  const property: ObjectProperty = {
    name: data.name ?? name,
    label: data.label ?? label,
    type: data.type ?? mapped.type,
    fieldType: data.fieldType ?? mapped.fieldType,
  };
  return Response.json({ ok: true, property });
}

async function maybeReuseConflictingProperty(
  status: number,
  message: string | undefined,
  apiName: string,
  token: string,
): Promise<ObjectProperty | null> {
  if (status !== 400 || !message) return null;
  const match = /same label as property\s+([a-zA-Z0-9_]+)/.exec(message);
  if (!match) return null;
  const existingName = match[1];
  const res = await hubspotFetch(
    `https://api.hubapi.com/crm/v3/properties/${apiName}/${encodeURIComponent(existingName)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) return null;
  const existing = (await res.json().catch(() => null)) as HsProperty | null;
  if (!existing?.name) return null;
  return {
    name: existing.name,
    label: existing.label ?? existing.name,
    type: existing.type ?? "string",
    fieldType: existing.fieldType ?? "text",
  };
}
