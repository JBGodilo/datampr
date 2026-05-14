import type { HsObjectConfig } from "@/lib/hubspot-objects";
import { hubspotFetch } from "@/lib/hubspot/fetch";
import type { PipelineRow, RowResult } from "./types";

function resolveNameValue(row: Record<string, unknown>, obj: HsObjectConfig): string | null {
  for (const alias of obj.nameAliases) {
    const match = Object.keys(row).find((k) => k.toLowerCase() === alias);
    if (match && row[match]) return String(row[match]);
  }
  return obj.defaultName;
}

export type ImportContext = {
  obj: HsObjectConfig;
  hubspotToken: string;
  pipelineId?: string;
  stageId?: string;
};

export async function importRow(row: PipelineRow, ctx: ImportContext): Promise<RowResult> {
  const properties: Record<string, string> = {};
  for (const [k, v] of Object.entries(row.values)) {
    if (v !== null && v !== undefined && v !== "") {
      properties[k] = String(v);
    }
  }

  if (!properties[ctx.obj.nameProperty]) {
    const fallback = resolveNameValue(row.values, ctx.obj);
    if (fallback) properties[ctx.obj.nameProperty] = fallback;
  }

  if (ctx.obj.supportsPipeline) {
    if (ctx.pipelineId && ctx.obj.pipelineProperty) {
      properties[ctx.obj.pipelineProperty] = ctx.pipelineId;
    }
    if (ctx.stageId && ctx.obj.stageProperty) {
      properties[ctx.obj.stageProperty] = ctx.stageId;
    }
  }

  const res = await hubspotFetch(`https://api.hubapi.com/crm/v3/objects/${ctx.obj.apiName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.hubspotToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties }),
  });

  const text = await res.text();
  let data: { id?: string; message?: string } = {};
  try {
    data = JSON.parse(text);
  } catch {
    // non-JSON error body
  }

  if (!res.ok) {
    const message = data.message ?? text.slice(0, 200).replace(/\s+/g, " ").trim();
    return {
      sourceIndex: row.sourceIndex,
      status: "error",
      message: message || `HubSpot error ${res.status}`,
    };
  }

  return { sourceIndex: row.sourceIndex, status: "ok", hubspotId: data.id };
}
