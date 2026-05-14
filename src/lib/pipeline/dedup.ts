import type { HsObjectId } from "@/lib/hubspot-objects";
import { hubspotFetch } from "@/lib/hubspot/fetch";
import type { DroppedRow, PipelineRow, StageSummary } from "./types";

// Default dedup key per HubSpot object. The Map stage has run by now, so keys
// here are the HubSpot property names (post-mapping), not original headers.
const DEDUP_KEY: Record<HsObjectId, string> = {
  contacts: "email",
  companies: "domain",
  deals: "dealname",
  tickets: "subject",
};

function pickKey(values: Record<string, unknown>, key: string): string | null {
  const v = values[key];
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  return s === "" ? null : s;
}

export type DedupOptions = { withinBatch: boolean; againstCrm: boolean };

export async function dedup(
  rows: PipelineRow[],
  objectType: HsObjectId,
  hubspotToken: string,
  options: DedupOptions,
): Promise<{ rows: PipelineRow[]; summary: Omit<StageSummary, "stage" | "durationMs"> }> {
  const key = DEDUP_KEY[objectType];
  const notes: string[] = [];
  const dropped: DroppedRow[] = [];
  let kept: PipelineRow[] = rows;

  notes.push(`Key: ${key}`);

  if (options.withinBatch) {
    const seen = new Map<string, number>(); // key -> sourceIndex of first occurrence
    const next: PipelineRow[] = [];
    for (const row of kept) {
      const k = pickKey(row.values, key);
      if (!k) {
        next.push(row);
        continue;
      }
      const firstAt = seen.get(k);
      if (firstAt === undefined) {
        seen.set(k, row.sourceIndex);
        next.push(row);
      } else {
        dropped.push({
          sourceIndex: row.sourceIndex,
          stage: "dedup",
          reasons: [`Duplicate of row ${firstAt} (${key}=${k})`],
        });
      }
    }
    kept = next;
  } else {
    notes.push("In-batch dedup disabled.");
  }

  if (options.againstCrm) {
    const candidates: { key: string; row: PipelineRow }[] = [];
    for (const row of kept) {
      const k = pickKey(row.values, key);
      if (k) candidates.push({ key: k, row });
    }
    if (candidates.length === 0) {
      notes.push("No rows with dedup key value — CRM check skipped.");
    } else {
      const existing = await searchExistingKeys(
        objectType,
        key,
        candidates.map((c) => c.key),
        hubspotToken,
      );
      if (existing === null) {
        notes.push("CRM dedup check failed — proceeding without it.");
      } else {
        const existingSet = new Set(existing.map((s) => s.toLowerCase()));
        const next: PipelineRow[] = [];
        for (const row of kept) {
          const k = pickKey(row.values, key);
          if (k && existingSet.has(k)) {
            dropped.push({
              sourceIndex: row.sourceIndex,
              stage: "dedup",
              reasons: [`Already exists in HubSpot (${key}=${k})`],
            });
          } else {
            next.push(row);
          }
        }
        kept = next;
        notes.push(`CRM dedup checked ${candidates.length} key(s); ${existing.length} match(es).`);
      }
    }
  } else {
    notes.push("CRM dedup disabled.");
  }

  return {
    rows: kept,
    summary: {
      input: rows.length,
      output: kept.length,
      modified: 0,
      dropped,
      notes,
    },
  };
}

async function searchExistingKeys(
  objectType: HsObjectId,
  key: string,
  values: string[],
  token: string,
): Promise<string[] | null> {
  // HubSpot Search API accepts up to 100 values per filter; chunk if larger.
  const chunks: string[][] = [];
  for (let i = 0; i < values.length; i += 100) chunks.push(values.slice(i, i + 100));

  const matched: string[] = [];
  for (const chunk of chunks) {
    const res = await hubspotFetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [{ propertyName: key, operator: "IN", values: chunk }],
          },
        ],
        properties: [key],
        limit: 100,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: { properties?: Record<string, string> }[];
    };
    for (const r of data.results ?? []) {
      const v = r.properties?.[key];
      if (v) matched.push(v);
    }
  }
  return matched;
}
