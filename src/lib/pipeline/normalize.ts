import type { PipelineRow, StageSummary } from "./types";

const BOM_RE = new RegExp("^\\uFEFF");

function normalizeValue(v: unknown): unknown {
  if (typeof v !== "string") return v;
  // Strip BOM (U+FEFF) if present, trim, collapse internal whitespace.
  const cleaned = v.replace(BOM_RE, "").trim().replace(/\s+/g, " ");
  if (cleaned === "") return null;
  const lower = cleaned.toLowerCase();
  if (lower === "true") return "true";
  if (lower === "false") return "false";
  return cleaned;
}

export function normalize(rows: PipelineRow[]): {
  rows: PipelineRow[];
  summary: Omit<StageSummary, "stage" | "durationMs">;
} {
  let modified = 0;
  const out: PipelineRow[] = rows.map((row) => {
    let rowChanged = false;
    const nextValues: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row.values)) {
      const normalized = normalizeValue(v);
      if (normalized !== v) rowChanged = true;
      nextValues[k] = normalized;
    }
    if (rowChanged) modified++;
    return { ...row, values: nextValues };
  });

  return {
    rows: out,
    summary: {
      input: rows.length,
      output: out.length,
      modified,
      dropped: [],
    },
  };
}
