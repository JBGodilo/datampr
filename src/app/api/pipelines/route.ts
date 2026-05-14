import { getHsObject } from "@/lib/hubspot-objects";
import { hubspotFetch } from "@/lib/hubspot/fetch";
import { HUBSPOT_NOT_CONFIGURED_ERROR, resolveHubspotToken } from "@/lib/hubspot/token";
import { getUserContext, unauthorizedResponse } from "@/lib/supabase/user-context";

type HsStage = { id: string; label: string; displayOrder: number };
type HsPipeline = { id: string; label: string; stages: HsStage[] };
type HsResponse = { results: HsPipeline[] };

export async function GET(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return unauthorizedResponse();

  const url = new URL(request.url);
  const connectionId = url.searchParams.get("hubspotConnectionId");
  const token = await resolveHubspotToken(connectionId, ctx.accessToken);
  if (!token) {
    return Response.json({ ok: false, error: HUBSPOT_NOT_CONFIGURED_ERROR }, { status: 401 });
  }

  const objectId = url.searchParams.get("objectType") ?? "deals";
  const obj = getHsObject(objectId);
  if (!obj) {
    return Response.json({ ok: false, error: `Unknown object type: ${objectId}` }, { status: 400 });
  }

  if (!obj.supportsPipeline) {
    return Response.json({ ok: true, pipelines: [] });
  }

  const res = await hubspotFetch(`https://api.hubapi.com/crm/v3/pipelines/${obj.apiName}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    return Response.json(
      { ok: false, error: err.message ?? `HubSpot error ${res.status}` },
      { status: res.status },
    );
  }

  const data = (await res.json()) as HsResponse;
  const pipelines = data.results.map((p) => ({
    id: p.id,
    label: p.label,
    stages: [...p.stages]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((s) => ({ id: s.id, label: s.label })),
  }));

  return Response.json({ ok: true, pipelines });
}
