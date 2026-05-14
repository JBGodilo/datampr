import { getHsObject } from "@/lib/hubspot-objects";
import { getActiveHubspotToken, HUBSPOT_NOT_CONFIGURED_ERROR } from "@/lib/hubspot/token";

function toPropertyName(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/'/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "_$1")
      .slice(0, 100) || "column"
  );
}

export async function POST(request: Request) {
  const token = await getActiveHubspotToken();
  if (!token) {
    return Response.json({ ok: false, error: HUBSPOT_NOT_CONFIGURED_ERROR }, { status: 401 });
  }

  const { headers, objectType } = (await request.json()) as {
    headers: string[];
    objectType?: string;
  };

  const obj = getHsObject(objectType ?? "deals");
  if (!obj) {
    return Response.json({ ok: false, error: `Unknown object type: ${objectType}` }, { status: 400 });
  }

  const columnMap: Record<string, string> = {};
  for (const h of headers) {
    columnMap[h] = toPropertyName(h);
  }

  await Promise.all(
    Object.entries(columnMap).map(async ([label, name]) => {
      const res = await fetch(`https://api.hubapi.com/crm/v3/properties/${obj.apiName}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          label,
          type: "string",
          fieldType: "text",
          groupName: obj.groupName,
        }),
      });
      if (!res.ok && res.status !== 409) {
        console.error(`Failed to create property "${name}" on ${obj.apiName}: HTTP ${res.status}`);
      }
    }),
  );

  return Response.json({ ok: true, columnMap });
}
