import type { HsObjectConfig } from "@/lib/hubspot-objects";
import { hubspotFetch } from "@/lib/hubspot/fetch";
import type { PipelineRow, StageSummary } from "./types";

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

export async function mapAndPrepareProperties(
  rows: PipelineRow[],
  headers: string[],
  obj: HsObjectConfig,
  hubspotToken: string,
): Promise<{
  rows: PipelineRow[];
  columnMap: Record<string, string>;
  summary: Omit<StageSummary, "stage" | "durationMs">;
}> {
  const columnMap: Record<string, string> = {};
  for (const h of headers) columnMap[h] = toPropertyName(h);

  const notes: string[] = [];
  let createdCount = 0;
  let existingCount = 0;
  const failures: string[] = [];

  await Promise.all(
    Object.entries(columnMap).map(async ([label, name]) => {
      const res = await hubspotFetch(`https://api.hubapi.com/crm/v3/properties/${obj.apiName}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hubspotToken}`,
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
      if (res.ok) createdCount++;
      else if (res.status === 409) existingCount++;
      else failures.push(`${name} (HTTP ${res.status})`);
    }),
  );

  if (createdCount) notes.push(`${createdCount} HubSpot property/properties created.`);
  if (existingCount) notes.push(`${existingCount} already existed.`);
  if (failures.length) notes.push(`Failed to prepare: ${failures.join(", ")}`);

  const remapped: PipelineRow[] = rows.map((row) => ({
    ...row,
    values: Object.fromEntries(Object.entries(row.values).map(([k, v]) => [columnMap[k] ?? k, v])),
  }));

  return {
    rows: remapped,
    columnMap,
    summary: {
      input: rows.length,
      output: remapped.length,
      modified: remapped.length,
      dropped: [],
      notes,
    },
  };
}
