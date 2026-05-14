import { getHsObject, type HsObjectConfig } from "@/lib/hubspot-objects";
import { hubspotFetch } from "@/lib/hubspot/fetch";
import { getActiveHubspotToken, HUBSPOT_NOT_CONFIGURED_ERROR } from "@/lib/hubspot/token";
import { getUserContext, unauthorizedResponse } from "@/lib/supabase/user-context";

function resolveNameValue(row: Record<string, unknown>, obj: HsObjectConfig): string | null {
  for (const alias of obj.nameAliases) {
    const match = Object.keys(row).find((k) => k.toLowerCase() === alias);
    if (match && row[match]) return String(row[match]);
  }
  return obj.defaultName;
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return unauthorizedResponse();

  const token = await getActiveHubspotToken(ctx.accessToken);
  if (!token) {
    return Response.json({ ok: false, error: HUBSPOT_NOT_CONFIGURED_ERROR }, { status: 401 });
  }

  let row: Record<string, unknown>;
  let objectType: string | undefined;
  let pipelineId: string | undefined;
  let stageId: string | undefined;
  try {
    const body = (await request.json()) as {
      row: Record<string, unknown>;
      objectType?: string;
      pipelineId?: string;
      stageId?: string;
    };
    row = body.row;
    objectType = body.objectType;
    pipelineId = body.pipelineId;
    stageId = body.stageId;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const obj = getHsObject(objectType ?? "deals");
  if (!obj) {
    return Response.json(
      { ok: false, error: `Unknown object type: ${objectType}` },
      { status: 400 },
    );
  }

  const properties: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && v !== undefined && v !== "") {
      properties[k] = String(v);
    }
  }

  if (!properties[obj.nameProperty]) {
    const fallback = resolveNameValue(row, obj);
    if (fallback) properties[obj.nameProperty] = fallback;
  }

  if (obj.supportsPipeline) {
    if (pipelineId && obj.pipelineProperty) properties[obj.pipelineProperty] = pipelineId;
    if (stageId && obj.stageProperty) properties[obj.stageProperty] = stageId;
  }

  const hs = await hubspotFetch(`https://api.hubapi.com/crm/v3/objects/${obj.apiName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties }),
  });

  const data = (await hs.json()) as { id?: string; message?: string };

  if (!hs.ok) {
    return Response.json(
      { ok: false, error: data.message ?? `HubSpot error ${hs.status}` },
      { status: hs.status },
    );
  }

  return Response.json({ ok: true, id: data.id });
}
